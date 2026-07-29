// apps/travel-os/workflows/BorderCrossing.version.ts
// TravelOS's first workflow, authored purely as data on the SAME platform
// types DriverOS uses (ADR-005 WorkflowVersion). No engine code, no core/
// changes — the dependency-cruiser gate proves it. Traveller crossing a
// non-EU border (e.g. CH): rights card → what to show → translate the
// officer → report. Offline-first: translation degrades to a fallback.

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
import type {
  StepDefinition,
  WorkflowDefinition,
  WorkflowVersion,
} from "../../../shared/platform/workflow";
import { OfflinePolicy, StepKind, WorkflowDomain } from "../../../shared/platform/workflow";

const en = "en" as LanguageCode;

const stepIds = {
  rights: "step_border_rights" as StepId,
  show: "step_border_show" as StepId,
  translate: "step_border_translate" as StepId,
  report: "step_border_report" as StepId,
};

const steps: StepDefinition[] = [
  {
    id: stepIds.rights,
    kind: StepKind.EMERGENCY_CARD,
    title: { [en]: "Your rights at the border" },
    requiredCapabilities: [],
    optionalCapabilities: [Capability.GPS],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: stepIds.show, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
  },
  {
    id: stepIds.show,
    kind: StepKind.SHOW_KNOWLEDGE,
    title: { [en]: "What to present" },
    requiredCapabilities: [],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: stepIds.translate, guard: null, priority: 0 }],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
    knowledgeRef: "border-rights-eu", // W-09: must exist in the bundled knowledge package
  },
  {
    id: stepIds.translate,
    kind: StepKind.TRANSLATE,
    title: { [en]: "Say it to the officer" },
    requiredCapabilities: [Capability.NETWORK, Capability.TRANSLATION],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [{ to: stepIds.report, guard: null, priority: 0 }],
    retry: { maxAttempts: 2, backoff: "LINEAR", baseDelayMs: 500, retryOn: ["NETWORK"] as any },
    rollback: null,
    // W-05: a NETWORK step must have offline.mode = FALLBACK with a target.
    offline: { mode: "FALLBACK", fallbackStepId: stepIds.report },
    timeoutMs: 8000,
  },
  {
    id: stepIds.report,
    kind: StepKind.GENERATE_REPORT,
    title: { [en]: "Create a record" },
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

export const borderCrossingVersion: WorkflowVersion = {
  id: "Border_Crossing@1.0.0#b1c2" as WorkflowVersionId,
  definitionId: "Border_Crossing" as WorkflowDefId,
  version: "1.0.0" as SemVer,
  entryStepId: stepIds.rights,
  steps,
  requiredCapabilities: [Capability.NETWORK, Capability.TRANSLATION],
  optionalCapabilities: [Capability.GPS, Capability.OFFLINE_STORAGE],
  offlinePolicy: OfflinePolicy.FULL_OFFLINE,
  localization: [en],
  publishedAt: "2026-07-27T00:00:00Z" as DateTime,
  publishedBy: "admin@guardian.eu" as PublisherId,
  supersededBy: null,
  checksum: "sha256:b1c2d3e4" as Hash,
};

export const borderCrossingDefinition: WorkflowDefinition = {
  id: "Border_Crossing" as WorkflowDefId,
  name: "Border Crossing — Non-EU",
  domain: WorkflowDomain.BORDER,
  versions: [borderCrossingVersion.id],
  currentVersion: borderCrossingVersion.id,
};
