// core/ai/__tests__/ResponseValidator.test.ts
// M4 contract: cited ⊆ allowed, and no fabricated legal signatures. Deterministic.

import { ResponseValidator } from "../ResponseValidator";
import { createVersionId } from "../../../shared/types";
import type { KnowledgeVersionSnapshot } from "../../../shared/snapshots";

function snap(id: string, legalRef: string, summary = "Bleib ruhig.", details = ""): KnowledgeVersionSnapshot {
  return {
    id: createVersionId(id),
    entryId: "traffic-rights-de" as any,
    language: "de",
    content: {
      summary,
      actions: [],
      rights: [],
      warnings: [],
      details,
      legalRefs: [{ type: "LAW_TEXT", reference: legalRef, retrievedAt: new Date() }]
    },
    confidence: "OFFICIAL" as any,
    effectiveDate: new Date(),
    validUntil: null,
    verifiedAt: new Date(),
    nextReviewDue: new Date(Date.now() + 1_000_000),
    supersededBy: null,
    checksum: "sha256:abc"
  };
}

describe("ResponseValidator (M4)", () => {
  const validator = new ResponseValidator();
  const allowed = [snap("v1", "StVO §36")];

  test("valid when a cited legal ref exists in the provided knowledge", () => {
    const r = validator.validate({
      responseText: "Nach §36 StVO musst du anhalten.",
      allowedKnowledge: allowed,
      citedSources: [createVersionId("v1")]
    });
    expect(r.valid).toBe(true);
    expect(r.fabricatedLegalRefs).toHaveLength(0);
    expect(r.validatedSources.map(String)).toEqual(["v1"]);
  });

  test("flags a fabricated legal signature (§99 not in any source)", () => {
    const r = validator.validate({
      responseText: "Laut §99 StVO darfst du wegfahren.",
      allowedKnowledge: allowed,
      citedSources: [createVersionId("v1")]
    });
    expect(r.valid).toBe(false);
    expect(r.fabricatedLegalRefs).toContain("§99");
  });

  test("cited source outside the allowed set is rejected and stripped", () => {
    const r = validator.validate({
      responseText: "Bleib ruhig.",
      allowedKnowledge: allowed,
      citedSources: [createVersionId("v1"), createVersionId("v-not-allowed")]
    });
    expect(r.valid).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/not in the allowed/i);
    expect(r.validatedSources.map(String)).toEqual(["v1"]); // bad id stripped
  });

  test("whitespace-insensitive: '§ 36' matches '§36' in the source", () => {
    const r = validator.validate({
      responseText: "Siehe § 36.",
      allowedKnowledge: allowed,
      citedSources: []
    });
    expect(r.fabricatedLegalRefs).toHaveLength(0);
    expect(r.valid).toBe(true);
  });

  test("ADR chapter references: present passes, invented fails", () => {
    const adrAllowed = [snap("adr1", "ADR Kapitel 5.3")];
    const ok = validator.validate({
      responseText: "Prüfe die Kennzeichnung nach ADR Kapitel 5.3.",
      allowedKnowledge: adrAllowed,
      citedSources: []
    });
    expect(ok.valid).toBe(true);

    const bad = validator.validate({
      responseText: "Prüfe die Kennzeichnung nach ADR Kapitel 9.9.",
      allowedKnowledge: adrAllowed,
      citedSources: []
    });
    expect(bad.valid).toBe(false);
    expect(bad.fabricatedLegalRefs.some((r) => r.includes("9.9"))).toBe(true);
  });

  test("ordinary prose with no legal signatures is valid", () => {
    const r = validator.validate({
      responseText: "Bleib ruhig und zeige deine Papiere.",
      allowedKnowledge: allowed,
      citedSources: []
    });
    expect(r.valid).toBe(true);
    expect(r.fabricatedLegalRefs).toHaveLength(0);
  });
});
