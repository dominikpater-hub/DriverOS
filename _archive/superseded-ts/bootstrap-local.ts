/**
 * LOCAL BOOTSTRAP / SMOKE TEST
 *
 * Wires all five engines together with in-memory storage, seeds minimal
 * German knowledge + rules, and runs the Inspection_DE workflow end to end.
 *
 * Run with: npx ts-node scripts/bootstrap-local.ts
 *
 * This is the fastest way for a new team member to see the whole
 * architecture actually execute, before any real database exists.
 */

import { KnowledgeEngine, KnowledgePublisher } from "../core/knowledge/KnowledgeEngine";
import { InMemoryKnowledgeStorage } from "../core/knowledge/storage/InMemoryKnowledgeStorage";
import { DecisionEngine } from "../core/decision/DecisionEngine";
import { InMemoryRuleStorage } from "../core/decision/storage/InMemoryRuleStorage";
import {
  ContextEngine,
  OfflineBoundingBoxGeoResolver,
  BrowserConnectivityProbe,
  InMemoryProfileStorage
} from "../core/context/ContextEngine";
import { WorkflowEngine } from "../core/workflow/WorkflowEngine";
import { InMemoryWorkflowStorage } from "../core/workflow/storage/InMemoryWorkflowStorage";
import { AIEngine, ClaudeAPIProvider } from "../core/ai/AIEngine";

import { InspectionDE } from "../apps/driver-os/workflows/InspectionDE";
import { DriverOSRules } from "../apps/driver-os/rules/DriverOSRules";

import {
  createKnowledgeId,
  createUserId,
  createInstanceId,
  ConfidenceLevel,
  UserType,
  WorkflowInstanceState
} from "../shared/types";

