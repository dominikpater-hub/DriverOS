// shared/types/decision-record.ts
// TASK 5 / ADR-007 (Artefakt #0003 §5): created by the Workflow Engine
// (orchestrator) after EVERY IDecisionPort.matchRules() call, including T4
// fallbacks. Decision Engine itself stays pure and stateless — it does not
// persist anything, per Domain Model §4 ("Decision Engine is deterministic.
// No LLM. No probabilistic answers.").

import type {
  AIRequestId,
  DateTime,
  DecisionId,
  IncidentId,
  InstanceId,
  RuleId,
  SemVer,
  VersionId,
  WorkflowDefId,
  WorkflowVersionId,
} from "./ids";
import type { SituationContext } from "./context";
import type { TrustLevel } from "./trust";

export enum DecisionReason {
  RULE_MATCH = "RULE_MATCH",
  DEFAULT_FALLBACK = "DEFAULT_FALLBACK",
  NO_RULE_T4 = "NO_RULE_T4",
  CAPABILITY_DEGRADED = "CAPABILITY_DEGRADED",
}

export interface MatchedRuleRef {
  id: RuleId;
  version: SemVer;
}

/**
 * Deliberately loose (JsonValue-ish) — this is whatever the Decision Engine
 * actually returned, stored verbatim for audit. Concrete shape depends on
 * the outcome type used by core/decision, which is out of scope here.
 */
export type Outcome = Record<string, unknown>;

export interface DecisionRecord {
  id: DecisionId;
  timestamp: DateTime;
  durationMs: number;

  workflowDefId: WorkflowDefId | null; // null on a pure T4 fallback
  workflowVersionId: WorkflowVersionId | null;
  trustLevel: TrustLevel;
  output: Outcome;

  ruleIds: MatchedRuleRef[];
  knowledgeVersions: VersionId[];
  contextSnapshot: SituationContext;
  decisionReason: DecisionReason;

  aiUsed: boolean;
  aiRequestId: AIRequestId | null;

  workflowInstanceId: InstanceId | null;
  incidentId: IncidentId | null; // attached later, when the Incident is sealed
}

/**
 * The only mutation a DecisionRecord is ever allowed: attaching the
 * IncidentId once the Evidence Context seals the corresponding Incident
 * (see ADR-008). Everything else about a DecisionRecord is immutable.
 */
export function attachIncident(record: DecisionRecord, incidentId: IncidentId): DecisionRecord {
  if (record.incidentId !== null && record.incidentId !== incidentId) {
    throw new Error(
      `DecisionRecord ${record.id} already attached to Incident ${record.incidentId}`
    );
  }
  return { ...record, incidentId };
}
