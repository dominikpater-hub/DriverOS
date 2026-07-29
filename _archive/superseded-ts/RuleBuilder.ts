// ---------------------------------------------------------------------------
// Guardian Engine — core/decision/RuleBuilder.ts
//
// Fluent builder so rule authors (product/content, not just engineers) can
// write rules without hand-assembling Condition[] arrays.
// ---------------------------------------------------------------------------

import type { Rule, RuleId, WorkflowDefId, Condition, ConditionOperator } from "../../shared/types";

export class RuleBuilder {
  private readonly ruleId: RuleId;
  private rulePriority = 0;
  private conditions: Condition[] = [];

  private constructor(ruleId: RuleId) {
    this.ruleId = ruleId;
  }

  static create(ruleId: RuleId): RuleBuilder {
    return new RuleBuilder(ruleId);
  }

  priority(value: number): this {
    this.rulePriority = value;
    return this;
  }

  when(field: string, operator: ConditionOperator, value: unknown): this {
    this.conditions.push({ field, operator, value });
    return this;
  }

  thenWorkflow(workflowDefId: WorkflowDefId, description?: string): Rule {
    return {
      id: this.ruleId,
      priority: this.rulePriority,
      conditions: this.conditions,
      outcome: { workflowDefId, description },
    };
  }
}
