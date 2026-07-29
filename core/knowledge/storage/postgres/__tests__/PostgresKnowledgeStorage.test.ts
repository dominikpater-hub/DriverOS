/**
 * POSTGRES KNOWLEDGE STORAGE — TEST SUITE
 *
 * No real database required: `pg.Pool` is mocked. These tests verify the
 * mapping between domain objects and SQL rows, and the query shapes sent
 * to Postgres — the two things most likely to silently drift from
 * KnowledgeEngine's expectations as the schema evolves.
 *
 * Full integration testing against a real Postgres instance belongs in a
 * separate CI job with docker-compose — tracked in BUILD_STATUS.md.
 */

import { PostgresKnowledgeStorage } from "../PostgresKnowledgeStorage";
import { createKnowledgeId, createVersionId, ConfidenceLevel } from "../../../../../shared/types";

function makeMockPool(queryImpl: jest.Mock) {
  return {
    query: queryImpl,
    connect: jest.fn().mockResolvedValue({
      query: queryImpl,
      release: jest.fn()
    })
  } as any;
}

describe("PostgresKnowledgeStorage", () => {
  it("getEntry returns null when no row is found", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const storage = new PostgresKnowledgeStorage(makeMockPool(query));

    const result = await storage.getEntry(createKnowledgeId("nope"));
    expect(result).toBeNull();
  });

  it("getEntry maps a row + its version ids into a KnowledgeEntry", async () => {
    const entryRow = {
      id: "traffic-rights-de",
      domain: "TRAFFIC_LAW",
      country: "DE",
      scope: "NATIONAL",
      tags: ["rights"],
      current_version_id: "v1",
      created_at: new Date("2026-01-01"),
      updated_at: new Date("2026-01-02")
    };

    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [entryRow] })       // entry lookup
      .mockResolvedValueOnce({ rows: [{ id: "v1" }] });  // version ids lookup

    const storage = new PostgresKnowledgeStorage(makeMockPool(query));
    const result = await storage.getEntry(createKnowledgeId("traffic-rights-de"));

    expect(result).toEqual({
      id: "traffic-rights-de",
      domain: "TRAFFIC_LAW",
      country: "DE",
      scope: "NATIONAL",
      tags: ["rights"],
      versions: ["v1"],
      currentVersionId: "v1",
      createdAt: entryRow.created_at,
      updatedAt: entryRow.updated_at
    });
  });

  it("getVersion maps a version row back into a KnowledgeVersion, JSON fields parsed", async () => {
    const content = { summary: "x", actions: [], rights: [], warnings: [], details: "", legalRefs: [] };
    const sources = [{ type: "OFFICIAL_SITE", reference: "x", retrievedAt: new Date() }];

    const versionRow = {
      id: "v1",
      entry_id: "traffic-rights-de",
      language: "de",
      content,
      sources,
      confidence: "OFFICIAL",
      effective_date: new Date("2026-01-01"),
      valid_until: null,
      verified_at: new Date("2026-01-01"),
      verified_by: "admin@guardian.de",
      next_review_due: new Date("2026-04-01"),
      superseded_by: null,
      checksum: "sha256:abc"
    };

    const query = jest.fn().mockResolvedValue({ rows: [versionRow] });
    const storage = new PostgresKnowledgeStorage(makeMockPool(query));

    const result = await storage.getVersion(createVersionId("v1"));
    expect(result?.content).toEqual(content);
    expect(result?.confidence).toBe(ConfidenceLevel.OFFICIAL);
    expect(result?.supersededBy).toBeNull();
  });

  it("searchEntries builds a WHERE clause only for provided filters", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const storage = new PostgresKnowledgeStorage(makeMockPool(query));

    await storage.searchEntries({ country: "DE" as any });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("WHERE");
    expect(sql).toContain("country = $1");
    expect(sql).not.toContain("domain =");
    expect(params).toEqual(["DE"]);
  });

  it("searchEntries omits WHERE entirely when no filters are given", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const storage = new PostgresKnowledgeStorage(makeMockPool(query));

    await storage.searchEntries({});

    const [sql] = query.mock.calls[0];
    expect(sql).not.toContain("WHERE");
  });

  it("saveVersion issues an upsert that only updates superseded_by on conflict (ADR-002: content itself is never updated)", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const storage = new PostgresKnowledgeStorage(makeMockPool(query));

    await storage.saveVersion({
      id: createVersionId("v1"),
      entryId: createKnowledgeId("traffic-rights-de"),
      language: "de",
      content: { summary: "x", actions: [], rights: [], warnings: [], details: "", legalRefs: [] },
      sources: [{ type: "OFFICIAL_SITE", reference: "x", retrievedAt: new Date() }],
      confidence: ConfidenceLevel.OFFICIAL,
      effectiveDate: new Date(),
      validUntil: null,
      verifiedAt: new Date(),
      verifiedBy: "admin",
      nextReviewDue: new Date(),
      supersededBy: null,
      checksum: "sha256:abc"
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE SET superseded_by");
    // The critical property: no other column appears in the DO UPDATE SET clause
    const doUpdateClause = sql.split("DO UPDATE SET")[1];
    expect(doUpdateClause.trim()).toBe("superseded_by = EXCLUDED.superseded_by");
  });

  it("saveEmergencyCard upserts keyed on country", async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const storage = new PostgresKnowledgeStorage(makeMockPool(query));

    await storage.saveEmergencyCard({
      id: "card-1" as any,
      country: "DE" as any,
      type: "POLICE_STOP",
      content: { summary: "x", actions: [], rights: [], warnings: [], details: "", legalRefs: [] },
      contacts: [],
      lastUpdated: new Date(),
      checksum: "sha256:abc"
    });

    const [sql] = query.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (country) DO UPDATE SET");
  });
});
