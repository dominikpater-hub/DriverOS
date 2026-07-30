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

  test("same priority but DIFFERENT (mutually exclusive) conditions is allowed (no throw)", async () => {
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

  // M2.5 — SEMANTIC overlap: different condition sets that a single input can
  // still satisfy simultaneously.
  test("throws on SEMANTIC overlap with different outcomes (different conditions, one input matches both)", async () => {
    const storage = new InMemoryRuleStorage();
    // A matches any DE input; B matches any ROAD_INSPECTION input. Input
    // {country: DE, eventType: ROAD_INSPECTION} matches BOTH -> ambiguous.
    await storage.saveRule(
      RuleBuilder.create(createRuleId("ov-a"))
        .priority(70)
        .when("country", "eq", "DE")
        .thenWorkflow(createWorkflowDefId("A_DE"))
    );
    await storage.saveRule(
      RuleBuilder.create(createRuleId("ov-b"))
        .priority(70)
        .when("eventType", "eq", "ROAD_INSPECTION")
        .thenWorkflow(createWorkflowDefId("B_INSPECTION"))
    );
    const engine = new DecisionEngine(storage);
    await expect(engine.initialize()).rejects.toThrow(/overlap|conflict/i);
  });

  test("overlap but SAME outcome is a benign tie (no throw)", async () => {
    const storage = new InMemoryRuleStorage();
    await storage.saveRule(
      RuleBuilder.create(createRuleId("same-a"))
        .priority(70)
        .when("country", "eq", "DE")
        .thenWorkflow(createWorkflowDefId("SAME_WF"))
    );
    await storage.saveRule(
      RuleBuilder.create(createRuleId("same-b"))
        .priority(70)
        .when("eventType", "eq", "ROAD_INSPECTION")
        .thenWorkflow(createWorkflowDefId("SAME_WF"))
    );
    const engine = new DecisionEngine(storage);
    await expect(engine.initialize()).resolves.toBeUndefined();
  });

  test("numeric ranges that cannot both hold are NOT flagged (gt 100 vs lt 50)", async () => {
    const storage = new InMemoryRuleStorage();
    await storage.saveRule(
      RuleBuilder.create(createRuleId("num-a"))
        .priority(60)
        .when("speed", "gt", 100)
        .thenWorkflow(createWorkflowDefId("FAST"))
    );
    await storage.saveRule(
      RuleBuilder.create(createRuleId("num-b"))
        .priority(60)
        .when("speed", "lt", 50)
        .thenWorkflow(createWorkflowDefId("SLOW"))
    );
    const engine = new DecisionEngine(storage);
    await expect(engine.initialize()).resolves.toBeUndefined();
  });

  test("numeric ranges that DO overlap with different outcomes throw (gt 100 vs gt 200)", async () => {
    const storage = new InMemoryRuleStorage();
    await storage.saveRule(
      RuleBuilder.create(createRuleId("num-c"))
        .priority(60)
        .when("speed", "gt", 100)
        .thenWorkflow(createWorkflowDefId("OVER_100"))
    );
    await storage.saveRule(
      RuleBuilder.create(createRuleId("num-d"))
        .priority(60)
        .when("speed", "gt", 200)
        .thenWorkflow(createWorkflowDefId("OVER_200"))
    );
    const engine = new DecisionEngine(storage);
    await expect(engine.initialize()).rejects.toThrow(/overlap|conflict/i);
  });
});
