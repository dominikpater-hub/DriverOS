# Guardian Engine — Book

The living architecture, ADRs, journal, and governance for Guardian Engine.
Code lives in the repository root (`core/`, `apps/`, `shared/`); this folder is
the "why", not the "how".

## Reading order

| # | Document | What it answers |
|---|---|---|
| 000 | [Constitution](000-Constitution.md) | Mission, vision, seven core principles |
| 001 | [Engineering Handbook](001-Engineering-Handbook.md) | How we build (short form; full PDF alongside) |
| 002 | [Domain Model](002-Domain-Model.md) → [full Artefakt #0002](Artefakt_0002_Guardian_Domain_Model.md) | Entities, bounded contexts, data flows |
| 003 | [Workflow Spec](003-Workflow-Spec.md) | Everything is a workflow |
| 004 | [Roadmap](004-Roadmap.md) | V0 DriverOS PL to V4 TravelOS |
| 005 | [Book Index](005-Guardian-Book-Index.md) | This map, canonical |

## Architecture Decision Records

- ADR-001 — Platform First: Guardian Engine is the platform; DriverOS is the first product.
- ADR-002 — Workflow over Features: workflow-driven, not screen-driven.
- ADR-003 — Offline First: critical workflows work offline.

Three more ADRs are documented inside Artefakt #0002 (graph-not-pipeline,
versioned-not-immutable knowledge, the Trust Ladder) and should be extracted
into `adr/` as standalone files when touched.

## Log & journal

- decision-log/DECISION_LOG.md — DEC-0001..DEC-0007, one line each.
- journal/ — dated session notes.

## Relationship to the code

The code root carries its own operational docs (README, BUILD_STATUS,
PROJECT_MAP, STARTUP_CHECKLIST) describing how to build and run — the "how".
This Book is the "why". When a code decision changes an invariant, add an ADR
here and reference it from the code doc rather than duplicating prose.
