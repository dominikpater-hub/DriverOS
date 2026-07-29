/**
 * WORKFLOW: ADR_Check_DE — authored as a platform WorkflowVersion (Faza 1.3).
 *
 * German road inspection for trucks carrying dangerous goods (ADR class).
 * Routed to by DriverOSRules when country=DE, eventType=ROAD_INSPECTION,
 * vehicle.category=TRUCK, vehicle.adrClass set — a stricter superset of
 * Inspection_DE with an extra ADR-specific SHOW_KNOWLEDGE step (tag "adr").
 *
 * Authored once as WorkflowVersion (canonical, versioned, validated), then
 * compiled to the runtime shape the engine executes. `ADRCheckDE` stays a
 * runtime WorkflowDefinition so bootstrap + integration tests are unchanged.
 */

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
import type { StepDefinition, WorkflowVersion } from "../../../shared/platform/workflow";
import { OfflinePolicy, StepKind, WorkflowDomain } from "../../../shared/platform/workflow";

import { compileWorkflowVersion } from "../../../core/workflow/compileWorkflowVersion";
import { validateWorkflowDefinition } from "../../../core/workflow/validateWorkflowDefinition";

const de = "de" as LanguageCode;

const s = {
  emergency: "adr_step_emergency_card" as StepId,
  rights: "adr_step_show_rights" as StepId,
  adr: "adr_step_show_adr" as StepId,
  translate: "adr_step_translate" as StepId,
  photo: "adr_step_capture_photo" as StepId,
  report: "adr_step_generate_report" as StepId,
};

const steps: StepDefinition[] = [
  {
    id: s.emergency,
    kind: StepKind.EMERGENCY_CARD,
    title: { [de]: "Deine Rechte" },
    requiredCapabilities: [],
    optionalCapabilities: [Capability.GPS],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: s.rights, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
  },
  {
    id: s.rights,
    kind: StepKind.SHOW_KNOWLEDGE,
    title: { [de]: "Was du wissen musst" },
    requiredCapabilities: [],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: s.adr, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
    knowledgeRef: "rights",
  },
  {
    id: s.adr,
    kind: StepKind.SHOW_KNOWLEDGE,
    title: { [de]: "ADR-Anforderungen" },
    requiredCapabilities: [],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: s.translate, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
    knowledgeRef: "adr", // distinct tag from rights — surfaces different content
  },
  {
    id: s.translate,
    kind: StepKind.TRANSLATE,
    title: { [de]: "Dokumente übersetzen" },
    requiredCapabilities: [Capability.NETWORK],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: s.photo, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "FALLBACK", fallbackStepId: s.photo },
    timeoutMs: 8000,
  },
  {
    id: s.photo,
    kind: StepKind.CAPTURE_PHOTO,
    title: { [de]: "Beförderungspapiere / Kennzeichnung fotografieren" },
    requiredCapabilities: [Capability.CAMERA],
    optionalCapabilities: [Capability.GPS],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: s.report, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
  },
  {
    id: s.report,
    kind: StepKind.GENERATE_REPORT,
    title: { [de]: "Bericht erstellen" },
    requiredCapabilities: [],
    optionalCapabilities: [Capability.OFFLINE_STORAGE],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: "END", guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
  },
];

export const adrCheckDEVersion: WorkflowVersion = {
  id: "ADR_Check_DE@1.0.0#c4d5" as WorkflowVersionId,
  definitionId: "ADR_Check_DE" as WorkflowDefId,
  version: "1.0.0" as SemVer,
  entryStepId: s.emergency,
  steps,
  requiredCapabilities: [Capability.NETWORK, Capability.CAMERA],
  optionalCapabilities: [Capability.GPS, Capability.OFFLINE_STORAGE],
  offlinePolicy: OfflinePolicy.FULL_OFFLINE,
  localization: [de],
  publishedAt: "2026-07-18T00:00:00Z" as DateTime,
  publishedBy: "admin@guardian.de" as PublisherId,
  supersededBy: null,
  checksum: "sha256:c4d5e6f7" as Hash,
};

// Compiled runtime form the engine executes. Kept as the module's main export
// so bootstrap + integration tests consume it unchanged.
export const ADRCheckDE = compileWorkflowVersion(adrCheckDEVersion, "Gefahrgutkontrolle — Deutschland");

// Build-time guard on the compiled runtime (unchanged behaviour).
validateWorkflowDefinition(ADRCheckDE);

// WorkflowDomain kept referenced for authoring clarity (domain = INSPECTION superset).
void WorkflowDomain;
