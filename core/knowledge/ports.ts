// AUTO-SPLIT z core/index.ports.ts — porty per kontekst (spec §8.3 / ADR fix).
import { KnowledgeId, VersionId, CountryCode, LanguageCode, TrustLevel, StructuredContent, CardId } from "../../shared/types";
import { KnowledgeVersionSnapshot } from "../../shared/snapshots";

/**
 * Query interface for Knowledge Engine
 * Knowledge never generates content — it stores and retrieves verified information
 */
export interface IKnowledgePort {
  /**
   * Retrieve a knowledge entry by ID
   */
  getKnowledgeEntry(
    id: KnowledgeId,
    country: CountryCode,
    language: LanguageCode
  ): Promise<KnowledgeEntrySnapshot | null>;

  /**
   * Search knowledge by domain, country, tags
   * Returns current versions only
   */
  searchKnowledge(query: KnowledgeSearchQuery): Promise<KnowledgeEntrySnapshot[]>;

  /**
   * Get specific version (for audits, historical lookups)
   * Every incident must point to the exact version shown to user
   */
  getKnowledgeVersion(id: VersionId): Promise<KnowledgeVersionSnapshot | null>;

  /**
   * Get emergency card for country
   * MUST work offline (baked into TIER_0 package)
   */
  getEmergencyCard(country: CountryCode, language: LanguageCode): Promise<EmergencyCardSnapshot | null>;

  /**
   * List all versions of a knowledge entry
   * For rebuilding history of what changed when
   */
  listVersions(entryId: KnowledgeId): Promise<VersionMetadata[]>;
}

export interface KnowledgeSearchQuery {
  domain?: string;
  country?: CountryCode;
  tags?: string[];
  language: LanguageCode;
}

export interface KnowledgeEntrySnapshot {
  id: KnowledgeId;
  currentVersionId: VersionId;
  currentVersion: KnowledgeVersionSnapshot;
  country: CountryCode;
  domain: string;
  /** ADR-003 Trust Ladder: computed by Knowledge Engine, never by the caller */
  trustLevel: TrustLevel;
}


export interface VersionMetadata {
  id: VersionId;
  verifiedAt: Date;
  supersededBy: VersionId | null;
}

export interface EmergencyCardSnapshot {
  id: CardId;
  country: CountryCode;
  type: string; // POLICE_STOP | ACCIDENT | MEDICAL | CONSULATE | RIGHTS
  content: StructuredContent;
  contacts: EmergencyContact[];
  tier: "TIER_0";
  /** D-02: the exact immutable version shown, for the Incident audit trail. */
  versionId: VersionId;
  /** Emergency cards are TIER_0 verified content. */
  trustLevel: TrustLevel;
}

export interface EmergencyContact {
  type: "EMERGENCY" | "CONSULATE" | "LOCAL";
  name: string;
  number: string;
  language: LanguageCode;
}
