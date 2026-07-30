// @guardian-engine/driver-os-runtime
//
// COMPOSITION ROOT for DriverOS. This is the one place that knows how to wire
// the five engines together, seed a minimal knowledge/rule set, and hand back
// a ready-to-use IWorkflowPort. It exists OUTSIDE apps/ on purpose:
//
//   Domain Model §1 rule 3 (arch-gate `apps-only-import-workflow-and-shared`):
//   a product app may import only the Workflow Engine + shared — never the
//   Knowledge/Context/Decision/AI engines directly. The wiring that DOES touch
//   all of them is therefore a package, not part of the app. The UI consumes
//   THIS module and gets a composed IWorkflowPort, so the boundary holds.
//
// This mirrors scripts/bootstrap-local.ts (the node smoke test) but returns the
// composed objects instead of running them, so a browser (or any host) can
// drive the real engines. Everything here is in-memory + a MOCK AI provider —
// real persistence (M3) and a real provider behind the proxy (M4) swap in at
// this seam without any app change.

import { KnowledgeEngine, KnowledgePublisher } from "../../../core/knowledge/KnowledgeEngine";
import { InMemoryKnowledgeStorage } from "../../../core/knowledge/storage/InMemoryKnowledgeStorage";
import { DecisionEngine } from "../../../core/decision/DecisionEngine";
import { InMemoryRuleStorage } from "../../../core/decision/storage/InMemoryRuleStorage";
import {
  ContextEngine,
  OfflineBoundingBoxGeoResolver,
  BrowserConnectivityProbe,
  InMemoryProfileStorage
} from "../../../core/context/ContextEngine";
import { WorkflowEngine } from "../../../core/workflow/WorkflowEngine";
import { InMemoryWorkflowStorage } from "../../../core/workflow/storage/InMemoryWorkflowStorage";
import { AIEngine, ClaudeAPIProvider } from "../../../core/ai/AIEngine";
import { ConnectivityCapabilityProbe } from "../../../core/offline/ConnectivityCapabilityProbe";

import { InspectionDE } from "../../../apps/driver-os/workflows/InspectionDE";
import { ADRCheckDE } from "../../../apps/driver-os/workflows/ADRCheckDE";
import { DriverOSRules } from "../../../apps/driver-os/rules/DriverOSRules";

import type { IWorkflowPort } from "../../../core/workflow/ports";
import type { WorkflowDefId, UserId } from "../../../shared/types";
import {
  createKnowledgeId,
  createUserId,
  ConfidenceLevel,
  UserType
} from "../../../shared/types";

/** A workflow the launcher can offer, with a human label. */
export interface WorkflowCatalogEntry {
  id: WorkflowDefId;
  label: string;
}

export interface DriverOSRuntime {
  /** Composed Workflow Engine — the ONLY engine the UI talks to. */
  workflow: IWorkflowPort;
  /** Workflows this product exposes (DriverOS manifest catalog). */
  catalog: WorkflowCatalogEntry[];
  /** A seeded demo driver until real profiles/auth land. */
  userId: UserId;
}

/**
 * Seed the minimal German knowledge set both DriverOS workflows need:
 * traffic rights (tag "rights"), ADR requirements (tag "adr"), and a
 * TIER_0 police-stop emergency card. Kept in sync with bootstrap-local.ts.
 */
async function seedKnowledge(publisher: KnowledgePublisher, storage: InMemoryKnowledgeStorage): Promise<void> {
  const rightsId = createKnowledgeId("traffic-rights-de");
  storage.seedEntry({
    id: rightsId,
    domain: "TRAFFIC_LAW",
    country: "DE",
    scope: "NATIONAL",
    tags: ["rights", "inspection"],
    versions: [],
    currentVersionId: undefined as any,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await publisher.publishVersion(rightsId, {
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
    sources: [{ type: "OFFICIAL_SITE", reference: "https://www.gesetze-im-internet.de/stvo/", retrievedAt: new Date() }],
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

  const adrId = createKnowledgeId("adr-requirements-de");
  storage.seedEntry({
    id: adrId,
    domain: "ADR",
    country: "DE",
    scope: "NATIONAL",
    tags: ["adr"],
    versions: [],
    currentVersionId: undefined as any,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await publisher.publishVersion(adrId, {
    language: "de",
    content: {
      summary: "Gefahrgutkennzeichnung und Beförderungspapiere prüfen.",
      actions: [
        { order: 1, text: "Beförderungspapier bereithalten", critical: true },
        { order: 2, text: "Orangefarbene Tafeln und Gefahrzettel sichtbar halten", critical: true }
      ],
      rights: [],
      warnings: ["Fehlende Kennzeichnung kann ein Bußgeld nach sich ziehen."],
      details: "Vollständiger ADR-Text zu Kennzeichnungs- und Dokumentationspflichten...",
      legalRefs: [{ type: "LAW_TEXT", reference: "ADR Kapitel 5.3", retrievedAt: new Date() }]
    },
    sources: [{ type: "OFFICIAL_SITE", reference: "https://www.bmdv.de/adr", retrievedAt: new Date() }],
    confidence: ConfidenceLevel.OFFICIAL,
    effectiveDate: new Date(),
    verifiedBy: "admin@guardian.de",
    nextReviewDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  });
}

/**
 * Build a fully-wired DriverOS runtime. Async because Knowledge publishing and
 * Decision initialization are async. Call once and share the result.
 */
export async function createDriverOSRuntime(): Promise<DriverOSRuntime> {
  // 1. Knowledge
  const knowledgeStorage = new InMemoryKnowledgeStorage();
  const knowledge = new KnowledgeEngine(knowledgeStorage as any);
  const publisher = new KnowledgePublisher(knowledgeStorage as any);
  await seedKnowledge(publisher, knowledgeStorage);

  // 2. Decision — DriverOS rules
  const ruleStorage = new InMemoryRuleStorage();
  for (const rule of DriverOSRules) {
    await ruleStorage.saveRule(rule as any);
  }
  const decision = new DecisionEngine(ruleStorage);
  await decision.initialize();

  // 3. Context — one seeded demo driver
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

  // 4. AI — MOCK provider (browser-safe, no node deps). Real provider behind
  //    the proxy swaps in here at M4 without any app change.
  const ai = new AIEngine(new ClaudeAPIProvider("mock-key"));

  // 5. Workflow — the composed port the UI drives. Definitions seeded here.
  const workflowStorage = new InMemoryWorkflowStorage();
  workflowStorage.seedDefinition(InspectionDE);
  workflowStorage.seedDefinition(ADRCheckDE);
  // M3 Offline First: network-bound capabilities are unavailable offline, so a
  // step needing NETWORK/AI/TRANSLATION offline routes to its declared fallback.
  const workflow = new WorkflowEngine(
    workflowStorage as any, knowledge, context, decision, ai,
    undefined,
    new ConnectivityCapabilityProbe()
  );

  return {
    workflow,
    userId,
    catalog: [
      { id: InspectionDE.id, label: "Kontrola drogowa (DE)" },
      { id: ADRCheckDE.id, label: "Kontrola ADR (DE)" }
    ]
  };
}
