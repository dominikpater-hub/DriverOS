// core/incident/InMemoryIncidentStore.ts
// Evidence store. Sealed Incidents are immutable; the only permitted update is
// replacing a record with its anonymized version (§8 loop). Retention/legal
// deletion policies live in this context (ADR-008), not in Workflow.

import type { IncidentId } from "../../shared/platform/ids";
import type { Incident } from "./Incident";
import { IncidentState } from "./Incident";

export interface IncidentStore {
  save(incident: Incident): void;
  get(id: IncidentId): Incident | null;
  list(): readonly Incident[];
}

export class InMemoryIncidentStore implements IncidentStore {
  private readonly byId = new Map<IncidentId, Incident>();

  save(incident: Incident): void {
    const existing = this.byId.get(incident.id);
    // Immutable once sealed: only a SEALED -> ANONYMIZED transition may overwrite.
    if (existing && !(existing.state === IncidentState.SEALED && incident.state === IncidentState.ANONYMIZED)) {
      throw new Error(`Incident ${incident.id} is sealed and cannot be modified`);
    }
    this.byId.set(incident.id, incident);
  }

  get(id: IncidentId): Incident | null {
    return this.byId.get(id) ?? null;
  }

  list(): readonly Incident[] {
    return [...this.byId.values()];
  }
}
