// shared/snapshots.ts
// Cross-boundary DTOs: value shapes that travel BETWEEN engines via the
// Workflow orchestrator. Living in shared (not owned by one engine) lets the
// AI port reference a knowledge snapshot without core/ai importing
// core/knowledge (Domain Model §1 rule 1).
import { KnowledgeId, VersionId, LanguageCode, StructuredContent, ConfidenceLevel } from "./types";

export interface KnowledgeVersionSnapshot {
  id: VersionId;
  entryId: KnowledgeId;
  language: LanguageCode;
  content: StructuredContent;
  confidence: ConfidenceLevel;
  effectiveDate: Date;
  validUntil: Date | null;
  verifiedAt: Date;
  nextReviewDue: Date;
  supersededBy: VersionId | null;
  checksum: string; // For offline package integrity
}
