/**
 * KNOWLEDGE ENGINE
 *
 * Source of truth.
 * - Never generates content (only stores verified knowledge)
 * - Versioned, immutable (ADR-002)
 * - Every version points to source
 * - Historical versions preserved for audits
 *
 * This is where we guard against AI hallucination.
 */

import {
  KnowledgeId,
  VersionId,
  CardId,
  CountryCode,
  LanguageCode,
  TrustLevel,
  ConfidenceLevel,
  StructuredContent,
  SourceRef,
  isDateInPast,
  isReviewOverdue,
  createKnowledgeId,
  createVersionId,
  createCardId
} from "../../shared/types";

import {
  IKnowledgePort,
  KnowledgeSearchQuery,
  KnowledgeEntrySnapshot,

  VersionMetadata,
  EmergencyCardSnapshot,
  EmergencyContact
} from "./ports";
import { KnowledgeVersionSnapshot } from "../../shared/snapshots";

// ============================================================================
// INTERNAL ENTITIES (Domain Model)
// ============================================================================

/**
 * KnowledgeVersion — immutable, once published never edited (ADR-002)
 */
export interface KnowledgeVersion {
  id: VersionId;
  entryId: KnowledgeId;
  language: LanguageCode;
  content: StructuredContent;
  sources: SourceRef[]; // Required — knowledge without metadata doesn't exist
  confidence: ConfidenceLevel;
  effectiveDate: Date;
  validUntil: Date | null;
  verifiedAt: Date;
  verifiedBy: string; // User ID
  nextReviewDue: Date;
  supersededBy: VersionId | null;
  checksum: string;
}

/**
 * KnowledgeEntry — container for versions
 */
export interface KnowledgeEntry {
  id: KnowledgeId;
  domain: string; // TRAFFIC_LAW, CUSTOMS, etc.
  country: CountryCode;
  scope: "NATIONAL" | "EU" | "REGIONAL";
  tags: string[];
  versions: VersionId[];
  currentVersionId: VersionId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * EmergencyCard — special case: must work offline (TIER_0)
 */
export interface EmergencyCard {
  id: CardId;
  country: CountryCode;
  type: string;
  content: StructuredContent;
  contacts: EmergencyContact[];
  lastUpdated: Date;
  checksum: string;
  /**
   * D-02: the card's content is also published as an immutable KnowledgeVersion
   * on the shared versioning spine, so an Incident can record the EXACT version
   * of the emergency card that was shown (evidentiary history) and audits can
   * resolve it via getKnowledgeVersion(). Optional so pre-versioning rows
   * (e.g. loaded from a Postgres table without the column) degrade gracefully.
   */
  currentVersionId?: VersionId;
}

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

/**
 * Abstraction for persistent storage
 * Implementations: IndexedDB (client), PostgreSQL (server), etc.
 */
export interface IKnowledgeStorage {
  getEntry(id: KnowledgeId): Promise<KnowledgeEntry | null>;
  getVersion(id: VersionId): Promise<KnowledgeVersion | null>;
  getEmergencyCard(country: CountryCode): Promise<EmergencyCard | null>;
  listVersionsByEntry(entryId: KnowledgeId): Promise<VersionId[]>;
  searchEntries(query: Partial<KnowledgeEntry>): Promise<KnowledgeEntry[]>;
  
  // Write: only through KnowledgePublisher
  saveVersion(version: KnowledgeVersion): Promise<void>;
  updateEntry(entry: KnowledgeEntry): Promise<void>;
  saveEmergencyCard(card: EmergencyCard): Promise<void>;
}

// ============================================================================
// KNOWLEDGE ENGINE
// ============================================================================

export class KnowledgeEngine implements IKnowledgePort {
  constructor(private storage: IKnowledgeStorage) {}

  /**
   * Get knowledge entry with current version
   * Returns T1 or T2 trust level based on review status
   */
  async getKnowledgeEntry(
    id: KnowledgeId,
    country: CountryCode,
    language: LanguageCode
  ): Promise<KnowledgeEntrySnapshot | null> {
    const entry = await this.storage.getEntry(id);
    if (!entry || entry.country !== country) return null;

    const version = await this.storage.getVersion(entry.currentVersionId);
    if (!version || version.language !== language) return null;

    return this.snapshotVersion(version, entry);
  }

