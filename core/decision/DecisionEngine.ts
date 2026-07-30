/**
 * DECISION ENGINE — deterministic rule engine (ADR-001/§4). Zero LLM, zero
 * probability, identical input -> identical output. Rule shapes + DSL live in
 * shared/rules (so apps author rules without importing this engine, ADR-009).
 */

import {
  RuleId,
  WorkflowDefId,
  CountryCode,
  TrustLevel,
  createRuleId,
  createWorkflowDefId,
  SemVer,
} from "../../shared/types";

import { IDecisionPort, DecisionInput, DecisionOutcome } from "./ports";

import { RuleBuilder } from "../../shared/rules";
import type { Rule, Condition } from "../../shared/rules";
export { RuleBuilder } from "../../shared/rules";
export type { Rule, Condition } from "../../shared/rules";

/**
 * Rule compilation — resolved at engine initialization
 * Prevents runtime conflicts
 */
interface CompiledRuleSet {
  rules: Rule[];
  byPriority: Map<number, Rule[]>;
  lastCompiled: Date;
}

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

interface IRuleStorage {
  getRule(id: RuleId): Promise<Rule | null>;
  listRules(enabled?: boolean): Promise<Rule[]>;
  saveRule(rule: Rule): Promise<void>;
}

// ============================================================================
// DECISION ENGINE
// ============================================================================

export class DecisionEngine implements IDecisionPort {
  private compiledRules: CompiledRuleSet | null = null;

  constructor(private storage: IRuleStorage) {}

  /**
   * Initialize engine — compile and validate rules
   * Call once on startup
   */
  async initialize(): Promise<void> {
    const rules = await this.storage.listRules(true);
    this.validateRules(rules);
    this.compiledRules = this.compileRules(rules);
  }

  /**
   * Match rules and return outcome
   * Deterministic: same input = same output
   */
  async matchRules(input: DecisionInput): Promise<DecisionOutcome> {
    if (!this.compiledRules) {
      throw new Error("DecisionEngine not initialized. Call initialize() first.");
    }

    // Iterate by priority (highest first)
    const priorities = Array.from(this.compiledRules.byPriority.keys()).sort((a, b) => b - a);

    for (const priority of priorities) {
      const rulesAtPriority = this.compiledRules.byPriority.get(priority)!;

      for (const rule of rulesAtPriority) {
        if (this.matchesConditions(rule.conditions, input)) {
          return {
            workflowDefId: rule.outcome.workflowDefId,
            fallbackTrustLevel: rule.outcome.fallbackTrustLevel,
            reasoning: rule.outcome.reasoning,
            matchedRuleId: rule.id,
            matchedRuleVersion: rule.version
          };
        }
      }
    }

    // No rule matched — return fallback
    return {
      fallbackTrustLevel: TrustLevel.T4_FALLBACK
    };
  }

  // ========================================================================
  // INTERNAL LOGIC
  // ========================================================================

