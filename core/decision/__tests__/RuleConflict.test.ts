// core/decision/__tests__/RuleConflict.test.ts
// R6 / Domain Model §4: a provable tie (same priority + identical conditions)
// is a build-time (init-time) error, never a runtime coin-flip.

import { DecisionEngine, RuleBuilder } from "../DecisionEngine";
import { InMemoryRuleStorage } from "../storage/InMemoryRuleStorage";
import { createRuleId, createWorkflowDefId } from "../../../shared/types";

describe("DecisionEngine — rule conflict (R6)", () => {
  test("throws on two rules with the same priority AND identical conditions", async () => {
    const storage = new InMemoryRuleStorage();
    await storage.saveRule(
      RuleBuilder.create(createRuleId("dup-a"))
        .priority(50)
        .when("country", "eq", "DE")
        .thenWorkflow(createWorkflowDefId("A_DE"))
    );
    await storage.saveRule(
      RuleBuilder.create(createRuleId("dup-b"))
        .priority(50)
        .when("country", "eq", "DE")
        .thenWorkflow(createWorkflowDefId("B_DE"))
    );
    const engine = new DecisionEngine(storage);
    await expect(engine.initialize()).rejects.toThrow(/conflict/i);
  });

  test("same priority but DIFFERENT conditions is allowed (no throw)", async () => {
    const storage = new InMemoryRuleStorage();
    await storage.saveRule(
      RuleBuilder.create(createRuleId("ok-a"))
        .priority(50)
        .when("country", "eq", "DE")
        .thenWorkflow(createWorkflowDefId("A_DE"))
    );
    await storage.saveRule(
      RuleBuilder.create(createRuleId("ok-b"))
        .priority(50)
        .when("country", "eq", "FR")
        .thenWorkflow(createWorkflowDefId("A_FR"))
    );
    const engine = new DecisionEngine(storage);
    await expect(engine.initialize()).resolves.toBeUndefined();
  });
});