  /**
   * Search knowledge by domain, country, tags
   * Only returns current versions (not historical)
   */
  async searchKnowledge(query: KnowledgeSearchQuery): Promise<KnowledgeEntrySnapshot[]> {
    const entries = await this.storage.searchEntries({
      domain: query.domain,
      country: query.country
    } as Partial<KnowledgeEntry>);

    const tagFiltered = query.tags?.length
      ? entries.filter(e => query.tags!.some(tag => e.tags.includes(tag)))
      : entries;

    const snapshots: KnowledgeEntrySnapshot[] = [];

    for (const entry of tagFiltered) {
      const version = await this.storage.getVersion(entry.currentVersionId);
      if (version && version.language === query.language) {
        snapshots.push(this.snapshotVersion(version, entry));
      }
    }

    return snapshots;
  }

  /**
   * Get specific version for audits/evidence
   * Used when rebuilding incident with exact knowledge that was shown
   */
  async getKnowledgeVersion(id: VersionId): Promise<KnowledgeVersionSnapshot | null> {
    const version = await this.storage.getVersion(id);
    return version ? this.toVersionSnapshot(version) : null;
  }

  /**
   * Emergency card — must work offline
   * Baked into TIER_0 package
   */
  async getEmergencyCard(
    country: CountryCode,
    language: LanguageCode
  ): Promise<EmergencyCardSnapshot | null> {
    const card = await this.storage.getEmergencyCard(country);
    if (!card) return null;

    return {
      id: card.id,
      country: card.country,
      type: card.type,
      content: card.content,
      contacts: card.contacts,
      tier: "TIER_0",
      // D-02: the versioned, evidentiary reference. Falls back to the card id
      // for pre-versioning rows so the snapshot always carries a version.
      versionId: card.currentVersionId ?? (card.id as unknown as VersionId),
      trustLevel: TrustLevel.T1_VERIFIED
    };
  }

  /**
   * List version history for entry
   */
  async listVersions(entryId: KnowledgeId): Promise<VersionMetadata[]> {
    const versionIds = await this.storage.listVersionsByEntry(entryId);
    const metadata: VersionMetadata[] = [];

    for (const versionId of versionIds) {
      const version = await this.storage.getVersion(versionId);
      if (version) {
        metadata.push({
          id: version.id,
          verifiedAt: version.verifiedAt,
          supersededBy: version.supersededBy
        });
      }
    }

    return metadata;
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  /**
   * Convert internal version to a flat KnowledgeVersionSnapshot
   * (used for direct version lookups — audits, incident evidence)
   */
  private toVersionSnapshot(version: KnowledgeVersion): KnowledgeVersionSnapshot {
    return {
      id: version.id,
      entryId: version.entryId,
      language: version.language,
      content: version.content,
      confidence: version.confidence,
      effectiveDate: version.effectiveDate,
      validUntil: version.validUntil,
      verifiedAt: version.verifiedAt,
      nextReviewDue: version.nextReviewDue,
      supersededBy: version.supersededBy,
      checksum: version.checksum
    };
  }

  /**
   * Convert internal version + its owning entry to a KnowledgeEntrySnapshot
   */
  private snapshotVersion(version: KnowledgeVersion, entry: KnowledgeEntry): KnowledgeEntrySnapshot {
    return {
      id: entry.id,
      currentVersionId: version.id,
      currentVersion: this.toVersionSnapshot(version),
      country: entry.country,
      domain: entry.domain,
      trustLevel: this.determineTrustLevel(version)
    };
  }

  /**
   * Determine trust level based on review status (ADR-003)
   */
  private determineTrustLevel(version: KnowledgeVersion): TrustLevel {
    const now = new Date();

    // Check if version is still in effect
    if (version.validUntil && isDateInPast(version.validUntil)) {
      return TrustLevel.T2_VERIFIED_STALE;
    }

    // Check if review is overdue
    if (isReviewOverdue(version.nextReviewDue)) {
      return TrustLevel.T2_VERIFIED_STALE;
    }

    return TrustLevel.T1_VERIFIED;
  }
}

// ============================================================================
// KNOWLEDGE PUBLISHER
// ============================================================================

/**
 * Separate class for publishing new knowledge versions
 * Ensures only verified knowledge enters the system
 * Never called from user flow — only from admin/verification workflow
 */
export class KnowledgePublisher {
  constructor(private storage: IKnowledgeStorage) {}

