// Knowledge domain types + storage port. Reconstructed from Domain Model §2.
// Reference only — map onto your real core/knowledge types. Do not blind-copy.

import type { CountryCode, LanguageCode, Source } from "../../shared/types/ai.js";

export type KnowledgeId = string & { readonly __brand: "KnowledgeId" };
export type VersionId = string & { readonly __brand: "VersionId" };

export const asKnowledgeId = (s: string) => s as KnowledgeId;
export const asVersionId = (s: string) => s as VersionId;

export enum KnowledgeDomain {
  TRAFFIC_LAW = "TRAFFIC_LAW",
  CUSTOMS = "CUSTOMS",
  EMERGENCY = "EMERGENCY",
  ADR = "ADR",
  CABOTAGE = "CABOTAGE",
}

export enum Confidence {
  OFFICIAL = "OFFICIAL",
  VERIFIED = "VERIFIED",
  COMMUNITY = "COMMUNITY",
}

export enum Scope {
  NATIONAL = "NATIONAL",
  EU = "EU",
  REGIONAL = "REGIONAL",
}

export interface ActionItem {
  order: number;
  text: string;
  critical?: boolean;
}

export interface StructuredContent {
  summary: string;
  actions: ActionItem[];
  rights: string[];
  warnings: string[];
  details: string;
  legalRefs: Source[];
}

/** Immutable once published. A correction is a NEW version, never an edit. [ADR-002] */
export interface KnowledgeVersion {
  id: VersionId;
  entryId: KnowledgeId;
  language: LanguageCode;
  content: StructuredContent;
  sources: Source[]; // min 1 — a version without a source does not exist
  confidence: Confidence;
  effectiveDate: Date;
  validUntil: Date | null;
  verifiedAt: Date;
  verifiedBy: string;
  nextReviewDue: Date;
  supersededBy: VersionId | null;
  checksum: string;
}

/** Logical container of versions. [ADR-002] */
export interface KnowledgeEntry {
  id: KnowledgeId;
  domain: KnowledgeDomain;
  country: CountryCode;
  scope: Scope;
  tags: string[];
  versions: KnowledgeVersion[];
  currentVersion: VersionId | null; // computed: newest non-superseded
}

/** The port. core/knowledge depends on THIS; the Postgres class is one impl. */
export interface IKnowledgeStorage {
  getEntry(id: KnowledgeId): Promise<KnowledgeEntry | null>;
  getVersion(id: VersionId): Promise<KnowledgeVersion | null>;
  /** Persist a brand-new immutable version. Must reject overwriting an existing id. */
  insertVersion(entryMeta: Omit<KnowledgeEntry, "versions" | "currentVersion">, version: KnowledgeVersion): Promise<void>;
  /** Mark oldVersion superseded by newVersion. The old row's content stays untouched. */
  supersede(oldVersion: VersionId, newVersion: VersionId): Promise<void>;
  listVersions(entryId: KnowledgeId): Promise<KnowledgeVersion[]>;
  searchByCountryDomain(country: CountryCode, domain: KnowledgeDomain): Promise<KnowledgeEntry[]>;
}
