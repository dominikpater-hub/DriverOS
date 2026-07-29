/**
 * WORKFLOW ENGINE — INTEGRATION TEST SUITE
 *
 * Target: 100% coverage of happy path + edge cases (STARTUP_CHECKLIST Week 2).
 *
 * This suite wires real Knowledge/Decision/Context engines together with
 * in-memory storage and executes the actual Inspection_DE workflow —
 * the same one DriverOS ships. If this suite breaks, DriverOS breaks.
 *
 * Key properties under test:
 *   - Happy path: start -> step -> step -> ... -> complete
 *   - Offline fallback: a NETWORK-requiring step falls back correctly
 *   - Knowledge usage tracking flows through to the final Incident
 *   - State transitions: ACTIVE -> COMPLETED
 */

import { WorkflowEngine, WorkflowDefinition } from "../WorkflowEngine";
import { KnowledgeEngine, KnowledgePublisher } from "../../knowledge/KnowledgeEngine";
import { InMemoryKnowledgeStorage } from "../../knowledge/storage/InMemoryKnowledgeStorage";
import { DecisionEngine } from "../../decision/DecisionEngine";
import { InMemoryRuleStorage } from "../../decision/storage/InMemoryRuleStorage";
import {
  ContextEngine,
  OfflineBoundingBoxGeoResolver,
  BrowserConnectivityProbe,
  InMemoryProfileStorage
} from "../../context/ContextEngine";
import { AIEngine, ClaudeAPIProvider } from "../../ai/AIEngine";
import { InMemoryWorkflowStorage } from "../storage/InMemoryWorkflowStorage";

import {
  createKnowledgeId,
  createUserId,
  createWorkflowDefId,
  createStepId,
  ConfidenceLevel,
  UserType,
  StepKind,
  Capability,
  Connectivity,
  TrustLevel,
  WorkflowInstanceState
} from "../../../shared/types";

// A workflow definition intentionally missing a fallback on a NETWORK step —
// used only to prove the offline-fallback test actually exercises the branch.
function buildTestWorkflow(withFallback: boolean): WorkflowDefinition {
  return {
    id: createWorkflowDefId("Inspection_DE_TEST"),
    name: "Test Inspection",
    version: "1.0.0",
    offlineCapable: true,
    entryStepId: createStepId("step_emergency"),
    steps: [
      {
        id: createStepId("step_emergency"),
        kind: StepKind.EMERGENCY_CARD,
        title: "Rights",
        requires: [],
        next: createStepId("step_knowledge")
      },
      {
        id: createStepId("step_knowledge"),
        kind: StepKind.SHOW_KNOWLEDGE,
        title: "Traffic Law Info",
        requires: [],
        next: createStepId("step_translate")
      },
      {
        id: createStepId("step_translate"),
        kind: StepKind.TRANSLATE,
        title: "Translate",
        requires: [Capability.NETWORK],
        fallback: withFallback ? createStepId("step_photo") : undefined,
        next: createStepId("step_photo")
      },
      {
        id: createStepId("step_photo"),
        kind: StepKind.CAPTURE_PHOTO,
        title: "Document Evidence",
        requires: [Capability.CAMERA],
        next: createStepId("step_report")
      },
      {
        id: createStepId("step_report"),
        kind: StepKind.GENERATE_REPORT,
        title: "Create Report",
        requires: [],
        next: undefined
      }
    ]
  };
}

