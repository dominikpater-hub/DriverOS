-- Guardian Knowledge storage schema (PostgreSQL).
-- The immutability of KnowledgeVersion (ADR-002) is enforced at the DB layer,
-- not only in application code. A trigger blocks UPDATEs to content columns.

CREATE TABLE IF NOT EXISTS knowledge_entry (
  id        TEXT PRIMARY KEY,
  domain    TEXT NOT NULL,
  country   TEXT NOT NULL,
  scope     TEXT NOT NULL,
  tags      JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_entry_country_domain
  ON knowledge_entry (country, domain);

CREATE TABLE IF NOT EXISTS knowledge_version (
  id              TEXT PRIMARY KEY,
  entry_id        TEXT NOT NULL REFERENCES knowledge_entry(id),
  language        TEXT NOT NULL,
  content         JSONB NOT NULL,
  sources         JSONB NOT NULL,
  confidence      TEXT NOT NULL,
  effective_date  TIMESTAMPTZ NOT NULL,
  valid_until     TIMESTAMPTZ,
  verified_at     TIMESTAMPTZ NOT NULL,
  verified_by     TEXT NOT NULL,
  next_review_due TIMESTAMPTZ NOT NULL,
  superseded_by   TEXT REFERENCES knowledge_version(id),
  checksum        TEXT NOT NULL,
  -- A version with no source does not exist. Enforced here, not just in code.
  CONSTRAINT sources_not_empty CHECK (jsonb_array_length(sources) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_version_entry ON knowledge_version (entry_id);

-- Immutability guard: once a row exists, only superseded_by / valid_until may change.
-- Any attempt to rewrite content, sources, confidence, etc. is rejected.
CREATE OR REPLACE FUNCTION guardian_block_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.content        IS DISTINCT FROM OLD.content)
  OR (NEW.sources        IS DISTINCT FROM OLD.sources)
  OR (NEW.confidence     IS DISTINCT FROM OLD.confidence)
  OR (NEW.language       IS DISTINCT FROM OLD.language)
  OR (NEW.effective_date IS DISTINCT FROM OLD.effective_date)
  OR (NEW.checksum       IS DISTINCT FROM OLD.checksum)
  OR (NEW.entry_id       IS DISTINCT FROM OLD.entry_id)
  THEN
    RAISE EXCEPTION 'knowledge_version is immutable: content columns cannot be modified (id=%)', OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_version_immutable ON knowledge_version;
CREATE TRIGGER trg_version_immutable
  BEFORE UPDATE ON knowledge_version
  FOR EACH ROW EXECUTE FUNCTION guardian_block_version_mutation();
