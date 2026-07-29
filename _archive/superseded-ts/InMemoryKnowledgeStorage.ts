/**
 * IN-MEMORY KNOWLEDGE STORAGE
 *
 * Mock implementation of IKnowledgeStorage for tests and local development.
 * Swap for PostgreSQL/IndexedDB implementation in production — same interface.
 */

import { KnowledgeId, VersionId, CountryCode } from "../../../shared/types";

// Re-declare the internal shapes locally to avoid circular imports;
// in the real repo these are exported from KnowledgeEngine.ts
interface KnowledgeVersion {
  id: VersionId;
  entryId: KnowledgeId;
  language: string;
  content: unknown;
  sources: unknown[];
  confidence: string;
  effectiveDate: Date;
  validUntil: Date | null;
  verifiedAt: Date;
  verifiedBy: string;
  nextReviewDue: Date;
  supersededBy: VersionId | null;
  checksum: string;
}

interface KnowledgeEntry {
  id: KnowledgeId;
  domain: string;
  country: CountryCode;
  scope: "NATIONAL" | "EU" | "REGIONAL";
  tags: string[];
  versions: VersionId[];
  currentVersionId: VersionId;
  createdAt: Date;
  updatedAt: Date;
}

interface EmergencyCard {
  id: string;
  country: CountryCode;
  type: string;
  content: unknown;
  contacts: unknown[];
  lastUpdated: Date;
  checksum: string;
}

export class InMemoryKnowledgeStorage {
  private entries = new Map<KnowledgeId, KnowledgeEntry>();
  private versions = new Map<VersionId, KnowledgeVersion>();
  private emergencyCards = new Map<CountryCode, EmergencyCard>();

  // ---- Test helpers ----

  seedEntry(entry: KnowledgeEntry): void {
    this.entries.set(entry.id, entry);
  }

  seedEmergencyCard(card: EmergencyCard): void {
    this.emergencyCards.set(card.country, card);
  }

  // ---- IKnowledgeStorage ----

  async getEntry(id: KnowledgeId): Promise<KnowledgeEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async getVersion(id: VersionId): Promise<KnowledgeVersion | null> {
    return this.versions.get(id) ?? null;
  }

  async getEmergencyCard(country: CountryCode): Promise<EmergencyCard | null> {
    return this.emergencyCards.get(country) ?? null;
  }

  async listVersionsByEntry(entryId: KnowledgeId): Promise<VersionId[]> {
    const entry = this.entries.get(entryId);
    return entry ? [...entry.versions] : [];
  }

  async searchEntries(query: Partial<KnowledgeEntry>): Promise<KnowledgeEntry[]> {
    const results: KnowledgeEntry[] = [];
    for (const entry of this.entries.values()) {
      if (query.domain && entry.domain !== query.domain) continue;
      if (query.country && entry.country !== query.country) continue;
      results.push(entry);
    }
    return results;
  }

  async saveVersion(version: KnowledgeVersion): Promise<void> {
    this.versions.set(version.id, version);
  }

  async updateEntry(entry: KnowledgeEntry): Promise<void> {
    this.entries.set(entry.id, entry);
  }

  async saveEmergencyCard(card: EmergencyCard): Promise<void> {
    this.emergencyCards.set(card.country, card);
  }
}
