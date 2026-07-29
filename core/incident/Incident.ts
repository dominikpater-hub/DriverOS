// core/incident/Incident.ts — Evidence Context (ADR-008, Artefakt #0002 §5b).
//
// Incident is the immutable EVIDENCE document — a different bounded context from
// the mutable WorkflowInstance (execution state). It is sealed from a finished
// instance and gets a COPY of the facts (contextSnapshot-derived), so it stays
// self-sufficient even after the instance is purged. Key invariant (ADR-008):
// an ABANDONED workflow ALSO produces an Incident — an interrupted inspection
// is often the most valuable evidence.

import type {
  CountryCode,
  DateTime,
  DecisionId,
  IncidentId,
  InstanceId,
  VersionId,
  WorkflowVersionId,
} from "../../shared/platform/ids";
import type { TrustLevel } from "../../shared/types";
import type { DecisionLog } from "../../shared/storage/InMemoryDecisionLog";

export enum IncidentState {
  DRAFT = "DRAFT",
  SEALED = "SEALED",
  ANONYMIZED = "ANONYMIZED",
}

export type IncidentOrigin = "COMPLETED" | "ABANDONED";

export interface Attachment {
  type: string;
  /** integrity hash of the attachment bytes (Evidence Engine) */
  hash?: string;
  metadata?: Record<string, unknown>;
}

/** Immutable once sealed. The only later transition is anonymization (§8 loop). */
export interface Incident {
  readonly id: IncidentId;
  readonly instanceId: InstanceId;
  readonly workflowVersionId: WorkflowVersionId | null;
  readonly country: CountryCode;
  readonly occurredAt: DateTime;
  readonly sealedAt: DateTime;
  readonly state: IncidentState;
  readonly origin: IncidentOrigin;
  readonly knowledgeUsed: readonly VersionId[]; // which exact versions were shown (evidence)
  readonly trustLevels: readonly TrustLevel[];
  readonly decisionIds: readonly DecisionId[]; // links to DecisionRecords (ADR-007)
  readonly attachments: readonly Attachment[];
  readonly report: string | null;
  readonly anonymizedAt: DateTime | null;
}

export interface SealIncidentInput {
  instanceId: InstanceId;
  workflowVersionId?: WorkflowVersionId | null;
  country: CountryCode;
  occurredAt: DateTime;
  origin: IncidentOrigin;
  knowledgeUsed?: VersionId[];
  trustLevels?: TrustLevel[];
  decisionIds?: DecisionId[];
  attachments?: Attachment[];
  report?: string | null;
}

export interface SealDeps {
  now?: () => Date;
  makeId?: () => string;
}

let _seq = 0;

/** Seal a finished instance (COMPLETED or ABANDONED) into an immutable Incident. */
export function sealIncident(input: SealIncidentInput, deps: SealDeps = {}): Incident {
  const now = deps.now ?? (() => new Date());
  const makeId =
    deps.makeId ?? (() => `INC-${now().toISOString().replace(/[:.TZ-]/g, "").slice(0, 14)}-${++_seq}`);

  const incident: Incident = {
    id: makeId() as IncidentId,
    instanceId: input.instanceId,
    workflowVersionId: input.workflowVersionId ?? null,
    country: input.country,
    occurredAt: input.occurredAt,
    sealedAt: now().toISOString() as DateTime,
    state: IncidentState.SEALED,
    origin: input.origin,
    knowledgeUsed: Object.freeze([...(input.knowledgeUsed ?? [])]),
    trustLevels: Object.freeze([...(input.trustLevels ?? [])]),
    decisionIds: Object.freeze([...(input.decisionIds ?? [])]),
    attachments: Object.freeze([...(input.attachments ?? [])]),
    report: input.report ?? null,
    anonymizedAt: null,
  };
  return Object.freeze(incident);
}

/**
 * Link a sealed Incident back to its DecisionRecords (ADR-007: attach incidentId).
 * The DecisionLog enforces the "attach once" rule.
 */
export function linkIncidentToDecisions(log: DecisionLog, incident: Incident): void {
  for (const decisionId of incident.decisionIds) {
    log.attach(decisionId, incident.id);
  }
}

/**
 * §8 knowledge loop: anonymize before any aggregation. Strips attachment
 * metadata (PII risk) and blurs precision; produces a new frozen Incident.
 */
export function anonymizeIncident(incident: Incident, deps: SealDeps = {}): Incident {
  const now = deps.now ?? (() => new Date());
  return Object.freeze({
    ...incident,
    state: IncidentState.ANONYMIZED,
    attachments: Object.freeze(incident.attachments.map((a) => ({ type: a.type, hash: a.hash }))),
    anonymizedAt: now().toISOString() as DateTime,
  });
}
