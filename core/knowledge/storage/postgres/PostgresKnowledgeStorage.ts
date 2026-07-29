/**
 * POSTGRESQL KNOWLEDGE STORAGE
 *
 * Real implementation of IKnowledgeStorage, backing KnowledgeEngine in
 * production. Schema: scripts/migrations/001_knowledge_schema.sql.
 *
 * This is the reference pattern for the other three engines' PostgreSQL
 * storage (Rule, Workflow) — same shape: a thin class that only translates
 * between the engine's plain-object types and SQL rows. No business logic
 * lives here; that stays in KnowledgeEngine/KnowledgePublisher.
 *
 * Requires `pg` as a runtime dependency (not bundled — add it when wiring
 * this up): `npm install pg`
 */

import type { Pool, PoolClient } from "pg";
import { KnowledgeId, VersionId, CountryCode, LanguageCode } from "../../../../shared/types";
import type {
  KnowledgeEntry,
  KnowledgeVersion,
  EmergencyCard,
  IKnowledgeStorage
} from "../../KnowledgeEngine";

// ============================================================================
// ROW SHAPES (snake_case, matching 001_knowledge_schema.sql exactly)
// ============================================================================

interface EntryRow {
  id: string;
  domain: string;
  country: string;
  scope: "NATIONAL" | "EU" | "REGIONAL";
  tags: string[];
  current_version_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface VersionRow {
  id: string;
  entry_id: string;
  language: string;
  content: unknown;
  sources: unknown;
  confidence: string;
  effective_date: Date;
  valid_until: Date | null;
  verified_at: Date;
  verified_by: string;
  next_review_due: Date;
  superseded_by: string | null;
  checksum: string;
}

interface CardRow {
  id: string;
  country: string;
  type: string;
  content: unknown;
  contacts: unknown;
  last_updated: Date;
  checksum: string;
}

// ============================================================================
// MAPPERS — row <-> domain object, isolated so schema changes touch one place
// ============================================================================

function entryFromRow(row: EntryRow, versionIds: VersionId[]): KnowledgeEntry {
  return {
    id: row.id as KnowledgeId,
    domain: row.domain,
    country: row.country as CountryCode,
    scope: row.scope,
    tags: row.tags,
    versions: versionIds,
    currentVersionId: row.current_version_id as VersionId,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function versionFromRow(row: VersionRow): KnowledgeVersion {
  return {
    id: row.id as VersionId,
    entryId: row.entry_id as KnowledgeId,
    language: row.language as LanguageCode,
    content: row.content as KnowledgeVersion["content"],
    sources: row.sources as KnowledgeVersion["sources"],
    confidence: row.confidence as KnowledgeVersion["confidence"],
    effectiveDate: row.effective_date,
    validUntil: row.valid_until,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    nextReviewDue: row.next_review_due,
    supersededBy: row.superseded_by as VersionId | null,
    checksum: row.checksum
  };
}

function cardFromRow(row: CardRow): EmergencyCard {
  return {
    id: row.id as any,
    country: row.country as CountryCode,
    type: row.type,
    content: row.content as EmergencyCard["content"],
    contacts: row.contacts as EmergencyCard["contacts"],
    lastUpdated: row.last_updated,
    checksum: row.checksum
  };
}

// ============================================================================
// STORAGE IMPLEMENTATION
// ============================================================================

export class PostgresKnowledgeStorage implements IKnowledgeStorage {
  constructor(private pool: Pool) {}

  async getEntry(id: KnowledgeId): Promise<KnowledgeEntry | null> {
    const client = await this.pool.connect();
    try {
      const entryResult = await client.query<EntryRow>(
        `SELECT id, domain, country, scope, tags, current_version_id, created_at, updated_at
         FROM knowledge_entries WHERE id = $1`,
        [id]
      );
      if (entryResult.rows.length === 0) return null;

      const versionIds = await this.listVersionsByEntryInternal(client, id);
      return entryFromRow(entryResult.rows[0], versionIds);
    } finally {
      client.release();
    }
  }

  async getVersion(id: VersionId): Promise<KnowledgeVersion | null> {
    const result = await this.pool.query<VersionRow>(
      `SELECT id, entry_id, language, content, sources, confidence,
              effective_date, valid_until, verified_at, verified_by,
              next_review_due, superseded_by, checksum
       FROM knowledge_versions WHERE id = $1`,
      [id]
    );
    return result.rows.length > 0 ? versionFromRow(result.rows[0]) : null;
  }

  async getEmergencyCard(country: CountryCode): Promise<EmergencyCard | null> {
    const result = await this.pool.query<CardRow>(
      `SELECT id, country, type, content, contacts, last_updated, checksum
       FROM emergency_cards WHERE country = $1`,
      [country]
    );
    return result.rows.length > 0 ? cardFromRow(result.rows[0]) : null;
  }

  async listVersionsByEntry(entryId: KnowledgeId): Promise<VersionId[]> {
    return this.listVersionsByEntryInternal(this.pool, entryId);
  }

  private async listVersionsByEntryInternal(
    queryable: Pool | PoolClient,
    entryId: KnowledgeId
  ): Promise<VersionId[]> {
    const result = await queryable.query<{ id: string }>(
      `SELECT id FROM knowledge_versions WHERE entry_id = $1 ORDER BY verified_at ASC`,
      [entryId]
    );
    return result.rows.map(r => r.id as VersionId);
  }

  async searchEntries(query: Partial<KnowledgeEntry>): Promise<KnowledgeEntry[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.domain) {
      params.push(query.domain);
      conditions.push(`domain = $${params.length}`);
    }
    if (query.country) {
      params.push(query.country);
      conditions.push(`country = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await this.pool.query<EntryRow>(
      `SELECT id, domain, country, scope, tags, current_version_id, created_at, updated_at
       FROM knowledge_entries ${whereClause}`,
      params
    );

    const entries: KnowledgeEntry[] = [];
    for (const row of result.rows) {
      const versionIds = await this.listVersionsByEntryInternal(this.pool, row.id as KnowledgeId);
      entries.push(entryFromRow(row, versionIds));
    }
    return entries;
  }

  /**
   * Insert a new version. Deliberately INSERT-only — there is no UPDATE
   * path here, mirroring the DB-level enforcement note in the migration.
   * KnowledgePublisher.publishVersion() is the only caller; it handles
   * marking the previous version's supersededBy via saveVersion() below.
   */
  async saveVersion(version: KnowledgeVersion): Promise<void> {
    // supersededBy can change on an *existing* row (the old version gets
    // superseded when a new one publishes) — this is the one field ADR-002
    // permits updating, since it's metadata about supersession, not a
    // change to the version's actual legal content.
    await this.pool.query(
      `INSERT INTO knowledge_versions
         (id, entry_id, language, content, sources, confidence, effective_date,
          valid_until, verified_at, verified_by, next_review_due, superseded_by, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET superseded_by = EXCLUDED.superseded_by`,
      [
        version.id,
        version.entryId,
        version.language,
        JSON.stringify(version.content),
        JSON.stringify(version.sources),
        version.confidence,
        version.effectiveDate,
        version.validUntil,
        version.verifiedAt,
        version.verifiedBy,
        version.nextReviewDue,
        version.supersededBy,
        version.checksum
      ]
    );
  }

  async updateEntry(entry: KnowledgeEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO knowledge_entries
         (id, domain, country, scope, tags, current_version_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         current_version_id = EXCLUDED.current_version_id,
         updated_at = EXCLUDED.updated_at`,
      [
        entry.id,
        entry.domain,
        entry.country,
        entry.scope,
        entry.tags,
        entry.currentVersionId,
        entry.createdAt,
        entry.updatedAt
      ]
    );
  }

  async saveEmergencyCard(card: EmergencyCard): Promise<void> {
    await this.pool.query(
      `INSERT INTO emergency_cards (id, country, type, content, contacts, last_updated, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (country) DO UPDATE SET
         id = EXCLUDED.id,
         type = EXCLUDED.type,
         content = EXCLUDED.content,
         contacts = EXCLUDED.contacts,
         last_updated = EXCLUDED.last_updated,
         checksum = EXCLUDED.checksum`,
      [
        card.id,
        card.country,
        card.type,
        JSON.stringify(card.content),
        JSON.stringify(card.contacts),
        card.lastUpdated,
        card.checksum
      ]
    );
  }
}
