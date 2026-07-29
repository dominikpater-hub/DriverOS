import { Kysely, type Generated } from "kysely";
import {
  type IKnowledgeStorage,
  type KnowledgeEntry,
  type KnowledgeVersion,
  type KnowledgeId,
  type VersionId,
  KnowledgeDomain,
  asKnowledgeId,
  asVersionId,
} from "../types.js";
import type { CountryCode } from "../../../shared/types/ai.js";

// ---- Kysely schema types (mirror schema.sql) ------------------------------

interface EntryTable {
  id: string;
  domain: string;
  country: string;
  scope: string;
  tags: string[]; // jsonb
}

interface VersionTable {
  id: string;
  entry_id: string;
  language: string;
  content: unknown; // jsonb -> StructuredContent
  sources: unknown; // jsonb -> Source[]
  confidence: string;
  effective_date: Date;
  valid_until: Date | null;
  verified_at: Date;
  verified_by: string;
  next_review_due: Date;
  superseded_by: string | null;
  checksum: string;
}

export interface KnowledgeDB {
  knowledge_entry: EntryTable;
  knowledge_version: VersionTable;
}

// ---- Row <-> domain mapping (kept in ONE place) ---------------------------

function rowToVersion(r: VersionTable): KnowledgeVersion {
  return {
    id: asVersionId(r.id),
    entryId: asKnowledgeId(r.entry_id),
    language: r.language,
    content: r.content as KnowledgeVersion["content"],
    sources: r.sources as KnowledgeVersion["sources"],
    confidence: r.confidence as KnowledgeVersion["confidence"],
    effectiveDate: r.effective_date,
    validUntil: r.valid_until,
    verifiedAt: r.verified_at,
    verifiedBy: r.verified_by,
    nextReviewDue: r.next_review_due,
    supersededBy: r.superseded_by ? asVersionId(r.superseded_by) : null,
    checksum: r.checksum,
  };
}

/** currentVersion = the newest version that nothing supersedes. */
function computeCurrent(versions: KnowledgeVersion[]): VersionId | null {
  const live = versions.filter((v) => v.supersededBy === null);
  if (live.length === 0) return null;
  return live.sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0].id;
}

// ---- Storage implementation -----------------------------------------------

export class PostgresKnowledgeStorage implements IKnowledgeStorage {
  constructor(private readonly db: Kysely<KnowledgeDB>) {}

  async getVersion(id: VersionId): Promise<KnowledgeVersion | null> {
    const row = await this.db
      .selectFrom("knowledge_version")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? rowToVersion(row) : null;
  }

  async listVersions(entryId: KnowledgeId): Promise<KnowledgeVersion[]> {
    const rows = await this.db
      .selectFrom("knowledge_version")
      .selectAll()
      .where("entry_id", "=", entryId)
      .execute();
    return rows.map(rowToVersion);
  }

  async getEntry(id: KnowledgeId): Promise<KnowledgeEntry | null> {
    const entry = await this.db
      .selectFrom("knowledge_entry")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    if (!entry) return null;

    const versions = await this.listVersions(id);
    return {
      id: asKnowledgeId(entry.id),
      domain: entry.domain as KnowledgeDomain,
      country: entry.country,
      scope: entry.scope as KnowledgeEntry["scope"],
      tags: entry.tags,
      versions,
      currentVersion: computeCurrent(versions),
    };
  }

  async insertVersion(
    entryMeta: Omit<KnowledgeEntry, "versions" | "currentVersion">,
    version: KnowledgeVersion
  ): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      // Upsert the entry container (metadata is stable across versions).
      await tx
        .insertInto("knowledge_entry")
        .values({
          id: entryMeta.id,
          domain: entryMeta.domain,
          country: entryMeta.country,
          scope: entryMeta.scope,
          tags: JSON.stringify(entryMeta.tags) as unknown as string[],
        })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();

      // Insert the new immutable version. PK collision => reject (no overwrite).
      await tx
        .insertInto("knowledge_version")
        .values({
          id: version.id,
          entry_id: version.entryId,
          language: version.language,
          content: JSON.stringify(version.content) as unknown as object,
          sources: JSON.stringify(version.sources) as unknown as object,
          confidence: version.confidence,
          effective_date: version.effectiveDate,
          valid_until: version.validUntil,
          verified_at: version.verifiedAt,
          verified_by: version.verifiedBy,
          next_review_due: version.nextReviewDue,
          superseded_by: version.supersededBy,
          checksum: version.checksum,
        })
        .execute();
    });
  }

  async supersede(oldVersion: VersionId, newVersion: VersionId): Promise<void> {
    // Only superseded_by changes. The immutability trigger permits this column;
    // any attempt to touch content here would be rejected by the DB.
    const res = await this.db
      .updateTable("knowledge_version")
      .set({ superseded_by: newVersion })
      .where("id", "=", oldVersion)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) {
      throw new Error(`supersede: version ${oldVersion} not found`);
    }
  }

  async searchByCountryDomain(
    country: CountryCode,
    domain: KnowledgeDomain
  ): Promise<KnowledgeEntry[]> {
    const entries = await this.db
      .selectFrom("knowledge_entry")
      .selectAll()
      .where("country", "=", country)
      .where("domain", "=", domain)
      .execute();

    return Promise.all(entries.map((e) => this.getEntry(asKnowledgeId(e.id)) as Promise<KnowledgeEntry>));
  }
}
