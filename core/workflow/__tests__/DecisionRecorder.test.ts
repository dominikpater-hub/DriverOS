// core/workflow/__tests__/DecisionRecorder.test.ts
// ADR-007: every routing decision leaves an append-only DecisionRecord —
// including T4 fallbacks — and the recorded output is reproducible by
// re-running the (deterministic) Decision Engine on the same input.

import { routeAndRecord } from "../DecisionRecorder";
import { InMemoryDecisionLog } from "../../../shared/storage/InMemoryDecisionLog";
import { DecisionEngine, RuleBuilder } from "../../decision/DecisionEngine";
import { InMemoryRuleStorage } from "../../decision/storage/InMemoryRuleStorage";
import {
  createRuleId,
  createWorkflowDefId,
  createUserId,
  createIncidentId,
  TrustLevel,
  Connectivity,
} from "../../../shared/types";
import type { SituationContext } from "../../../shared/types";
import type { DecisionInput } from "../../index.ports";
import { DecisionReason } from "../../../shared/platform/decision-record";

const ctx: SituationContext = {
  timestamp: new Date("2026-07-29T00:00:00Z"),
  location: null,
  resolvedCountry: "DE",
  language: "de",
  connectivity: Connectivity.ONLINE,
  userProfile: createUserId("u1"),
};

async function engine(): Promise<DecisionEngine> {
  const storage = new InMemoryRuleStorage();
  await storage.saveRule(
    RuleBuilder.create(createRuleId("rule-inspection-de"))
      .priority(90)
      .when("country", "eq", "DE")
      .when("eventType", "eq", "ROAD_INSPECTION")
      .thenWorkflow(createWorkflowDefId("Inspection_DE"))
  );
  const e = new DecisionEngine(storage);
  await e.initialize();
  return e;
}

const inspectionInput: DecisionInput = { country: "DE", eventType: "ROAD_INSPECTION" };
const noMatchInput: DecisionInput = { country: "FR", eventType: "ROAD_INSPECTION" };

describe("DecisionRecorder — ADR-007", () => {
  test("records a RULE_MATCH decision with the matched rule id", async () => {
    const decision = await engine();
    const log = new InMemoryDecisionLog();
    const { outcome, record } = await routeAndRecord({ decision, log }, inspectionInput, ctx);

    expect(outcome.workflowDefId).toBe("Inspection_DE");
    expect(log.list()).toHaveLength(1);
    expect(record.decisionReason).toBe(DecisionReason.RULE_MATCH);
    expect(record.trustLevel).toBe(TrustLevel.T1_VERIFIED);
    expect(record.ruleIds).toHaveLength(1);
    expect(record.ruleIds[0].id).toBe("rule-inspection-de");
    expect(record.contextSnapshot).toBe(ctx);
  });

  test("records a T4 fallback decision when no rule matches (NO_RULE_T4, empty ruleIds)", async () => {
    const decision = await engine();
    const log = new InMemoryDecisionLog();
    const { outcome, record } = await routeAndRecord({ decision, log }, noMatchInput, ctx);

    expect(outcome.workflowDefId).toBeUndefined();
    expect(record.workflowDefId).toBeNull();
    expect(record.decisionReason).toBe(DecisionReason.NO_RULE_T4);
    expect(record.trustLevel).toBe(TrustLevel.T4_FALLBACK);
    expect(record.ruleIds).toHaveLength(0);
  });

  test("audit replay: recorded output is reproducible by re-running matchRules on the same input", async () => {
    const decision = await engine();
    const log = new InMemoryDecisionLog();
    const { record } = await routeAndRecord({ decision, log }, inspectionInput, ctx);

    const replay = await decision.matchRules(inspectionInput);
    expect((record.output as any).workflowDefId).toBe(replay.workflowDefId);
    // determinism: a second identical routing yields byte-identical outcome
    const again = await routeAndRecord({ decision, log }, inspectionInput, ctx);
    expect(JSON.stringify(again.outcome)).toBe(JSON.stringify(record.output));
  });

  test("attach() links an IncidentId; attaching a different one throws (append-only)", async () => {
    const decision = await engine();
    const log = new InMemoryDecisionLog();
    const { record } = await routeAndRecord({ decision, log }, inspectionInput, ctx);

    const inc = createIncidentId("INC-1");
    log.attach(record.id, inc);
    expect(log.get(record.id)?.incidentId).toBe(inc);
    // idempotent for the same incident, throws for a different one
    expect(() => log.attach(record.id, inc)).not.toThrow();
    expect(() => log.attach(record.id, createIncidentId("INC-2"))).toThrow();
  });
});