  /**
   * Evaluate all conditions
   * All must pass (AND logic)
   */
  private matchesConditions(conditions: Condition[], input: DecisionInput): boolean {
    return conditions.every(cond => this.evaluateCondition(cond, input));
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(condition: Condition, input: DecisionInput): boolean {
    const value = this.getValueByPath(condition.path, input);

    switch (condition.operator) {
      case "eq":
        return value === condition.value;
      case "neq":
        return value !== condition.value;
      case "in":
        return Array.isArray(condition.value) && (condition.value as unknown[]).includes(value);
      case "nin":
        return Array.isArray(condition.value) && !(condition.value as unknown[]).includes(value);
      case "gt":
        return Number(value) > Number(condition.value);
      case "lt":
        return Number(value) < Number(condition.value);
      case "gte":
        return Number(value) >= Number(condition.value);
      case "lte":
        return Number(value) <= Number(condition.value);
      default:
        return false;
    }
  }

  /**
   * Navigate object by dot-notation path
   */
  private getValueByPath(path: string, obj: unknown): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === "object") {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  // ========================================================================
  // BUILD-TIME VALIDATION
  // ========================================================================

  /**
   * Validate rule set for conflicts and issues
   * Throws if problems found — fails fast at init
   */
  private validateRules(rules: Rule[]): void {
    const priorities = new Map<number, Rule[]>();

    // Group by priority
    for (const rule of rules) {
      if (!priorities.has(rule.priority)) {
        priorities.set(rule.priority, []);
      }
      priorities.get(rule.priority)!.push(rule);
    }

    // R6 / Domain Model §4: "ties = build-time error, not a runtime surprise."
    // Two rules at the SAME priority are ambiguous if some input can match BOTH
    // — the engine has no deterministic tiebreak. M2.5 upgrades this from the
    // identical-conditions-only check to full SEMANTIC overlap: we PROVE overlap
    // by constructing a concrete witness input and verifying it against both
    // rules with the real matcher (matchesConditions). Because the witness is
    // verified, there are no false-positive errors — if we cannot construct one,
    // we do not claim overlap. Proven overlap with DIFFERENT outcomes is a hard
    // error (real ambiguity); with the SAME outcome it is a benign tie (warn).
    const conditionKey = (r: Rule): string =>
      JSON.stringify([...r.conditions].map((c) => [c.path, c.operator, c.value]).sort());

    for (const [priority, rulesAtPriority] of priorities) {
      if (rulesAtPriority.length <= 1) continue;

      for (let i = 0; i < rulesAtPriority.length; i++) {
        for (let j = i + 1; j < rulesAtPriority.length; j++) {
          const a = rulesAtPriority[i];
          const b = rulesAtPriority[j];

          const identical = conditionKey(a) === conditionKey(b);
          const witness = this.findOverlapWitness(a, b);
          if (!identical && !witness) continue; // provably (or unprovably) non-overlapping

          if (this.sameOutcome(a, b)) {
            console.warn(
              `[DecisionEngine] Rules ${a.id} and ${b.id} share priority ${priority} and ` +
              `overlap, but resolve to the same outcome — benign tie. Consider distinct ` +
              `priorities to make ordering explicit.`
            );
            continue;
          }

          throw new Error(
            `[DecisionEngine] Rule conflict: ${a.id} and ${b.id} share priority ${priority} ` +
            `and ${identical ? "have identical conditions" : "provably overlap"} ` +
            `(e.g. input ${JSON.stringify(witness ?? {})} matches both) yet resolve to ` +
            `DIFFERENT outcomes — the result is ambiguous. Give them distinct priorities or ` +
            `mutually exclusive conditions (Domain Model §4).`
          );
        }
      }
    }
  }

  /** Two rules have the same outcome when they route to the same workflow (or
   *  the same fallback trust level). Overlap only matters when outcomes differ. */
  private sameOutcome(a: Rule, b: Rule): boolean {
    return (
      a.outcome.workflowDefId === b.outcome.workflowDefId &&
      a.outcome.fallbackTrustLevel === b.outcome.fallbackTrustLevel
    );
  }

  /**
   * Try to construct an input that satisfies BOTH rules' conditions, proving
   * they overlap. Returns the witness input, or null if none was found.
   *
   * Sound-by-construction: candidate values are drawn from the literals and
   * numeric bounds actually used in the conditions, then the assembled input is
   * VERIFIED with matchesConditions — so a returned witness is a real one, and a
   * null never causes a false error (we simply don't claim overlap).
   */
  private findOverlapWitness(a: Rule, b: Rule): DecisionInput | null {
    const all = [...a.conditions, ...b.conditions];
    const paths = [...new Set(all.map((c) => c.path))];

    const NUMERIC = new Set(["gt", "lt", "gte", "lte"]);
    const SENTINEL = "__ge_witness_sentinel__";

    const witness: Record<string, unknown> = {};
    for (const path of paths) {
      const conds = all.filter((c) => c.path === path);

      // Candidate pool: every literal mentioned, plus numeric probes around each
      // bound, plus a sentinel for paths constrained only by neq/nin.
      const candidates: unknown[] = [SENTINEL, 0];
      for (const c of conds) {
        if (Array.isArray(c.value)) candidates.push(...c.value);
        else candidates.push(c.value);
        if (NUMERIC.has(c.operator)) {
          const n = Number(c.value);
          if (!Number.isNaN(n)) candidates.push(n - 1, n, n + 1);
        }
      }

      // Pick a candidate satisfying every condition on this path (both rules).
      const pick = candidates.find((cand) =>
        conds.every((c) => this.evaluateCondition(c, this.singletonInput(path, cand)))
      );
      if (pick === undefined) return null; // this path is unsatisfiable → disjoint
      this.setByPath(witness, path, pick);
    }

    // Verify the assembled witness against BOTH rules with the real matcher.
    // The witness is a synthetic partial input (only constrained paths set), so
    // it is not a full DecisionInput — the matcher only reads the paths present.
    const input = witness as unknown as DecisionInput;
    return this.matchesConditions(a.conditions, input) && this.matchesConditions(b.conditions, input)
      ? input
      : null;
  }

  /** Build an input object with a single dot-path set (for per-path candidate testing). */
  private singletonInput(path: string, value: unknown): DecisionInput {
    const obj: Record<string, unknown> = {};
    this.setByPath(obj, path, value);
    return obj as unknown as DecisionInput;
  }

  /** Set a value at a dot-notation path, creating intermediate objects. */
  private setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let cur = obj;
    for (let k = 0; k < parts.length - 1; k++) {
      const p = parts[k];
      if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
  }

  /**
   * Compile rules into indexed structure
   */
  private compileRules(rules: Rule[]): CompiledRuleSet {
    const byPriority = new Map<number, Rule[]>();

    for (const rule of rules) {
      if (!byPriority.has(rule.priority)) {
        byPriority.set(rule.priority, []);
      }
      byPriority.get(rule.priority)!.push(rule);
    }

    return {
      rules,
      byPriority,
      lastCompiled: new Date()
    };
  }
}


// ============================================================================
// EXAMPLE RULES
// ============================================================================

/**
 * Example rule definitions
 * In production: loaded from database or configuration
 */
export const ExampleRules = {
  // German road inspection → Inspection_DE workflow
  INSPECTION_DE: RuleBuilder.create(createRuleId("rule-inspection-de"))
    .priority(100)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .thenWorkflow(
      createWorkflowDefId("Inspection_DE"),
      "Professional road inspection procedure for Germany"
    ),

  // Truck in Germany requires special handling
  TRUCK_ADR_DE: RuleBuilder.create(createRuleId("rule-truck-adr-de"))
    .priority(90)
    .when("country", "eq", "DE")
    .when("vehicle.category", "eq", "TRUCK")
    .when("vehicle.adrClass", "neq", undefined)
    .thenWorkflow(
      createWorkflowDefId("ADR_Check_DE"),
      "Dangerous goods transport requires ADR compliance check"
    ),

  // Default fallback if no rule matches
  DEFAULT_FALLBACK: RuleBuilder.create(createRuleId("rule-fallback-default"))
    .priority(0)
    .when("country", "nin", ["XX"]) // Always matches (XX is not a real country)
    .thenFallback(TrustLevel.T4_FALLBACK, "No specific rule matched, returning emergency fallback")
};
