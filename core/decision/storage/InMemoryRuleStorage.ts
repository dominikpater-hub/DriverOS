/**
 * IN-MEMORY RULE STORAGE
 *
 * Mock implementation of IRuleStorage for tests and local development.
 */

import { RuleId } from "../../../shared/types";
import type { Rule } from "../DecisionEngine";

export class InMemoryRuleStorage {
  private rules = new Map<RuleId, Rule>();

  async getRule(id: RuleId): Promise<Rule | null> {
    return this.rules.get(id) ?? null;
  }

  async listRules(enabled?: boolean): Promise<Rule[]> {
    const all = Array.from(this.rules.values());
    if (enabled === undefined) return all;
    return all.filter(r => r.enabled === enabled);
  }

  async saveRule(rule: Rule): Promise<void> {
    this.rules.set(rule.id, rule);
  }
}
