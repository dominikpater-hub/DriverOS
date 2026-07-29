/**
 * IN-MEMORY KNOWLEDGE STORAGE
 *
 * Mock implementation of IKnowledgeStorage for tests and local development.
 * Swap for PostgreSQL/IndexedDB implementation in production — same interface.
 */

import { KnowledgeId, VersionId, CountryCode } from "../../../shared/types";
import type { KnowledgeEntry, KnowledgeVersion, EmergencyCard, IKnowledgeStorage } from "../KnowledgeEngine";

export class InMemoryKnowledgeStorage implements IKnowledgeStorage {
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
