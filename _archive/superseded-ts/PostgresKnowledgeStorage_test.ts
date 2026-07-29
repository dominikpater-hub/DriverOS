import { describe, it, expect, beforeEach } from "vitest";
import { Kysely, PGliteDialect } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PostgresKnowledgeStorage, type KnowledgeDB } from "../PostgresKnowledgeStorage.js";
import {
  type KnowledgeVersion,
  KnowledgeDomain,
  Confidence,
  Scope,
  asKnowledgeId,
  asVersionId,
} from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function makeVersion(id: string, over: Partial<KnowledgeVersion> = {}): KnowledgeVersion {
  return {
    id: asVersionId(id),
    entryId: asKnowledgeId("traffic-rights-de"),
    language: "de",
    content: {
      summary: "Deine Rechte",
      actions: [{ order: 1, text: "Bleib ruhig", critical: true }],
      rights: ["Recht zu schweigen"],
      warnings: ["Nicht fliehen"],
      details: "…",
      legalRefs: [{ type: "LAW_TEXT", reference: "StVO §63", retrievedAt: new Date() }],
    },
    sources: [{ type: "OFFICIAL_SITE", reference: "gesetze-im-internet.de", retrievedAt: new Date() }],
    confidence: Confidence.OFFICIAL,
    effectiveDate: new Date("2026-01-01"),
    validUntil: null,
    verifiedAt: new Date("2026-01-01"),
    verifiedBy: "admin@guardian.de",
    nextReviewDue: new Date("2026-04-01"),
    supersededBy: null,
    checksum: "abc",
    ...over,
  };
}

const entryMeta = {
  id: asKnowledgeId("traffic-rights-de"),
  domain: KnowledgeDomain.TRAFFIC_LAW,
  country: "DE",
  scope: Scope.NATIONAL,
  tags: ["inspection"],
};

describe("PostgresKnowledgeStorage (PGlite)", () => {
  let db: Kysely<KnowledgeDB>;
  let store: PostgresKnowledgeStorage;
  let pg: PGlite;

  beforeEach(async () => {
    pg = new PGlite();
    db = new Kysely<KnowledgeDB>({ dialect: new PGliteDialect({ pglite: pg }) });
    const sql = readFileSync(join(__dirname, "..", "schema.sql"), "utf8");
    await pg.exec(sql);
    store = new PostgresKnowledgeStorage(db);
  });

  it("inserts and reads back a version", async () => {
    await store.insertVersion(entryMeta, makeVersion("v1"));
    const got = await store.getVersion(asVersionId("v1"));
    expect(got?.content.summary).toBe("Deine Rechte");
    expect(got?.sources).toHaveLength(1);
  });

  it("computes currentVersion as the newest non-superseded", async () => {
    await store.insertVersion(entryMeta, makeVersion("v1", { effectiveDate: new Date("2026-01-01") }));
    await store.insertVersion(entryMeta, makeVersion("v2", { effectiveDate: new Date("2026-06-01") }));
    await store.supersede(asVersionId("v1"), asVersionId("v2"));

    const entry = await store.getEntry(asKnowledgeId("traffic-rights-de"));
    expect(entry?.currentVersion).toBe("v2");
    expect(entry?.versions).toHaveLength(2);
  });

  it("old version content stays untouched after superseding", async () => {
    await store.insertVersion(entryMeta, makeVersion("v1"));
    await store.insertVersion(entryMeta, makeVersion("v2", { effectiveDate: new Date("2026-06-01") }));
    await store.supersede(asVersionId("v1"), asVersionId("v2"));

    const v1 = await store.getVersion(asVersionId("v1"));
    expect(v1?.content.summary).toBe("Deine Rechte"); // unchanged
    expect(v1?.supersededBy).toBe("v2");
  });

  it("DATABASE rejects mutating a published version's content", async () => {
    await store.insertVersion(entryMeta, makeVersion("v1"));
    // Bypass the storage class — attack the DB directly to prove the trigger works.
    await expect(
      db.updateTable("knowledge_version")
        .set({ content: JSON.stringify({ summary: "HACKED" }) as unknown as object })
        .where("id", "=", "v1")
        .execute()
    ).rejects.toThrow(/immutable/i);
  });

  it("DATABASE rejects a version with zero sources", async () => {
    await expect(
      db.insertInto("knowledge_version").values({
        id: "bad", entry_id: "traffic-rights-de", language: "de",
        content: JSON.stringify({}) as unknown as object,
        sources: JSON.stringify([]) as unknown as object, // empty!
        confidence: "OFFICIAL",
        effective_date: new Date(), valid_until: null, verified_at: new Date(),
        verified_by: "x", next_review_due: new Date(), superseded_by: null, checksum: "x",
      }).execute()
    ).rejects.toThrow(); // CHECK constraint sources_not_empty
  });

  it("rejects inserting a duplicate version id (no overwrite)", async () => {
    await store.insertVersion(entryMeta, makeVersion("v1"));
    await expect(store.insertVersion(entryMeta, makeVersion("v1"))).rejects.toThrow();
  });

  it("searchByCountryDomain returns matching entries with versions", async () => {
    await store.insertVersion(entryMeta, makeVersion("v1"));
    const found = await store.searchByCountryDomain("DE", KnowledgeDomain.TRAFFIC_LAW);
    expect(found).toHaveLength(1);
    expect(found[0].versions).toHaveLength(1);
  });
});
