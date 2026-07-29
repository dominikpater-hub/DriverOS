// shared/types/workflow.ts
// TASK 1 / ADR-005 (Artefakt #0003 §1): Workflow is versioned exactly like
// Knowledge (ADR-002). WorkflowDefinition is a logical container;
// WorkflowVersion is immutable once published. Incidents and
// WorkflowInstances always reference a WorkflowVersionId, never "the
// current definition".

import type {
  DateTime,
  Hash,
  LanguageCode,
  PublisherId,
  SemVer,
  StepId,
  WorkflowDefId,
  WorkflowVersionId,
} from "./ids";
import type { Capability } from "./capability";
import type { PredicateExpression } from "./predicate";
import { StepKind } from "../types";
export { StepKind };

// Partial: a workflow step carries titles only for the languages it ships,
// not all LanguageCode members (union now has 10). Faza 1 unification.
export type LocalizedText = Partial<Record<LanguageCode, string>>;

export enum WorkflowDomain {
  INSPECTION = "INSPECTION",
  EMERGENCY = "EMERGENCY",
  BORDER = "BORDER",
  FINE = "FINE",
  CUSTOMS = "CUSTOMS",
  OTHER = "OTHER",
}

export enum OfflinePolicy {
  FULL_OFFLINE = "FULL_OFFLINE",
  DEGRADED_OFFLINE = "DEGRADED_OFFLINE",
  ONLINE_ONLY = "ONLINE_ONLY",
}


export enum FailureClass {
  TRANSIENT = "TRANSIENT",
  NETWORK = "NETWORK",
  PROVIDER = "PROVIDER",
}

export interface RetryPolicy {
  maxAttempts: number; // 1..5
  backoff: "NONE" | "LINEAR" | "EXPONENTIAL";
  baseDelayMs: number;
  retryOn: FailureClass[];
}

export type RollbackMode = "NONE" | "COMPENSATE" | "ABORT_WORKFLOW";

export interface RollbackPolicy {
  mode: RollbackMode;
  compensationStepId: StepId | null; // required iff mode === "COMPENSATE"
}

export type OfflineMode = "NATIVE" | "FALLBACK" | "SKIP" | "BLOCK";

export interface OfflineBehaviour {
  mode: OfflineMode;
  fallbackStepId: StepId | null; // required iff mode === "FALLBACK"
}

export interface Transition {
  to: StepId | "END";
  guard: PredicateExpression | null; // null = default transition
  priority: number;
}

export interface StepDefinition {
  id: StepId;
  kind: StepKind;
  title: LocalizedText;

  requiredCapabilities: Capability[];
  optionalCapabilities: Capability[];

  preconditions: PredicateExpression[];
  postconditions: PredicateExpression[];
  transitions: Transition[]; // empty only for terminal steps

  retry: RetryPolicy | null;
  rollback: RollbackPolicy | null;
  offline: OfflineBehaviour;

  timeoutMs: number | null;

  // Present only on SHOW_KNOWLEDGE steps; used by validation rule W-09
  // (cross-package check against the bundled knowledge package).
  knowledgeRef?: string;
}

export interface WorkflowVersion {
  id: WorkflowVersionId;
  definitionId: WorkflowDefId;
  version: SemVer;
  entryStepId: StepId;
  steps: StepDefinition[];

  requiredCapabilities: Capability[]; // union across all steps (validator computes)
  optionalCapabilities: Capability[];

  offlinePolicy: OfflinePolicy;
  localization: LanguageCode[];

  publishedAt: DateTime;
  publishedBy: PublisherId;
  supersededBy: WorkflowVersionId | null;
  checksum: Hash;
}

export interface WorkflowDefinition {
  id: WorkflowDefId;
  name: string;
  domain: WorkflowDomain;
  versions: WorkflowVersionId[]; // min. 1
  currentVersion: WorkflowVersionId;
}
