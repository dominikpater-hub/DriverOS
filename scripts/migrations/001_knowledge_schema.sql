-- Guardian Engine — Knowledge Engine schema (PostgreSQL)
--
-- Mirrors the internal shapes in core/knowledge/KnowledgeEngine.ts exactly.
-- Two invariants from the Domain Model are enforced here, not just in
-- application code, so a bug in the app layer can't silently corrupt data:
--
--   1. A KnowledgeVersion, once inserted, is never UPDATEd (ADR-002).
--      There is no application-level UPDATE statement for this table —
--      enforce it further with a REVOKE UPDATE in production roles.
--   2. A version without a source doesn't exist (§2 invariant) — sources
--      are a NOT NULL jsonb array with a CHECK that it's non-empty.

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id               TEXT PRIMARY KEY,
  domain           TEXT NOT NULL,
  country          TEXT NOT NULL,
  scope            TEXT NOT NULL CHECK (scope IN ('NATIONAL', 'EU', 'REGIONAL')),
  tags             TEXT[] NOT NULL DEFAULT '{}',
  current_version_id TEXT,           -- FK added after knowledge_versions exists
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_versions (
  id               TEXT PRIMARY KEY,
  entry_id         TEXT NOT NULL REFERENCES knowledge_entries(id),
  language         TEXT NOT NULL,
  content          JSONB NOT NULL,          -- StructuredContent
  sources          JSONB NOT NULL,          -- SourceRef[]
  confidence       TEXT NOT NULL CHECK (confidence IN ('OFFICIAL', 'VERIFIED', 'COMMUNITY')),
  effective_date   TIMESTAMPTZ NOT NULL,
  valid_until      TIMESTAMPTZ,
  verified_at      TIMESTAMPTZ NOT NULL,
  verified_by      TEXT NOT NULL,
  next_review_due  TIMESTAMPTZ NOT NULL,
  superseded_by    TEXT REFERENCES knowledge_versions(id),
  checksum         TEXT NOT NULL,

  CONSTRAINT sources_not_empty CHECK (jsonb_array_length(sources) > 0)
);

ALTER TABLE knowledge_entries
  ADD CONSTRAINT fk_current_version
  FOREIGN KEY (current_version_id) REFERENCES knowledge_versions(id);

CREATE TABLE IF NOT EXISTS emergency_cards (
  id            TEXT PRIMARY KEY,
  country       TEXT NOT NULL UNIQUE,   -- one card per country per type would need (country, type) unique instead
  type          TEXT NOT NULL,
  content       JSONB NOT NULL,
  contacts      JSONB NOT NULL,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum      TEXT NOT NULL
);

-- Read-path indexes matching KnowledgeEngine's actual query patterns:
-- searchKnowledge() filters by domain + country, then by tag overlap.
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_country_domain
  ON knowledge_entries (country, domain);

CREATE INDEX IF NOT EXISTS idx_knowledge_entries_tags
  ON knowledge_entries USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_knowledge_versions_entry_id
  ON knowledge_versions (entry_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_versions_next_review_due
  ON knowledge_versions (next_review_due);

-- Enforcement note (apply in production, not in this migration, since it
-- depends on your app's DB role name):
--   REVOKE UPDATE ON knowledge_versions FROM guardian_app_role;
--   GRANT INSERT, SELECT ON knowledge_versions TO guardian_app_role;
-- This makes ADR-002 immutability a database-level guarantee, not just
-- an application convention that a future bug could violate.
