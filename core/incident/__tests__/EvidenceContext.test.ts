// core/incident/__tests__/EvidenceContext.test.ts
// ADR-008: Incident is the immutable evidence document, sealed from a finished
// instance. Invariant: ABANDONED also produces an Incident. Links to
// DecisionRecords (ADR-007). Anonymization is the §8 knowledge-loop entry.

import {
  sealIncident,
  anonymizeIncident,
  linkIncidentToDecisions,
  IncidentState,
  type SealIncidentInput,
} from "../Incident";
import { InMemoryIncidentStore } from "../InMemoryIncidentStore";
import { InMemoryDecisionLog } from "../../../shared/storage/InMemoryDecisionLog";
import { routeAndRecord } from "../../workflow/DecisionRecorder";
import { DecisionEngine, RuleBuilder } from "../../decision/DecisionEngine";
import { InMemoryRuleStorage } from "../../decision/storage/InMemoryRuleStorage";
import {
  createInstanceId,
  createVersionId,
  createRuleId,
  createWorkflowDefId,
  createUserId,
  TrustLevel,
  Connectivity,
} from "../../../shared/types";
import type { SituationContext } from "../../../shared/types";
import type { DateTime } from "../../../shared/platform/ids";

const baseInput = (): SealIncidentInput => ({
  instanceId: createInstanceId("WF-1"),
  country: "DE",
  occurredAt: "2026-07-29T00:00:00Z" as DateTime,
  origin: "COMPLETED",
  knowledgeUsed: [createVersionId("VER-rights"), createVersionId("VER-adr")],
  trustLevels: [TrustLevel.T1_VERIFIED],
  attachments: [{ type: "image/jpeg", hash: "sha256:abc", metadata: { plate: "SECRET" } }],
  report: "Bericht",
});

describe("Evidence Context — sealIncident (ADR-008)", () => {
  test("seals a COMPLETED instance into an immutable SEALED incident", () => {
    const inc = sealIncident(baseInput());
    expect(inc.state).toBe(IncidentState.SEALED);
    expect(inc.origin).toBe("COMPLETED");
    expect(inc.knowledgeUsed).toHaveLength(2);
    expect(Object.isFrozen(inc)).toBe(true);
  });

  test("ABANDONED also produces an Incident (partial evidence) — the ADR-008 invariant", () => {
    const inc = sealIncident({ ...baseInput(), origin: "ABANDONED", report: null, knowledgeUsed: [] });
    expect(inc.origin).toBe("ABANDONED");
    expect(inc.state).toBe(IncidentState.SEALED);
    expect(inc.knowledgeUsed).toHaveLength(0);
  });

  test("links the sealed incident back to its DecisionRecords (ADR-007 attach)", async () => {
    const storage = new InMemoryRuleStorage();
    await storage.saveRule(
      RuleBuilder.create(createRuleId("r"))
        .priority(90)
        .when("country", "eq", "DE")
        .thenWorkflow(createWorkflowDefId("Inspection_DE"))
    );
    const decision = new DecisionEngine(storage);
    await decision.initialize();
    const log = new InMemoryDecisionLog();

    const ctx: SituationContext = {
      timestamp: new Date("2026-07-29T00:00:00Z"),
      location: null,
      resolvedCountry: "DE",
      language: "de",
      connectivity: Connectivity.ONLINE,
      userProfile: createUserId("u1"),
    };
    const { record } = await routeAndRecord({ decision, log }, { country: "DE" }, ctx);

    const inc = sealIncident({ ...baseInput(), decisionIds: [record.id] });
    linkIncidentToDecisions(log, inc);

    expect(log.get(record.id)?.incidentId).toBe(inc.id);
  });

  test("anonymizeIncident strips attachment metadata and marks ANONYMIZED (§8 loop)", () => {
    const inc = sealIncident(baseInput());
    const anon = anonymizeIncident(inc);
    expect(anon.state).toBe(IncidentState.ANONYMIZED);
    expect(anon.anonymizedAt).not.toBeNull();
    expect(anon.attachments[0].metadata).toBeUndefined(); // PII-bearing metadata gone
    expect(anon.attachments[0].hash).toBe("sha256:abc"); // integrity hash kept
  });
});

describe("Evidence Context — InMemoryIncidentStore", () => {
  test("sealed incident is immutable except for the anonymized transition", () => {
    const store = new InMemoryIncidentStore();
    const inc = sealIncident(baseInput());
    store.save(inc);

    // Re-saving the same sealed incident (not anonymized) is rejected.
    expect(() => store.save(inc)).toThrow(/sealed/i);

    // The SEALED -> ANONYMIZED transition is the one allowed overwrite.
    const anon = anonymizeIncident(inc);
    expect(() => store.save(anon)).not.toThrow();
    expect(store.get(inc.id)?.state).toBe(IncidentState.ANONYMIZED);
  });
});