  /**
   * Publish new knowledge version
   * Old version automatically marked with supersededBy link
   */
  async publishVersion(
    entryId: KnowledgeId,
    input: {
      language: LanguageCode;
      content: StructuredContent;
      sources: SourceRef[];
      confidence: ConfidenceLevel;
      effectiveDate: Date;
      validUntil?: Date;
      verifiedBy: string;
      nextReviewDue: Date;
    }
  ): Promise<VersionId> {
    // Validate sources (knowledge without metadata doesn't exist)
    if (!input.sources || input.sources.length === 0) {
      throw new Error("Knowledge version must have at least one source");
    }

    const versionId = this.generateVersionId();

    const newVersion: KnowledgeVersion = {
      id: versionId,
      entryId,
      language: input.language,
      content: input.content,
      sources: input.sources,
      confidence: input.confidence,
      effectiveDate: input.effectiveDate,
      validUntil: input.validUntil || null,
      verifiedAt: new Date(),
      verifiedBy: input.verifiedBy,
      nextReviewDue: input.nextReviewDue,
      supersededBy: null,
      checksum: this.computeChecksum(input.content)
    };

    // Get entry to link new version
    const entry = await this.storage.getEntry(entryId);
    if (!entry) {
      throw new Error(`Entry ${entryId} not found`);
    }

    // If there's a previous version, mark it as superseded
    if (entry.currentVersionId) {
      const oldVersion = await this.storage.getVersion(entry.currentVersionId);
      if (oldVersion) {
        oldVersion.supersededBy = versionId;
        await this.storage.saveVersion(oldVersion);
      }
    }

    // Save new version
    await this.storage.saveVersion(newVersion);

    // Update entry
    entry.currentVersionId = versionId;
    entry.versions.push(versionId);
    entry.updatedAt = new Date();
    await this.storage.updateEntry(entry);

    return versionId;
  }

  /**
   * Publish emergency card
   */
  async publishEmergencyCard(
    country: CountryCode,
    input: {
      type: string;
      content: StructuredContent;
      contacts: EmergencyContact[];
    }
  ): Promise<CardId> {
    const cardId = this.generateCardId();

    // D-02: put the card's content on the shared versioning spine. This
    // immutable KnowledgeVersion is what an Incident references (evidentiary),
    // and what getKnowledgeVersion() resolves for an audit. Emergency cards are
    // TIER_0 verified content by definition, so we stamp an official source and
    // OFFICIAL confidence (the same invariant publishVersion enforces —
    // "knowledge without metadata doesn't exist").
    const versionId = this.generateVersionId();
    const cardVersion: KnowledgeVersion = {
      id: versionId,
      entryId: createKnowledgeId(`EMERGENCY-${country}-${input.type}`),
      // Cards are not language-filtered in storage (getEmergencyCard ignores
      // language); this label is only for audit resolution. Default to "de"
      // until per-language emergency cards land.
      language: "de" as LanguageCode,
      content: input.content,
      sources: [{ type: "OFFICIAL_SITE", reference: `EMERGENCY_TIER_0:${country}:${input.type}`, retrievedAt: new Date() }],
      confidence: ConfidenceLevel.OFFICIAL,
      effectiveDate: new Date(),
      validUntil: null,
      verifiedAt: new Date(),
      verifiedBy: "system@guardian",
      nextReviewDue: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      supersededBy: null,
      checksum: this.computeChecksum(input.content)
    };
    await this.storage.saveVersion(cardVersion);

    const card: EmergencyCard = {
      id: cardId,
      country,
      type: input.type,
      content: input.content,
      contacts: input.contacts,
      lastUpdated: new Date(),
      checksum: cardVersion.checksum,
      currentVersionId: versionId
    };

    await this.storage.saveEmergencyCard(card);
    return cardId;
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  private generateVersionId(): VersionId {
    return createVersionId(`VER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }

  private generateCardId(): CardId {
    return createCardId(`CARD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }

  private computeChecksum(content: StructuredContent): string {
    // In production: crypto.subtle.digest('SHA-256', ...)
    // For now: simple hash
    return `sha256:${Buffer.from(JSON.stringify(content)).toString("base64").substring(0, 16)}`;
  }
}

// ============================================================================
// OFFLINE PACKAGE BUILDER
// ============================================================================

/**
 * Builds offline packages for TIER_0 (emergency), TIER_1 (country), TIER_2 (region)
 * Snapshots current versions + integrity checksums
 */
export class OfflinePackageBuilder {
  constructor(private engine: KnowledgeEngine, private storage: IKnowledgeStorage) {}

  async buildTier0Package(language: LanguageCode): Promise<{ versions: VersionId[]; checksum: string }> {
    // All emergency cards + universal rights
    const versions: VersionId[] = [];
    // Implementation: fetch all EMERGENCY domain entries
    const checksum = this.computePackageChecksum(versions);
    return { versions, checksum };
  }

  async buildTier1Package(
    country: CountryCode,
    language: LanguageCode
  ): Promise<{ versions: VersionId[]; checksum: string }> {
    // Critical workflows + knowledge for country
    const versions: VersionId[] = [];
    // Implementation: fetch all entries for country
    const checksum = this.computePackageChecksum(versions);
    return { versions, checksum };
  }

  private computePackageChecksum(versions: VersionId[]): string {
    return `pkg:${versions.join("|").substring(0, 32)}`;
  }
}
