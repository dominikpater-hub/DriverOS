// shared/platform/context.ts
// SituationContext / Connectivity / GeoPoint are canonical in shared/types
// (Faza 1 unification). Re-export here so platform contracts (ai.ts,
// decision-record.ts) reference the one true shape — no parallel definition.
// ADR-004 (Artefakt #0003 §2): this shape only ever holds resolved FACTS.

export { Connectivity } from "../types";
export type { GeoPoint, SituationContext } from "../types";
