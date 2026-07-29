// shared/types/context.ts
// Mirrors Artefakt #0002 §3 (SituationContext). Kept minimal here — this
// file is not re-deriving the Context Engine, only giving other type
// modules (ai.ts, decision-record.ts) something concrete to reference.
// ADR-004 (Artefakt #0003 §2): this shape only ever holds resolved FACTS.

import type {
  CountryCode,
  DateTime,
  InstanceId,
  IncidentId,
  LanguageCode,
  UserId,
  VehicleId,
} from "./ids";

export enum Connectivity {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  DEGRADED = "DEGRADED",
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface SituationContext {
  timestamp: DateTime;
  location: GeoPoint | null;
  resolvedCountry: CountryCode;
  language: LanguageCode;
  connectivity: Connectivity;
  userProfile: UserId;
  vehicle: VehicleId | null;
  activeWorkflow: InstanceId | null;
  incidentState: IncidentId | null;
}