async function main() {
  console.log("=== Guardian Engine — Local Bootstrap ===\n");

  // --------------------------------------------------------------------
  // 1. KNOWLEDGE ENGINE — seed German traffic rights
  // --------------------------------------------------------------------
  const knowledgeStorage = new InMemoryKnowledgeStorage();
  const knowledge = new KnowledgeEngine(knowledgeStorage as any);
  const publisher = new KnowledgePublisher(knowledgeStorage as any);

  const entryId = createKnowledgeId("traffic-rights-de");
  knowledgeStorage.seedEntry({
    id: entryId,
    domain: "TRAFFIC_LAW",
    country: "DE",
    scope: "NATIONAL",
    tags: ["rights", "inspection"],
    versions: [],
    currentVersionId: undefined as any,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  await publisher.publishVersion(entryId, {
    language: "de",
    content: {
      summary: "Bleib ruhig und zeige gültige Papiere.",
      actions: [
        { order: 1, text: "Fahrzeug sicher anhalten", critical: true },
        { order: 2, text: "Führerschein und Fahrzeugpapiere bereithalten", critical: true }
      ],
      rights: ["Du hast das Recht zu schweigen.", "Du kannst einen Anwalt anfordern."],
      warnings: ["Versuche nicht zu fliehen.", "Widersetze dich nicht körperlich."],
      details: "Vollständiger Text zu Rechten bei einer Verkehrskontrolle in Deutschland...",
      legalRefs: [{ type: "LAW_TEXT", reference: "StVO §36", retrievedAt: new Date() }]
    },
    sources: [{
      type: "OFFICIAL_SITE",
      reference: "https://www.gesetze-im-internet.de/stvo/",
      retrievedAt: new Date()
    }],
    confidence: ConfidenceLevel.OFFICIAL,
    effectiveDate: new Date(),
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    verifiedBy: "admin@guardian.de",
    nextReviewDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  });

  await publisher.publishEmergencyCard("DE", {
    type: "POLICE_STOP",
    content: {
      summary: "Notfallkarte: Polizeikontrolle",
      actions: [{ order: 1, text: "112 anrufen bei echtem Notfall", critical: true }],
      rights: ["Recht auf Schweigen", "Recht auf Konsularische Hilfe"],
      warnings: [],
      details: "Immer offline verfügbar (TIER_0).",
      legalRefs: []
    },
    contacts: [
      { type: "EMERGENCY", name: "Polizei / Rettung", number: "112", language: "de" },
      { type: "CONSULATE", name: "Konsulat (Beispiel)", number: "+49-30-000000", language: "de" }
    ]
  });

  console.log("✅ Knowledge Engine: seeded German traffic rights + emergency card\n");

  // --------------------------------------------------------------------
  // 2. DECISION ENGINE — load DriverOS rules
  // --------------------------------------------------------------------
  const ruleStorage = new InMemoryRuleStorage();
  for (const rule of DriverOSRules) {
    await ruleStorage.saveRule(rule as any);
  }
  const decision = new DecisionEngine(ruleStorage);
  await decision.initialize();

  const outcome = await decision.matchRules({
    country: "DE",
    eventType: "ROAD_INSPECTION",
    vehicle: { category: "TRUCK" }
  });
  console.log("✅ Decision Engine: matched outcome ->", outcome, "\n");

  // --------------------------------------------------------------------
  // 3. CONTEXT ENGINE — build situation for a test driver
  // --------------------------------------------------------------------
  const profileStorage = new InMemoryProfileStorage();
  const userId = createUserId("driver-001");
  profileStorage.addProfile({
    id: userId,
    type: UserType.PRO_DRIVER as any,
    languages: ["de"],
    homeCountry: "DE"
  });

  const geoResolver = new OfflineBoundingBoxGeoResolver([
    { country: "DE", minLat: 47.0, maxLat: 55.0, minLng: 5.5, maxLng: 15.5 }
  ]);
  const context = new ContextEngine(geoResolver, new BrowserConnectivityProbe(), profileStorage);

  const situationContext = await context.buildContext({
    userId,
    location: { latitude: 52.52, longitude: 13.405 }, // Berlin
    language: "de"
  });
  console.log("✅ Context Engine: built context ->", situationContext, "\n");

  // --------------------------------------------------------------------
  // 4. AI ENGINE — mocked provider (no real API key needed for smoke test)
  // --------------------------------------------------------------------
  const ai = new AIEngine(new ClaudeAPIProvider("mock-key"));

  // --------------------------------------------------------------------
  // 5. WORKFLOW ENGINE — run Inspection_DE end to end
  // --------------------------------------------------------------------
  const workflowStorage = new InMemoryWorkflowStorage();
  workflowStorage.seedDefinition(InspectionDE);

  const workflow = new WorkflowEngine(
    workflowStorage as any,
    knowledge,
    context,
    decision,
    ai
  );

  const instance = await workflow.startWorkflow({
    userId,
    defId: InspectionDE.id,
    location: { latitude: 52.52, longitude: 13.405 }, // Berlin
    language: "de"
  });
  console.log("✅ Workflow started:", instance.id, "| step:", instance.currentStepId, "\n");

  // Walk through every step until the workflow completes
  let stepCount = 0;
  let current = await workflow.getWorkflowInstance(instance.id);
  while (current && current.state === WorkflowInstanceState.ACTIVE && stepCount < 10) {
    const result = await workflow.executeStep(instance.id, { photo: "base64-mock-photo" });
    console.log(`  step ${++stepCount}: ${result.kind} ->`, result.uiPrompt?.title ?? "(no UI prompt)");
    current = await workflow.getWorkflowInstance(instance.id);
  }

  const incident = await workflow.completeWorkflow(instance.id);
  console.log("\n✅ Incident generated:", incident.id);
  console.log("   knowledgeUsed:", incident.knowledgeUsed);

  console.log("\n=== Bootstrap complete. All five engines talked to each other. ===");
}

main().catch(err => {
  console.error("❌ Bootstrap failed:", err);
  process.exit(1);
});
