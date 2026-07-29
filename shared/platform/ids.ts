// shared/types/ids.ts
//
// Branded primitives. These exist so that a WorkflowDefId and a KnowledgeId
// are not both "just a string" at the type level — the compiler catches
// swapped identifiers before they become a 2am production incident.

export type Branded<T, Brand extends string> = T & { readonly __brand: Brand };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DateTime = Branded<string, "DateTime">; // ISO 8601
export type Hash = Branded<string, "Hash">; // integrity checksum for packages

// SemVer helpers now canonical in shared/types (Faza 1) — re-export.
export type { SemVer } from "../types";
export { SEMVER_PATTERN, isSemVer, asSemVer } from "../types";

// ── Domain identifiers ───────────────────────────────────────────────────
// CountryCode/LanguageCode canonical in shared/types (union) — re-export (Faza 1).
export type { CountryCode, LanguageCode } from "../types";

export type KnowledgeId = Branded<string, "KnowledgeId">;
export type VersionId = Branded<string, "VersionId">;
export type VerifierId = Branded<string, "VerifierId">;
export type PublisherId = Branded<string, "PublisherId">;

export type RuleId = Branded<string, "RuleId">;

export type WorkflowDefId = Branded<string, "WorkflowDefId">;
export type WorkflowVersionId = Branded<string, "WorkflowVersionId">;
export type StepId = Branded<string, "StepId">;
export type InstanceId = Branded<string, "InstanceId">;

export type IncidentId = Branded<string, "IncidentId">;
export type DecisionId = Branded<string, "DecisionId">;
export type AIRequestId = Branded<string, "AIRequestId">;

export type UserId = Branded<string, "UserId">;
export type VehicleId = Branded<string, "VehicleId">;

export type ProductId = Branded<string, "ProductId">;
export type ModuleId = Branded<string, "ModuleId">;
export type FlagKey = Branded<string, "FlagKey">;
export type ModelId = Branded<string, "ModelId">;
export type ThemeRef = Branded<string, "ThemeRef">;

// Generic constructor helper for the common "trust the caller, brand it" case.
// Used at system boundaries (parsing config, deserializing packages) — never
// as a way to skip validation where a validator already exists (see SemVer).
export function brand<T extends string, B extends string>(value: T): Branded<T, B> {
  return value as Branded<T, B>;
}
