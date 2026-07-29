// shared/storage/InMemoryDecisionLog.ts
// ADR-007: append-only log of DecisionRecords. The only permitted mutation is
// attaching an IncidentId once the Evidence Context seals the Incident.
// (Production: Postgres/IndexedDB behind the same DecisionLog interface.)

import type { DecisionRecord } from "../platform/decision-record";
import { attachIncident } from "../platform/decision-record";
import type { DecisionId, IncidentId } from "../platform/ids";

export interface DecisionLog {
  append(record: DecisionRecord): void;
  list(): readonly DecisionRecord[];
  get(id: DecisionId): DecisionRecord | null;
  attach(decisionId: DecisionId, incidentId: IncidentId): void;
}

export class InMemoryDecisionLog implements DecisionLog {
  private readonly records: DecisionRecord[] = [];

  append(record: DecisionRecord): void {
    this.records.push(record);
  }

  list(): readonly DecisionRecord[] {
    return [...this.records];
  }

  get(id: DecisionId): DecisionRecord | null {
    return this.records.find((r) => r.id === id) ?? null;
  }

  attach(decisionId: DecisionId, incidentId: IncidentId): void {
    const i = this.records.findIndex((r) => r.id === decisionId);
    if (i < 0) throw new Error(`DecisionRecord ${decisionId} not found`);
    this.records[i] = attachIncident(this.records[i], incidentId);
  }
}
