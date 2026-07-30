// core/offline/__tests__/OfflineFirst.test.ts
//
// M3 FLAGSHIP TEST — the platform's most important unbuilt principle, now built
// and enforced: a critical workflow runs fully OFFLINE. With the
// ConnectivityCapabilityProbe wired in, a step that declares Capability.NETWORK
// is routed to its EXACT declared fallback when the device is offline — proven,
// not assumed.

import { WorkflowEngine, WorkflowDefinition } from "../../workflow/WorkflowEngine";
import { InMemoryWorkflowStorage } from "../../workflow/storage/InMemoryWorkflowStorage";
import { KnowledgeEngine, KnowledgePublisher } from "../../knowledge/KnowledgeEngine";
import { InMemoryKnowledgeStorage } from "../../knowledge/storage/InMemoryKnowledgeStorage";
import { DecisionEngine } from "../../decision/DecisionEngine";
import { InMemoryRuleStorage } from "../../decision/storage/InMemoryRuleStorage";
import {
  ContextEngine,
  OfflineBoundingBoxGeoResolver,
  InMemoryProfileStorage
} from "../../context/ContextEngine";
import { AIEngine, ClaudeAPIProvider } from "../../ai/AIEngine";
import { ConnectivityCapabilityProbe } from "../ConnectivityCapabilityProbe";
import {
  createKnowledgeId, createUserId, createWorkflowDefId, createStepId,
  ConfidenceLevel, UserType, StepKind, Capability, Connectivity, WorkflowInstanceState
} from "../../../shared/types";

const userId = createUserId("driver-offline");

function offlineWorkflow(withFallback: boolean) {
  const workflowStorage = new InMemoryWorkflowStorage();
  const knowledgeStorage = new InMemoryKnowledgeStorage();
  const knowledge = new KnowledgeEngine(knowledgeStorage as any);
  const publisher = new KnowledgePublisher(knowledgeStorage as any);

  const profileStorage = new InMemoryProfileStorage();
  profileStorage.addProfile({ id: userId, type: UserType.PRO_DRIVER as any, languages: ["de"], homeCountry: "DE" });
  const context = new ContextEngine(
    new OfflineBoundingBoxGeoResolver([{ country: "DE", minLat: 47, maxLat: 55, minLng: 5.5, maxLng: 15.5 }]),
    { getConnectivity: async () => Connectivity.OFFLINE }, // device is OFFLINE
    profileStorage
  );

  const decision = new DecisionEngine(new InMemoryRuleStorage());
  const ai = new AIEngine(new ClaudeAPIProvider("mock"));

  const engine = new WorkflowEngine(
    workflowStorage as any, knowledge, context, decision, ai,
    undefined,                             // no Evidence store
    new ConnectivityCapabilityProbe()      // M3: offline = network capabilities unavailable
  );

  const def: WorkflowDefinition = {
    id: createWorkflowDefId("Offline_Critical"),
    name: "Offline critical",
    version: "1.0.0",
    offlineCapable: true,
    entryStepId: createStepId("collect"),
    steps: [
      { id: createStepId("collect"), kind: StepKind.COLLECT_INPUT, title: "Was ist passiert?", requires: [], next: createStepId("translate") },
      {
        id: createStepId("translate"),
        kind: StepKind.TRANSLATE,
        title: "Übersetzen",
        requires: [Capability.NETWORK],                                   // needs network
        fallback: withFallback ? createStepId("phrasecard") : undefined,  // offline safety net
        next: createStepId("report")
      },
      { id: createStepId("phrasecard"), kind: StepKind.SHOW_KNOWLEDGE, title: "Offline-Sätze", requires: [], next: createStepId("report") },
      { id: createStepId("report"), kind: StepKind.GENERATE_REPORT, title: "Bericht", requires: [], next: undefined }
    ]
  };
  workflowStorage.seedDefinition(def);
  return { engine, def, publisher, knowledgeStorage };
}

describe("Offline First — flagship invariant (M3)", () => {
  test("a NETWORK step offline is routed to its EXACT declared fallback (capability-driven)", async () => {
    const { engine, def } = offlineWorkflow(true);

    const inst = await engine.startWorkflow({
      userId, defId: def.id, location: { latitude: 52.52, longitude: 13.405 }, language: "de"
    });
    expect(inst.contextSnapshot.connectivity).toBe(Connectivity.OFFLINE);

    await engine.executeStep(inst.id, { what: "kontrola" }); // collect -> translate
    await engine.executeStep(inst.id);                       // translate: NETWORK missing -> fallback

    const after = await engine.getWorkflowInstance(inst.id);
    const translateStep = def.steps.find((s) => s.kind === StepKind.TRANSLATE)!;
    expect(after?.currentStepId).toBe(translateStep.fallback); // landed on the phrase card, not crashed
  });

  test("the whole critical workflow completes offline end to end", async () => {
    const { engine, def } = offlineWorkflow(true);

    const inst = await engine.startWorkflow({
      userId, defId: def.id, location: { latitude: 52.52, longitude: 13.405 }, language: "de"
    });

    let current = await engine.getWorkflowInstance(inst.id);
    let steps = 0;
    while (current && current.state === WorkflowInstanceState.ACTIVE && steps < 10) {
      await engine.executeStep(inst.id, { what: "kontrola" });
      current = await engine.getWorkflowInstance(inst.id);
      steps++;
    }
    expect(current?.state).toBe(WorkflowInstanceState.COMPLETED); // reached the end offline
  });

  test("without a fallback, a NETWORK step offline fails loudly (no silent skip)", async () => {
    const { engine, def } = offlineWorkflow(false);

    const inst = await engine.startWorkflow({
      userId, defId: def.id, location: { latitude: 52.52, longitude: 13.405 }, language: "de"
    });
    await engine.executeStep(inst.id, { what: "kontrola" }); // collect -> translate
    await expect(engine.executeStep(inst.id)).rejects.toThrow(/capabilit/i);
  });
});
