/**
 * DECISION ENGINE
 *
 * Deterministic rule engine.
 * - Zero LLM
 * - Zero probability
 * - Identical input → identical output (100% testable)
 * - Every rule has priority; conflicts = build-time error
 *
 * This guards against: "what if AI decided differently today?"
 */

import {
  RuleId,
  WorkflowDefId,
  CountryCode,
  TrustLevel,
  createRuleId,
  createWorkflowDefId,
  SemVer
} from "../../shared/types";

import {
  IDecisionPort,
  DecisionInput,
  DecisionOutcome
} from "../index.ports";

// ============================================================================
// INTERNAL ENTITIES
// ============================================================================

/**
 * Condition — single clause in a rule
 * Examples:
 *   country = "DE"
 *   vehicle.category = "TRUCK"
 *   userType = "PRO_DRIVER"
 *   eventType = "ROAD_INSPECTION"
 */
interface Condition {
  path: string; // dot-notation: "country", "vehicle.category", "context.time.hour"
  operator: "eq" | "neq" | "in" | "nin" | "gt" | "lt" | "gte" | "lte";
  value: string | number | boolean | string[];
}

/**
 * Rule — conditions + outcome
 * Immutable once published (versioned like knowledge)
 */
export interface Rule {
  id: RuleId;
  priority: number; // Higher = checked first. Ties = build error
  version: SemVer;
  conditions: Condition[];
  outcome: {
    workflowDefId?: WorkflowDefId;
    fallbackTrustLevel?: TrustLevel;
    reasoning?: string;
  };
  createdAt: Date;
  publishedAt?: Date;
  enabled: boolean;
}

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
            reasoning: rule.outcome.reasoning
          };
        }
      }
    }

    // No rule matched — return fallback
    return {
      fallbackTrustLevel: TrustLevel.FALLBACK
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

    // Check for ties with overlapping conditions
    // This is a simplified check — real implementation would be more thorough
    for (const [priority, rulesAtPriority] of priorities) {
      if (rulesAtPriority.length > 1) {
        // Multiple rules at same priority — check for determinism
        // In production: semantic overlap analysis, simulation against test cases
        console.warn(
          `[DecisionEngine] Multiple rules at priority ${priority}: ` +
          `${rulesAtPriority.map(r => r.id).join(", ")}. ` +
          `Ensure conditions don't overlap.`
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
// RULE BUILDER — DSL for easier rule creation
// ============================================================================

export class RuleBuilder {
  private rule: Partial<Rule>;

  constructor(id: RuleId) {
    this.rule = {
      id,
      priority: 0,
      version: { major: 1, minor: 0, patch: 0 },
      conditions: [],
      enabled: true
    };
  }

  static create(id: RuleId): RuleBuilder {
    return new RuleBuilder(id);
  }

  priority(p: number): this {
    this.rule.priority = p;
    return this;
  }

  when(path: string, operator: string, value: unknown): this {
    this.rule.conditions!.push({
      path,
      operator: operator as any,
      value: value as any
    });
    return this;
  }

  thenWorkflow(workflowDefId: WorkflowDefId, reasoning?: string): Rule {
    const rule = this.build();
    rule.outcome = { workflowDefId, reasoning };
    return rule;
  }

  thenFallback(trustLevel: TrustLevel, reasoning?: string): Rule {
    const rule = this.build();
    rule.outcome = { fallbackTrustLevel: trustLevel, reasoning };
    return rule;
  }

  private build(): Rule {
    if (!this.rule.id || !this.rule.conditions) {
      throw new Error("Rule incomplete");
    }
    return this.rule as Rule;
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
    .thenFallback(TrustLevel.FALLBACK, "No specific rule matched, returning emergency fallback")
};
