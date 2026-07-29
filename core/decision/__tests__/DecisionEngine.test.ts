/**
 * DECISION ENGINE — TEST SUITE
 *
 * Target: 100% coverage + non-negotiable determinism guarantee.
 * "Same input → same output, always" is not a nice-to-have. It's the
 * entire reason Decision Engine exists instead of an LLM call.
 */

import { DecisionEngine, RuleBuilder } from "../DecisionEngine";
import { InMemoryRuleStorage } from "../storage/InMemoryRuleStorage";
import { createRuleId, createWorkflowDefId, TrustLevel } from "../../../shared/types";
import { DecisionInput } from "../../index.ports";

describe("DecisionEngine", () => {
  let storage: InMemoryRuleStorage;
  let engine: DecisionEngine;

  beforeEach(async () => {
    storage = new InMemoryRuleStorage();

    await storage.saveRule(
      RuleBuilder.create(createRuleId("rule-inspection-de"))
        .priority(100)
        .when("country", "eq", "DE")
        .when("eventType", "eq", "ROAD_INSPECTION")
        .thenWorkflow(createWorkflowDefId("Inspection_DE"), "German road inspection")
    );

    await storage.saveRule(
      RuleBuilder.create(createRuleId("rule-truck-adr-de"))
        .priority(90)
        .when("country", "eq", "DE")
        .when("vehicle.category", "eq", "TRUCK")
        .when("vehicle.adrClass", "neq", undefined)
        .thenWorkflow(createWorkflowDefId("ADR_Check_DE"), "ADR compliance check")
    );

    await storage.saveRule(
      RuleBuilder.create(createRuleId("rule-fallback-default"))
        .priority(0)
        .when("country", "nin", ["XX"])
        .thenFallback(TrustLevel.T4_FALLBACK, "No specific rule matched")
    );

    engine = new DecisionEngine(storage);
    await engine.initialize();
  });

  // ==========================================================================
  // BASIC MATCHING
  // ==========================================================================

  it("matches German road inspection to Inspection_DE", async () => {
    const outcome = await engine.matchRules({
      country: "DE",
      eventType: "ROAD_INSPECTION"
    });
    expect(outcome.workflowDefId).toBe("Inspection_DE");
  });

  it("does not match Inspection_DE for a different country", async () => {
    const outcome = await engine.matchRules({
      country: "FR",
      eventType: "ROAD_INSPECTION"
    });
    expect(outcome.workflowDefId).not.toBe("Inspection_DE");
  });

  it("falls back to default fallback trust level when nothing matches", async () => {
    const outcome = await engine.matchRules({
      country: "FR",
      eventType: "UNKNOWN_EVENT"
    });
    expect(outcome.workflowDefId).toBeUndefined();
    expect(outcome.fallbackTrustLevel).toBe(TrustLevel.T4_FALLBACK);
  });

  // ==========================================================================
  // PRIORITY ORDERING
  // ==========================================================================

  it("respects rule priority — higher priority rule wins on overlap", async () => {
    // A truck in Germany doing a road inspection matches BOTH
    // rule-inspection-de (priority 100) and rule-truck-adr-de (priority 90)
    const outcome = await engine.matchRules({
      country: "DE",
      eventType: "ROAD_INSPECTION",
      vehicle: { category: "TRUCK", adrClass: "3" }
    });
    // Priority 100 rule should win
    expect(outcome.workflowDefId).toBe("Inspection_DE");
  });

  it("matches lower-priority rule when higher-priority rule's conditions fail", async () => {
    const outcome = await engine.matchRules({
      country: "DE",
      eventType: "SOMETHING_ELSE",
      vehicle: { category: "TRUCK", adrClass: "3" }
    });
    expect(outcome.workflowDefId).toBe("ADR_Check_DE");
  });

  // ==========================================================================
  // OPERATOR COVERAGE
  // ==========================================================================

  describe("condition operators", () => {
    let opEngine: DecisionEngine;
    let opStorage: InMemoryRuleStorage;

    beforeEach(async () => {
      opStorage = new InMemoryRuleStorage();
      opEngine = new DecisionEngine(opStorage);
    });

    async function ruleWith(operator: string, value: unknown) {
      await opStorage.saveRule(
        RuleBuilder.create(createRuleId(`rule-${operator}`))
          .priority(10)
          .when("testField", operator as any, value)
          .thenWorkflow(createWorkflowDefId("MATCHED"), `matched via ${operator}`)
      );
      await opEngine.initialize();
    }

    it("eq matches exact value", async () => {
      await ruleWith("eq", 5);
      const outcome = await opEngine.matchRules({ country: "DE", testField: 5 } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });

    it("neq matches when value differs", async () => {
      await ruleWith("neq", 5);
      const outcome = await opEngine.matchRules({ country: "DE", testField: 6 } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });

    it("in matches when value is in array", async () => {
      await ruleWith("in", ["A", "B", "C"]);
      const outcome = await opEngine.matchRules({ country: "DE", testField: "B" } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });

    it("nin matches when value is not in array", async () => {
      await ruleWith("nin", ["A", "B", "C"]);
      const outcome = await opEngine.matchRules({ country: "DE", testField: "Z" } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });

    it("gt matches when value is greater", async () => {
      await ruleWith("gt", 10);
      const outcome = await opEngine.matchRules({ country: "DE", testField: 11 } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });

    it("lt matches when value is lesser", async () => {
      await ruleWith("lt", 10);
      const outcome = await opEngine.matchRules({ country: "DE", testField: 9 } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });

    it("gte matches when value is equal or greater", async () => {
      await ruleWith("gte", 10);
      const outcome = await opEngine.matchRules({ country: "DE", testField: 10 } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });

    it("lte matches when value is equal or lesser", async () => {
      await ruleWith("lte", 10);
      const outcome = await opEngine.matchRules({ country: "DE", testField: 10 } as any);
      expect(outcome.workflowDefId).toBe("MATCHED");
    });
  });

  // ==========================================================================
  // ⚠️ CRITICAL: DETERMINISM
  // ==========================================================================

  it("CRITICAL: produces identical output for identical input across 1000 runs", async () => {
    const input: DecisionInput = {
      country: "DE",
      eventType: "ROAD_INSPECTION",
      vehicle: { category: "TRUCK", adrClass: "3" }
    };

    const first = await engine.matchRules(input);
    const firstJson = JSON.stringify(first);

    for (let i = 0; i < 1000; i++) {
      const result = await engine.matchRules(input);
      expect(JSON.stringify(result)).toBe(firstJson);
    }
  });

  it("CRITICAL: determinism holds across engine re-initialization", async () => {
    const input: DecisionInput = { country: "DE", eventType: "ROAD_INSPECTION" };

    const before = await engine.matchRules(input);

    // Re-initialize (simulates process restart)
    const freshEngine = new DecisionEngine(storage);
    await freshEngine.initialize();

    const after = await freshEngine.matchRules(input);

    expect(after).toEqual(before);
  });

  // ==========================================================================
  // GUARD RAILS
  // ==========================================================================

  it("throws if matchRules is called before initialize()", async () => {
    const uninitialized = new DecisionEngine(new InMemoryRuleStorage());
    await expect(
      uninitialized.matchRules({ country: "DE" })
    ).rejects.toThrow(/not initialized/i);
  });
});
