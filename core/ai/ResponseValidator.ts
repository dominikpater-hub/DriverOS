// core/ai/ResponseValidator.ts
//
// M4 / TRUST-1 (Guardian constitution): AI is NEVER a source of truth. Even
// T3_AI_ASSISTED output must not smuggle in claims the verified knowledge did
// not license. This validator is the gate every AI response passes before it
// can be shown as T3 — if it fails, the AIEngine degrades the response to T4.
//
// Two invariants:
//   1. cited ⊆ allowed — the sources an answer claims to rest on must be a
//      subset of the verified knowledge that was actually provided as grounding.
//   2. no fabricated legal signatures — any statute/article reference the model
//      writes (§36, Art. 5, "ADR Kapitel 5.3") must appear verbatim in some
//      provided source. A law reference the model invented is the most
//      dangerous hallucination for a driver, so it fails validation outright.
//
// Deliberately zero-AI and deterministic: same input → same verdict.

import type { VersionId } from "../../shared/types";
import type { KnowledgeVersionSnapshot } from "../../shared/snapshots";

export interface ResponseValidationInput {
  responseText: string;
  /** The verified knowledge provided to the model as grounding. */
  allowedKnowledge: KnowledgeVersionSnapshot[];
  /** Sources the engine believes the answer used (to be checked ⊆ allowed). */
  citedSources: VersionId[];
}

export interface ResponseValidationResult {
  valid: boolean;
  reasons: string[];
  /** citedSources ∩ allowed — the only sources safe to attribute. */
  validatedSources: VersionId[];
  /** Legal references in the text absent from every provided source. */
  fabricatedLegalRefs: string[];
}

// Legal-signature shapes. Conservative on purpose — we only flag tokens that
// clearly look like a codified legal citation, to avoid false positives on
// ordinary prose.
const LEGAL_REF_PATTERNS: RegExp[] = [
  /§\s?\d+[a-zA-Z]?/g,                       // §36, § 36a
  /\bArt(?:ikel|\.)?\s?\d+[a-zA-Z]?/gi,      // Art. 5, Artikel 5
  /\bADR\s?(?:Kapitel|Chapter)?\s?\d+(?:\.\d+)*/gi, // ADR Kapitel 5.3
  /\b§{2}\s?\d+/g,                            // §§ 1
];

export class ResponseValidator {
  validate(input: ResponseValidationInput): ResponseValidationResult {
    const reasons: string[] = [];

    // 1. cited ⊆ allowed
    const allowedIds = new Set(input.allowedKnowledge.map((k) => String(k.id)));
    const validatedSources: VersionId[] = [];
    for (const c of input.citedSources) {
      if (allowedIds.has(String(c))) validatedSources.push(c);
      else reasons.push(`Cited source "${String(c)}" is not in the allowed knowledge set`);
    }

    // 2. no fabricated legal signatures
    const allowedLegalText = this.norm(this.collectAllowedText(input.allowedKnowledge));
    const fabricatedLegalRefs: string[] = [];
    for (const ref of this.extractLegalRefs(input.responseText)) {
      if (!allowedLegalText.includes(this.norm(ref))) {
        fabricatedLegalRefs.push(ref);
        reasons.push(`Legal reference "${ref}" does not appear in any verified source (possible fabrication)`);
      }
    }

    return {
      valid: reasons.length === 0,
      reasons,
      validatedSources,
      fabricatedLegalRefs,
    };
  }

  private extractLegalRefs(text: string): string[] {
    const found = new Set<string>();
    for (const re of LEGAL_REF_PATTERNS) {
      for (const m of text.match(re) ?? []) found.add(m.trim());
    }
    return [...found];
  }

  private collectAllowedText(allowed: KnowledgeVersionSnapshot[]): string {
    const parts: string[] = [];
    for (const k of allowed) {
      parts.push(k.content.summary, k.content.details);
      for (const lr of k.content.legalRefs) parts.push(lr.reference);
    }
    return parts.join(" ");
  }

  /** Lowercase and strip whitespace so "§ 36" and "§36" compare equal. */
  private norm(s: string): string {
    return s.toLowerCase().replace(/\s+/g, "");
  }
}
