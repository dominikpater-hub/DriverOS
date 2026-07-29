// apps/driver-os/workflows/InspectionDE.ts
//
// Faza B, item 1 (Artefakt #0003 plan §9): mechanical migration of the
// Inspection_DE workflow from the pre-platform shape (STARTUP_CHECKLIST.md,
// BUILD_STATUS.md — "5 steps: EMERGENCY_CARD → SHOW_KNOWLEDGE → TRANSLATE →
// CAPTURE_PHOTO → GENERATE_REPORT") into the versioned WorkflowVersion
// format from §1.3.
//
// Old `requires` / `fallback` / `next` map 1:1 onto
// `requiredCapabilities` / `offline.fallbackStepId` / `transitions`,
// exactly as promised — no behavioural change, only shape.
//
// Per ADR-009 (§7.3 rule 1): this file lives under apps/driver-os and is
// PURE DATA. It contains no engine logic, and it must not import from
// core/knowledge, core/context, core/decision, or core/ai directly — the
// dependency-cruiser gate (.dependency-cruiser.js) enforces that.

import { Capability } from "../../../shared/platform/capability";
import type {
  DateTime,
  Hash,
  LanguageCode,
  PublisherId,
  SemVer,
  StepId,
  WorkflowDefId,
  WorkflowVersionId,
} from "../../../shared/platform/ids";
import type { StepDefinition, WorkflowDefinition, WorkflowVersion } from "../../../shared/platform/workflow";
import { FailureClass, OfflinePolicy, StepKind, WorkflowDomain } from "../../../shared/platform/workflow";

const de = "de" as LanguageCode;

const stepIds = {
  emergency: "step_emergency" as StepId,
  rights: "step_knowledge_rights" as StepId,
  translate: "step_translate" as StepId,
  photo: "step_photo" as StepId,
  report: "step_report" as StepId,
};

const steps: StepDefinition[] = [
  {
    id: stepIds.emergency,
    kind: StepKind.EMERGENCY_CARD,
    title: { [de]: "Deine Rechte" },
    requiredCapabilities: [],
    optionalCapabilities: [Capability.GPS], // enriches the card with local emergency numbers, never blocks it
    preconditions: [],
    postconditions: [],
    transitions: [{ to: stepIds.rights, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null }, // TIER_0, always local
    timeoutMs: null,
  },
  {
    id: stepIds.rights,
    kind: StepKind.SHOW_KNOWLEDGE,
    title: { [de]: "Verkehrskontrolle — deine Rechte" },
    knowledgeRef: "rights", // = search tag; matches seeded knowledge entry tags ["rights", ...]
    requiredCapabilities: [],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: stepIds.translate, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null }, // TIER_1 knowledge, bundled per-country
    timeoutMs: null,
  },
  {
    id: stepIds.translate,
    kind: StepKind.TRANSLATE,
    title: { [de]: "Dokumente übersetzen" },
    requiredCapabilities: [Capability.NETWORK, Capability.TRANSLATION],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: stepIds.photo, guard: null, priority: 0 }],
    retry: {
      maxAttempts: 2,
      backoff: "LINEAR",
      baseDelayMs: 500,
      retryOn: [FailureClass.TRANSIENT, FailureClass.NETWORK],
    },
    rollback: null,
    // W-05: NETWORK requires FALLBACK with a target — offline falls back to
    // static phrase cards bundled in TIER_1 (Domain Model §9 flow).
    offline: { mode: "FALLBACK", fallbackStepId: stepIds.photo },
    timeoutMs: 8000,
  },
  {
    id: stepIds.photo,
    kind: StepKind.CAPTURE_PHOTO,
    title: { [de]: "Beweisfoto aufnehmen" },
    requiredCapabilities: [Capability.CAMERA],
    optionalCapabilities: [Capability.GPS], // geo-tags the photo if available
    preconditions: [],
    postconditions: [],
    transitions: [{ to: stepIds.report, guard: null, priority: 0 }],
    retry: null,
    rollback: { mode: "NONE", compensationStepId: null }, // skipping a photo doesn't require compensation
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
  },
  {
    id: stepIds.report,
    kind: StepKind.GENERATE_REPORT,
    title: { [de]: "Bericht erstellen" },
    requiredCapabilities: [],
    optionalCapabilities: [Capability.OFFLINE_STORAGE],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: "END", guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null }, // report generation never needs network
    timeoutMs: null,
  },
];

export const inspectionDEVersion: WorkflowVersion = {
  id: "Inspection_DE@1.0.0#a3f9" as WorkflowVersionId,
  definitionId: "Inspection_DE" as WorkflowDefId,
  version: "1.0.0" as SemVer,
  entryStepId: stepIds.emergency,
  steps,
  requiredCapabilities: [Capability.NETWORK, Capability.TRANSLATION, Capability.CAMERA],
  optionalCapabilities: [Capability.GPS, Capability.OFFLINE_STORAGE],
  offlinePolicy: OfflinePolicy.FULL_OFFLINE,
  localization: [de],
  publishedAt: "2026-07-18T00:00:00Z" as DateTime,
  publishedBy: "admin@guardian.de" as PublisherId,
  supersededBy: null,
  checksum: "sha256:a3f9c7e1" as Hash, // placeholder — real checksum computed by WorkflowPackageBuilder
};

export const inspectionDEDefinition: WorkflowDefinition = {
  id: "Inspection_DE" as WorkflowDefId,
  name: "Verkehrskontrolle — Deutschland",
  domain: WorkflowDomain.INSPECTION,
  versions: [inspectionDEVersion.id],
  currentVersion: inspectionDEVersion.id,
};