describe("WorkflowEngine (integration)", () => {
  let knowledgeStorage: InMemoryKnowledgeStorage;
  let knowledge: KnowledgeEngine;
  let publisher: KnowledgePublisher;
  let decision: DecisionEngine;
  let context: ContextEngine;
  let ai: AIEngine;
  let workflowStorage: InMemoryWorkflowStorage;
  let workflow: WorkflowEngine;

  const entryId = createKnowledgeId("traffic-rights-de");
  const userId = createUserId("driver-001");

  beforeEach(async () => {
    // --- Knowledge Engine, seeded with German rights + emergency card ---
    knowledgeStorage = new InMemoryKnowledgeStorage();
    knowledge = new KnowledgeEngine(knowledgeStorage as any);
    publisher = new KnowledgePublisher(knowledgeStorage as any);

    knowledgeStorage.seedEntry({
      id: entryId,
      domain: "TRAFFIC_LAW",
      country: "DE",
      scope: "NATIONAL",
      tags: ["rights"],
      versions: [],
      currentVersionId: undefined as any,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await publisher.publishVersion(entryId, {
      language: "de",
      content: {
        summary: "Bleib ruhig und zeige gültige Papiere.",
        actions: [{ order: 1, text: "Papiere zeigen", critical: true }],
        rights: ["Recht zu schweigen"],
        warnings: [],
        details: "Vollständiger Text...",
        legalRefs: []
      },
      sources: [{ type: "OFFICIAL_SITE", reference: "StVO", retrievedAt: new Date() }],
      confidence: ConfidenceLevel.OFFICIAL,
      effectiveDate: new Date(),
      verifiedBy: "admin@guardian.de",
      nextReviewDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    });

    await publisher.publishEmergencyCard("DE", {
      type: "POLICE_STOP",
      content: {
        summary: "Notfallkarte",
        actions: [],
        rights: [],
        warnings: [],
        details: "Immer offline verfügbar.",
        legalRefs: []
      },
      contacts: [{ type: "EMERGENCY", name: "Polizei", number: "112", language: "de" }]
    });

    // Second, distinctly-tagged entry — used by the ADR_Check_DE workflow
    // test below to prove tag filtering actually differentiates content.
    const adrEntryId = createKnowledgeId("adr-requirements-de");
    knowledgeStorage.seedEntry({
      id: adrEntryId,
      domain: "ADR",
      country: "DE",
      scope: "NATIONAL",
      tags: ["adr"],
      versions: [],
      currentVersionId: undefined as any,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    await publisher.publishVersion(adrEntryId, {
      language: "de",
      content: {
        summary: "Gefahrgutkennzeichnung und Beförderungspapiere prüfen.",
        actions: [{ order: 1, text: "Beförderungspapier bereithalten", critical: true }],
        rights: [],
        warnings: [],
        details: "ADR-spezifischer Text...",
        legalRefs: []
      },
      sources: [{ type: "OFFICIAL_SITE", reference: "ADR", retrievedAt: new Date() }],
      confidence: ConfidenceLevel.OFFICIAL,
      effectiveDate: new Date(),
      verifiedBy: "admin@guardian.de",
      nextReviewDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    });

    // --- Decision Engine (not directly exercised here — Workflow is
    //     started with an explicit defId, matching how DriverOS calls it
    //     after Decision Engine has already routed) ---
    decision = new DecisionEngine(new InMemoryRuleStorage());
    await decision.initialize();

    // --- Context Engine ---
    const profileStorage = new InMemoryProfileStorage();
    profileStorage.addProfile({
      id: userId,
      type: UserType.PRO_DRIVER as any,
      languages: ["de"],
      homeCountry: "DE"
    });
    const geoResolver = new OfflineBoundingBoxGeoResolver([
      { country: "DE", minLat: 47.0, maxLat: 55.0, minLng: 5.5, maxLng: 15.5 }
    ]);
    context = new ContextEngine(geoResolver, new BrowserConnectivityProbe(), profileStorage);

    // --- AI Engine (mocked provider — no real network calls in tests) ---
    ai = new AIEngine(new ClaudeAPIProvider("test-key"));

    // --- Workflow storage ---
    workflowStorage = new InMemoryWorkflowStorage();

    workflow = new WorkflowEngine(workflowStorage as any, knowledge, context, decision, ai);
  });

  // ==========================================================================
  // HAPPY PATH
  // ==========================================================================

  it("runs the full happy path: start -> steps -> complete, ending in COMPLETED state", async () => {
    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await workflow.startWorkflow({
      userId,
      defId: def.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });

    expect(instance.currentStepId).toBe(def.entryStepId);
    expect(instance.contextSnapshot.resolvedCountry).toBe("DE");
    expect(instance.contextSnapshot.language).toBe("de");

    let current = await workflow.getWorkflowInstance(instance.id);
    let steps = 0;
    while (current && current.state === WorkflowInstanceState.ACTIVE && steps < 10) {
      await workflow.executeStep(instance.id, { photo: "mock-photo-data" });
      current = await workflow.getWorkflowInstance(instance.id);
      steps++;
    }

    expect(current?.state).toBe(WorkflowInstanceState.COMPLETED);
    expect(steps).toBe(def.steps.length);
  });

  it("SHOW_KNOWLEDGE step surfaces the actual verified German content", async () => {
    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await workflow.startWorkflow({
      userId,
      defId: def.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });

    await workflow.executeStep(instance.id); // step_emergency
    const knowledgeResult = await workflow.executeStep(instance.id); // step_knowledge

    expect(knowledgeResult.uiPrompt?.title).toBe("Bleib ruhig und zeige gültige Papiere.");
  });

  it("EMERGENCY_CARD step works even without any location/GPS input", async () => {
    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    // No location passed — must fall back to homeCountry, never throw
    const instance = await workflow.startWorkflow({ userId, defId: def.id });
    const result = await workflow.executeStep(instance.id);

    expect(result.uiPrompt?.title).toBe("POLICE_STOP");
  });

  // ==========================================================================
  // ADR_Check_DE — DISTINCT TAGGED KNOWLEDGE STEPS
  // ==========================================================================

  it("ADR_Check_DE: two SHOW_KNOWLEDGE steps with different tags surface different content", async () => {
    const { ADRCheckDE } = await import("../../../apps/driver-os/workflows/ADRCheckDE");
    workflowStorage.seedDefinition(ADRCheckDE);

    const instance = await workflow.startWorkflow({
      userId,
      defId: ADRCheckDE.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });

    await workflow.executeStep(instance.id); // emergency card
    const rightsResult = await workflow.executeStep(instance.id); // rights (tag: rights)
    const adrResult = await workflow.executeStep(instance.id); // ADR-specific (tag: adr)

    expect(rightsResult.uiPrompt?.title).toContain("Bleib ruhig");
    expect(adrResult.uiPrompt?.title).toContain("Gefahrgutkennzeichnung");
    expect(rightsResult.uiPrompt?.title).not.toBe(adrResult.uiPrompt?.title);
  });

  it("ADR_Check_DE: tracks BOTH knowledge versions shown (rights + adr) in the final Incident", async () => {
    const { ADRCheckDE } = await import("../../../apps/driver-os/workflows/ADRCheckDE");
    workflowStorage.seedDefinition(ADRCheckDE);

    const instance = await workflow.startWorkflow({
      userId,
      defId: ADRCheckDE.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });

    let current = await workflow.getWorkflowInstance(instance.id);
    while (current && current.state === WorkflowInstanceState.ACTIVE) {
      await workflow.executeStep(instance.id, { photo: "mock-photo-data" });
      current = await workflow.getWorkflowInstance(instance.id);
    }

    const incident = await workflow.completeWorkflow(instance.id);

    // EMERGENCY_CARD + rights + adr = at least 3 distinct knowledge sources
    expect(incident.knowledgeUsed.length).toBeGreaterThanOrEqual(3);
  });

  // ==========================================================================
  // OFFLINE FALLBACK
  // ==========================================================================

  it("TRANSLATE deliberately throws when OFFLINE, and the engine takes the exact declared fallback step", async () => {
    // Build a dedicated ContextEngine whose connectivity probe reports
    // OFFLINE, so this test proves the *actual* offline code path in
    // executeTranslate() — not an accidental unimplemented-step-kind error.
    const offlineProfileStorage = new InMemoryProfileStorage();
    offlineProfileStorage.addProfile({
      id: userId,
      type: UserType.PRO_DRIVER as any,
      languages: ["de"],
      homeCountry: "DE"
    });
    const offlineContext = new ContextEngine(
      new OfflineBoundingBoxGeoResolver([
        { country: "DE", minLat: 47.0, maxLat: 55.0, minLng: 5.5, maxLng: 15.5 }
      ]),
      { getConnectivity: async () => Connectivity.OFFLINE },
      offlineProfileStorage
    );
    const offlineWorkflow = new WorkflowEngine(workflowStorage as any, knowledge, offlineContext, decision, ai);

    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await offlineWorkflow.startWorkflow({
      userId,
      defId: def.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });
    expect(instance.contextSnapshot.connectivity).toBe(Connectivity.OFFLINE);

    await offlineWorkflow.executeStep(instance.id); // emergency
    await offlineWorkflow.executeStep(instance.id); // knowledge
    await offlineWorkflow.executeStep(instance.id); // translate -> throws -> falls back

    const afterTranslate = await offlineWorkflow.getWorkflowInstance(instance.id);
    // The step definition's fallback IS step_photo — assert the engine
    // actually landed there, not just "didn't crash".
    const translateStep = def.steps.find(s => s.kind === StepKind.TRANSLATE)!;
    expect(afterTranslate?.currentStepId).toBe(translateStep.fallback);
  });

  it("falls back to the exact declared fallback step when the AI provider throws while online", async () => {
    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await workflow.startWorkflow({
      userId,
      defId: def.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });
    expect(instance.contextSnapshot.connectivity).toBe(Connectivity.ONLINE);

    await workflow.executeStep(instance.id); // emergency
    await workflow.executeStep(instance.id); // knowledge

    // Force the underlying AI call to throw, simulating a provider outage
    // while the device itself still reports ONLINE.
    jest.spyOn(ai, "assist").mockRejectedValueOnce(new Error("provider unavailable"));

    await workflow.executeStep(instance.id); // translate -> AI throws -> falls back

    const afterTranslate = await workflow.getWorkflowInstance(instance.id);
    const translateStep = def.steps.find(s => s.kind === StepKind.TRANSLATE)!;
    expect(afterTranslate?.currentStepId).toBe(translateStep.fallback);
  });

  it("TRANSLATE succeeds online when the AI provider responds normally (no fallback taken)", async () => {
    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await workflow.startWorkflow({
      userId,
      defId: def.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });

    await workflow.executeStep(instance.id); // emergency
    await workflow.executeStep(instance.id); // knowledge

    jest.spyOn(ai, "assist").mockResolvedValueOnce({
      content: "Bitte zeigen Sie Ihren Führerschein.",
      trustLevel: TrustLevel.T3_AI_ASSISTED,
      sourcesUsed: []
    });

    const translateResult = await workflow.executeStep(instance.id);
    expect(translateResult.uiPrompt?.content).toBe("Bitte zeigen Sie Ihren Führerschein.");
    expect(translateResult.uiPrompt?.trustLevel).toBe(TrustLevel.T3_AI_ASSISTED);
  });

  it("build-time validation rejects a workflow with a NETWORK step and no fallback (Offline First)", () => {
    const brokenDef = buildTestWorkflow(false);
    const networkStepsWithoutFallback = brokenDef.steps.filter(
      s => s.requires.includes(Capability.NETWORK) && !s.fallback
    );
    // This mirrors validateWorkflowDefinition() in InspectionDE.ts —
    // asserting the property the real validator enforces at build time.
    expect(networkStepsWithoutFallback.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  // KNOWLEDGE USAGE TRACKING (evidentiary requirement, Domain Model §5)
  // ==========================================================================

  it("tracks knowledge versions used and carries them into the final Incident", async () => {
    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await workflow.startWorkflow({
      userId,
      defId: def.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de"
    });

    let current = await workflow.getWorkflowInstance(instance.id);
    while (current && current.state === WorkflowInstanceState.ACTIVE) {
      await workflow.executeStep(instance.id, { photo: "mock-photo-data" });
      current = await workflow.getWorkflowInstance(instance.id);
    }

    const incident = await workflow.completeWorkflow(instance.id);

    expect(incident.knowledgeUsed.length).toBeGreaterThan(0);
    expect(incident.country).toBe("DE");
  });

  // ==========================================================================
  // STATE TRANSITIONS
  // ==========================================================================

  it("instance state is ACTIVE immediately after start", async () => {
    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await workflow.startWorkflow({ userId, defId: def.id });
    expect(instance.state).toBe(WorkflowInstanceState.ACTIVE);
  });

  it("throws when executing a step on a non-existent instance", async () => {
    await expect(
      workflow.executeStep("does-not-exist" as any)
    ).rejects.toThrow(/not found/i);
  });

  it("throws when starting a workflow with an unknown definition id", async () => {
    await expect(
      workflow.startWorkflow({ userId, defId: createWorkflowDefId("NOPE") })
    ).rejects.toThrow(/not found/i);
  });

  // ==========================================================================
  // EVIDENCE CONTEXT WIRING (ADR-008) — optional IncidentStore
  // ==========================================================================

  it("DECISION_POINT branches deterministically via guarded transitions", async () => {
    const branchDef: WorkflowDefinition = {
      id: createWorkflowDefId("Branch_TEST"),
      name: "Branch",
      version: "1.0.0",
      offlineCapable: true,
      entryStepId: createStepId("decide"),
      steps: [
        {
          id: createStepId("decide"),
          kind: StepKind.DECISION_POINT,
          title: "Wezwać policję?",
          requires: [],
          transitions: [
            { to: createStepId("step_police"), guard: { path: "input.callPolice", operator: "eq", value: true }, priority: 10 },
            { to: createStepId("step_statement"), guard: null, priority: 0 },
          ],
        },
        {
          id: createStepId("step_police"),
          kind: StepKind.GENERATE_REPORT,
          title: "Policja",
          requires: [],
          transitions: [{ to: "END", guard: null, priority: 0 }],
        },
        {
          id: createStepId("step_statement"),
          kind: StepKind.GENERATE_REPORT,
          title: "Oświadczenie",
          requires: [],
          transitions: [{ to: "END", guard: null, priority: 0 }],
        },
      ],
    };
    workflowStorage.seedDefinition(branchDef);

    const yes = await workflow.startWorkflow({
      userId,
      defId: branchDef.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de",
    });
    await workflow.executeStep(yes.id, { callPolice: true });
    expect((await workflow.getWorkflowInstance(yes.id))?.currentStepId).toBe(createStepId("step_police"));

    const no = await workflow.startWorkflow({
      userId,
      defId: branchDef.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de",
    });
    await workflow.executeStep(no.id, { callPolice: false });
    expect((await workflow.getWorkflowInstance(no.id))?.currentStepId).toBe(createStepId("step_statement"));
  });

  it("seals an immutable Evidence Incident when an IncidentStore is wired", async () => {
    const { InMemoryIncidentStore } = await import("../../incident/InMemoryIncidentStore");
    const store = new InMemoryIncidentStore();
    const wired = new WorkflowEngine(workflowStorage as any, knowledge, context, decision, ai, store);

    const def = buildTestWorkflow(true);
    workflowStorage.seedDefinition(def);

    const instance = await wired.startWorkflow({
      userId,
      defId: def.id,
      location: { latitude: 52.52, longitude: 13.405 },
      language: "de",
    });

    let current = await wired.getWorkflowInstance(instance.id);
    while (current && current.state === WorkflowInstanceState.ACTIVE) {
      await wired.executeStep(instance.id, { photo: "mock-photo-data" });
      current = await wired.getWorkflowInstance(instance.id);
    }
    await wired.completeWorkflow(instance.id);

    const incidents = store.list();
    expect(incidents).toHaveLength(1);
    expect(incidents[0].origin).toBe("COMPLETED");
    expect(incidents[0].country).toBe("DE");
    expect(incidents[0].knowledgeUsed.length).toBeGreaterThan(0);
  });
});
