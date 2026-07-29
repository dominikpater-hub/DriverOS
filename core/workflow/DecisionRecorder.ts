// core/workflow/DecisionRecorder.ts
// ADR-007: the orchestration layer creates a DecisionRecord after EVERY
// matchRules() call — including T4 fallbacks. Decision Engine stays pure and
// stateless (it does not persist); this recorder wraps it and appends to the
// append-only DecisionLog. Enables audit replay: same contextSnapshot + same
// rule versions -> identical output.

import type { IDecisionPort, DecisionInput, DecisionOutcome } from "../index.ports";
import type { SituationContext } from "../../shared/types";
import { TrustLevel } from "../../shared/types";
import type { DecisionLog } from "../../shared/storage/InMemoryDecisionLog";
import type { DecisionRecord } from "../../shared/platform/decision-record";
import { DecisionReason } from "../../shared/platform/decision-record";
import type { DateTime, DecisionId, RuleId, SemVer, WorkflowDefId } from "../../shared/platform/ids";

export interface RouteDeps {
  decision: IDecisionPort;
  log: DecisionLog;
  /** Injectable for deterministic tests. */
  now?: () => Date;
  makeId?: () => string;
}

let _seq = 0;

export async function routeAndRecord(
  deps: RouteDeps,
  input: DecisionInput,
  contextSnapshot: SituationContext
): Promise<{ outcome: DecisionOutcome; record: DecisionRecord }> {
  const now = deps.now ?? (() => new Date());
  const makeId =
    deps.makeId ?? (() => `DEC-${now().toISOString().replace(/[:.TZ-]/g, "").slice(0, 14)}-${++_seq}`);

  const started = now().getTime();
  const outcome = await deps.decision.matchRules(input);
  const durationMs = Math.max(0, now().getTime() - started);

  const matched = outcome.workflowDefId != null;

  const record: DecisionRecord = {
    id: makeId() as DecisionId,
    timestamp: now().toISOString() as DateTime,
    durationMs,
    workflowDefId: (outcome.workflowDefId as unknown as WorkflowDefId) ?? null,
    workflowVersionId: null,
    trustLevel: matched ? TrustLevel.T1_VERIFIED : outcome.fallbackTrustLevel ?? TrustLevel.T4_FALLBACK,
    output: { ...outcome } as Record<string, unknown>,
    ruleIds: outcome.matchedRuleId
      ? [{ id: outcome.matchedRuleId as unknown as RuleId, version: outcome.matchedRuleVersion as unknown as SemVer }]
      : [],
    knowledgeVersions: [],
    contextSnapshot,
    decisionReason: matched ? DecisionReason.RULE_MATCH : DecisionReason.NO_RULE_T4,
    aiUsed: false,
    aiRequestId: null,
    workflowInstanceId: null,
    incidentId: null,
  };

  deps.log.append(record);
  return { outcome, record };
}
