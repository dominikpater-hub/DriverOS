// shared/rules.ts
// Rule authoring shapes + DSL. Live in shared (not core/decision) so products
// (apps/*) can author rule sets WITHOUT importing the Decision Engine —
// ADR-009 §7.3.1: apps know only Workflow + shared. The engine CONSUMES these
// value shapes; it does not own them (same reasoning as PredicateExpression, D-03).

import { RuleId, WorkflowDefId, TrustLevel, SemVer } from "./types";

/** Single clause in a rule. Same operator family as PredicateExpression. */
export interface Condition {
  path: string; // dot-notation: "country", "vehicle.category", "context.time.hour"
  operator: "eq" | "neq" | "in" | "nin" | "gt" | "lt" | "gte" | "lte";
  value: string | number | boolean | string[];
}

/** Rule — conditions + outcome. Immutable once published (versioned like knowledge). */
export interface Rule {
  id: RuleId;
  priority: number; // Higher = checked first. Ties = build error.
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

/** DSL for ergonomic rule authoring. */
export class RuleBuilder {
  private rule: Partial<Rule>;

  constructor(id: RuleId) {
    this.rule = {
      id,
      priority: 0,
      version: "1.0.0" as SemVer,
      conditions: [],
      enabled: true,
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
      value: value as any,
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
