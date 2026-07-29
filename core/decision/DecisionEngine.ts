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
    // A provable ambiguity — two rules at the SAME priority with the SAME
    // condition set — is a hard error: the engine would be non-deterministic
    // about which one wins. (Full semantic overlap analysis of *different*
    // conditions is future work; those still warn rather than silently pass.)
    const conditionKey = (r: Rule): string =>
      JSON.stringify([...r.conditions].map((c) => [c.path, c.operator, c.value]).sort());

    for (const [priority, rulesAtPriority] of priorities) {
      if (rulesAtPriority.length <= 1) continue;

      const byConditions = new Map<string, Rule[]>();
      for (const rule of rulesAtPriority) {
        const key = conditionKey(rule);
        if (!byConditions.has(key)) byConditions.set(key, []);
        byConditions.get(key)!.push(rule);
      }

      for (const [, dupes] of byConditions) {
        if (dupes.length > 1) {
          throw new Error(
            `[DecisionEngine] Rule conflict: ${dupes.map((r) => r.id).join(", ")} ` +
            `share priority ${priority} AND identical conditions — the outcome is ` +
            `ambiguous. Give them distinct priorities or conditions (Domain Model §4).`
          );
        }
      }

      if (byConditions.size > 1) {
        console.warn(
          `[DecisionEngine] Multiple rules at priority ${priority}: ` +
          `${rulesAtPriority.map((r) => r.id).join(", ")}. Verify their conditions do not overlap.`
        );
      }
    }
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
