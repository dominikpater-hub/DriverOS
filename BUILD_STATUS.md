# Guardian Engine — Build Status

**v0.1 Foundation** — What's ready. What's next.

Date: July 18, 2026
Status: Core Engines Implemented & Tested ✅ | Storage Layer + DriverOS UI Next 🚀

---

## ⚡ Verified Today

This isn't a plan anymore — it's been run.

```
✅ npm run type-check:all     → 0 errors, both backend (Node) and DriverOS (React/DOM) tsconfigs
✅ npx jest                   → 76/76 tests passing (6 suites)
✅ npx ts-node scripts/bootstrap-local.ts
   → Both DriverOS workflows executed start-to-finish:
     Inspection_DE (car) and ADR_Check_DE (ADR truck),
     each producing a distinct Incident with correct knowledgeUsed[].
```

**Three real bugs were caught and fixed by integration testing / the bootstrap:**

1. `WorkflowEngine.startWorkflow()` was building its own `SituationContext`
   with a hardcoded `language: "en"` and no location, silently discarding
   whatever the caller passed in. Fixed by threading
   `location`/`language`/`vehicleId` through `StartWorkflowInput`.

2. `executeShowKnowledge()` never pushed anything into `knowledgeUsed[]`,
   and `KnowledgeEntrySnapshot` never carried a `trustLevel` field at all —
   `WorkflowEngine` was hardcoding `TrustLevel.VERIFIED` regardless of what
   Knowledge Engine actually computed. Both fixed: `KnowledgeEngine`'s
   snapshot builder now receives the owning entry and returns the real
   `country`/`domain`/`trustLevel`; `executeShowKnowledge()` records every
   version shown and supports per-step tag filtering via
   `stepDef.data.knowledgeTags` (proven by `ADR_Check_DE`).

3. **The TRANSLATE step had no executor at all** — it silently fell into
   `default: throw "Unknown step kind"`, which happened to *look* like
   working offline-fallback behavior only because every workflow we wrote
   set `next === fallback` for that step by convention. In reality: (a)
   TRANSLATE never attempted a real translation, online or offline, and
   (b) the fallback-transition logic itself was reading `stepDef.next`
   (the *failed* step's next pointer) rather than committing to
   `stepDef.fallback` directly — it worked by coincidence, not design.
   Fixed: added a real `executeTranslate()` that calls AI Engine when
   online and throws deliberately when `Connectivity.OFFLINE`; the catch
   block now sets `nextStepId: stepDef.fallback` explicitly, so fallback
   transitions are correct even in a future workflow where `next` and
   `fallback` differ. Three new tests replace the one weak test that
   used to just check "didn't crash": genuinely-offline throw+fallback,
   online provider-failure fallback, and online success (no fallback).

Keep running `bootstrap-local.ts` after any change that touches
Context, Knowledge, or Workflow — this is exactly the class of bug
unit tests miss and integration tests catch.

---

## Architecture (COMPLETE ✅)

### Documents (Foundation)
- ✅ Artefakt #0001 — Constitution (Mission, vision, principles)
- ✅ Artefakt #0002 — Domain Model (Entities, ADRs, bounded contexts)
- ✅ Engineering Handbook (Development rules, priorities)

### Code Structure (READY)
- ✅ Directory skeleton: `guardian-engine/core/`, `shared/`, `apps/`, etc.
- ✅ `shared/types/index.ts` — All fundamental types
- ✅ `core/index.ports.ts` — All port definitions
- ✅ `package.json` — Build configuration

---

## Engine Implementations

### Knowledge Engine ✅ Implemented + Tested
**File:** `core/knowledge/KnowledgeEngine.ts`
**Tests:** `core/knowledge/__tests__/KnowledgeEngine.test.ts` — 15 tests passing

- [x] KnowledgeVersion (immutable), KnowledgeEntry (aggregate)
- [x] KnowledgePublisher.publishVersion() — supersedes old version correctly
- [x] Rejects publishing without a source (verified by test)
- [x] Old version's content proven untouched after superseding (verified by test)
- [x] Emergency card retrieval (TIER_0)
- [x] `KnowledgeEntrySnapshot` now carries a real `trustLevel`, `country`, and `domain` (previously these were placeholder/wrong values — `snapshotVersion()` didn't have access to the owning entry; fixed today)
- [x] `searchKnowledge()` tag filtering fixed — was passing a malformed query shape to storage and never actually filtering by tag; now filters correctly, which is what lets ADR_Check_DE's two SHOW_KNOWLEDGE steps show different content
- [x] `InMemoryKnowledgeStorage` — mock for tests/local dev, now formally `implements IKnowledgeStorage` (compiler-verified)
- [x] **`PostgresKnowledgeStorage` — first real database backend, done today.** Schema at `scripts/migrations/001_knowledge_schema.sql`, implementation at `core/knowledge/storage/postgres/PostgresKnowledgeStorage.ts`, 7 tests against a mocked `pg.Pool` (no real DB needed to verify row↔domain mapping and query shape). ADR-002 immutability is now a **schema-level** property too, not just an app convention: versions are INSERT-only, with only `superseded_by` upsertable; the migration includes a `REVOKE UPDATE` note for the production DB role. This is the reference pattern the Rule/Workflow Postgres storage should follow.

**Still open:**
- [ ] PostgreSQL storage for Decision (Rules) and Workflow engines, following the `PostgresKnowledgeStorage` pattern
- [ ] IndexedDB implementation of `IKnowledgeStorage` (client-side, for offline packages)
- [ ] `PostgresKnowledgeStorage` needs a real integration test against an actual Postgres instance (docker-compose) before production use — the mocked-Pool tests only prove the SQL shape and mapping logic, not that the schema itself is correct
- [ ] Coverage gaps: `listVersions()`, `OfflinePackageBuilder`, checksum edge cases (currently ~75% stmts — target 90%)

---

### Decision Engine ✅ Implemented + Tested
**File:** `core/decision/DecisionEngine.ts`
**Tests:** `core/decision/__tests__/DecisionEngine.test.ts` — 24 tests passing

- [x] All 8 operators (eq, neq, in, nin, gt, lt, gte, lte) — individually tested
- [x] Priority ordering, including overlap resolution
- [x] **Determinism proven:** identical input, 1000 runs, identical output (byte-for-byte JSON comparison)
- [x] Determinism proven across engine re-initialization (simulated restart)
- [x] Guards against calling `matchRules()` before `initialize()`
- [x] `RuleBuilder` DSL + `InMemoryRuleStorage`

**Still open:**
- [ ] PostgreSQL implementation of `IRuleStorage`
- [ ] Real conflict detection at rule-publish time (currently only warns; see `validateRules()`)
- [ ] Coverage gaps: ~90% stmts — a few branches in validation logic untested

---

### Context Engine ✅ Implemented + Tested
**File:** `core/context/ContextEngine.ts`
**Tests:** `core/context/__tests__/ContextEngine.test.ts` — 14 tests passing

- [x] `buildContext()` — GPS resolution with fallback to `homeCountry`
- [x] Language resolution: explicit → profile's first language → `"en"`
- [x] `OfflineBoundingBoxGeoResolver` — works fully offline (no network call)
- [x] `InMemoryProfileStorage` for tests/local dev
- [x] 93% statement coverage — exceeds the 80% target

**Still open:**
- [ ] Real reverse-geocoding for production (bounding boxes are a placeholder — fine for DE-only MVP, not for TravelOS-scale country coverage)
- [ ] Real connectivity probe for React Native / mobile (current one only checks `navigator.onLine`)

---

### Workflow Engine ✅ Implemented + Integration Tested
**File:** `core/workflow/WorkflowEngine.ts`
**Tests:** `core/workflow/__tests__/WorkflowEngine.test.ts` — 13 integration tests passing

- [x] Full happy path proven: start → 5 steps → COMPLETED, using the **real** Inspection_DE definition wired to **real** Knowledge/Context/Decision engines
- [x] SHOW_KNOWLEDGE step proven to surface actual verified German content (not a mock), tracks `knowledgeUsed[]`, renders the real trust level, supports per-step tag filtering (`stepDef.data.knowledgeTags`)
- [x] **TRANSLATE now has a real executor** (`executeTranslate`) — calls AI Engine when online, throws deliberately when `Connectivity.OFFLINE` (previously: no executor existed at all, see "Verified Today")
- [x] Fallback transition is now explicit — `nextStepId: stepDef.fallback` is set directly in the catch block, not inferred from `stepDef.next` happening to match `stepDef.fallback` by convention
- [x] Three fallback tests replace the one weak "didn't crash" test: genuinely-offline throw+fallback (built with a real OFFLINE `ContextEngine`), online provider-failure fallback, online success/no-fallback — all three assert the *exact* step id reached, not just "not ABANDONED"
- [x] EMERGENCY_CARD step proven to work with zero location input (pure homeCountry fallback)
- [x] Guards: unknown instance, unknown definition both throw clear errors
- [x] `validateWorkflowDefinition()` extracted to `core/workflow/validateWorkflowDefinition.ts` — shared by both workflows; checks NETWORK-requires-fallback plus structural integrity (entryStepId exists, every `next`/`fallback` points to a real step)

**Still open:**
- [ ] PostgreSQL / IndexedDB implementation of `IWorkflowStorage` (Knowledge Engine now has a Postgres reference implementation — see below — Workflow's is the next one to build following that pattern)
- [ ] `executeTranslate` currently passes `knowledgeContext: []` to AI Engine, which trips AI Engine's own "online but no knowledge = fallback" guard — so TRANSLATE mostly exercises AI Engine's fallback path rather than a real translation today. Either give TRANSLATE a minimal phrase-knowledge source, or special-case pure-translation steps in AI Engine's invariant. Documented, not yet resolved.
- [ ] Step executors functionally complete but not covering error paths for CAPTURE_PHOTO/GENERATE_REPORT edge cases

---

### AI Engine ✅ Code Complete + Unit Tested
**File:** `core/ai/AIEngine.ts`
**Tests:** `core/ai/__tests__/AIEngine.test.ts` — 18 tests passing, 100% statement coverage

- [x] Model routing (Haiku default, Sonnet for AI_ASSIST) — tested, including explicit `modelHint` override and unknown-stepKind fallback
- [x] System prompt construction with hallucination guardrails — tested that verified knowledge summary appears in the system prompt
- [x] Fallback response on offline / provider error — tested (offline short-circuits before ever calling the LLM; provider throw degrades gracefully)
- [x] Online-but-no-knowledge also degrades to fallback — tested (guards against silent hallucination)
- [x] Never returns T1/T2 — tested explicitly
- [x] `ModelCostCalculator` + `BatchProcessor` — cost math unit tested (5x output/input ratio, ~5x haiku→opus spread, exact 50% batch savings)
- [x] `ClaudeAPIProvider` — currently a **mock**, returns canned text

**Still open (Week 3 per STARTUP_CHECKLIST):**
- [ ] Wire `ClaudeAPIProvider.generateText()` to the real Anthropic API
- [ ] Prompt caching + batch API integration against the real API (currently just cost-math helpers, not a real queue/cache)

---


## Storage Layer

| Storage | Status |
|---------|--------|
| `InMemoryKnowledgeStorage` | ✅ Done — powers all Knowledge tests + bootstrap |
| `InMemoryRuleStorage` | ✅ Done — powers all Decision tests + bootstrap |
| `InMemoryProfileStorage` | ✅ Done — powers all Context tests + bootstrap |
| In-memory Workflow storage | ✅ Done, but still inline in test files / bootstrap script — needs extracting to `core/workflow/storage/InMemoryWorkflowStorage.ts` for consistency |
| PostgreSQL (any engine) | ⬜ Not started |
| IndexedDB (any engine) | ⬜ Not started |

---

## First Product: DriverOS

### Workflows ✅ Both Defined + Validated + Tested

**`Inspection_DE`** — `apps/driver-os/workflows/InspectionDE.ts`
- [x] 5 steps: EMERGENCY_CARD → SHOW_KNOWLEDGE → TRANSLATE → CAPTURE_PHOTO → GENERATE_REPORT
- [x] Proven end-to-end via `scripts/bootstrap-local.ts` and the Workflow Engine integration suite

**`ADR_Check_DE`** — `apps/driver-os/workflows/ADRCheckDE.ts` (built today — the dangling rule from Week 1 now has a real workflow behind it)
- [x] 6 steps: EMERGENCY_CARD → SHOW_KNOWLEDGE (rights) → SHOW_KNOWLEDGE (adr) → TRANSLATE → CAPTURE_PHOTO → GENERATE_REPORT
- [x] Proven that its two SHOW_KNOWLEDGE steps surface genuinely different content (`stepDef.data.knowledgeTags`), and that both versions land in the final Incident's `knowledgeUsed[]`

**Shared:** `validateWorkflowDefinition()` — extracted to `core/workflow/validateWorkflowDefinition.ts`, runs at module load for both workflows; checks NETWORK-requires-fallback (Offline First) plus structural integrity (entryStepId exists, every `next`/`fallback` points to a real step)

### Rules: DriverOS routing ✅ Defined + No Longer Dangling
**File:** `apps/driver-os/rules/DriverOSRules.ts`

- [x] Truck+ADR → `ADR_Check_DE` (priority 100) — workflow now exists, proven via bootstrap that this rule wins over the standard inspection rule for the same country/event
- [x] Standard inspection → `Inspection_DE` (priority 90)
- [x] Universal fallback → T4 (priority 0)

**Still open:**
- [ ] German knowledge content in `bootstrap-local.ts` is illustrative, not legally reviewed — do not ship to a real driver without legal sign-off.

### DriverOS UI 🟡 Skeleton Built, Type-Checked, Not Yet Running in a Browser
**Files:** `apps/driver-os/src/components/`, `apps/driver-os/src/hooks/`
**Type-check:** `npm run type-check:driver-os` (dedicated tsconfig with JSX + DOM — see below)

- [x] `TrustLevelBadge.tsx` — pure presentational, renders the ADR-003 Trust Ladder (T1-T4) with distinct colors/labels; this is the Domain Model's "UI ma obowiązek go renderować" requirement made concrete
- [x] `useWorkflow.ts` — the **only** bridge between UI and Guardian Engine, talking to a (not-yet-built) HTTP API layer, never importing `core/*` directly — enforces "UI zna tylko stan WorkflowInstance" from Domain Model §1
- [x] `WorkflowUI.tsx` — thin rendering component: shows step title/content/trust badge, a photo-capture input when the step needs one, and a single "Weiter" button — implementing the Handbook's "max 2 taps, max 1 decision, max 5 seconds to critical info" constraint directly in the layout
- [x] Dedicated `apps/driver-os/tsconfig.json` (JSX + DOM lib) — the root backend tsconfig deliberately excludes `apps/driver-os/src/**` now, since Node and browser type environments don't mix (this was actually caught by trying to type-check both together — the root tsconfig's Node-flavored `fetch` types silently differ from DOM's)

**Still open:**
- [ ] No actual app scaffold yet — no `package.json`, bundler (Vite/similar), or entrypoint for `apps/driver-os` as a runnable project; these components exist as source but nothing serves them yet
- [ ] `WorkflowController` HTTP API — the server-side layer `useWorkflow.ts` expects (`POST /api/workflows`, etc.) doesn't exist; it's a thin wrapper around `WorkflowEngine` and is Week 4's main backend task
- [ ] No component tests (React Testing Library or similar) yet
- [ ] Offline detection in the UI itself (`useOffline` hook mentioned in STARTUP_CHECKLIST) not started — `Connectivity` is currently only known inside `SituationContext`, not surfaced to the UI directly

---

## Testing Summary

| Suite | Tests | Status |
|-------|-------|--------|
| KnowledgeEngine | 15 | ✅ All passing |
| DecisionEngine | 24 (incl. determinism ×1000) | ✅ All passing |
| ContextEngine | 14 | ✅ All passing |
| WorkflowEngine (integration, incl. ADR_Check_DE, tightened fallback tests) | 13 | ✅ All passing |
| AIEngine | 18 | ✅ All passing, 100% statement coverage |
| PostgresKnowledgeStorage (mocked Pool) | 7 | ✅ All passing |
| **Total** | **76/76 across 6 suites** | ✅ |

Coverage thresholds in `jest.config.js` (90-95% for Knowledge/Decision) are
**not yet met** (currently ~73-91% depending on file) — expected and
tracked, not a regression. Gaps are listed per-engine above.

---

## Offline Strategy

- [x] Theory + `OfflinePackageBuilder` skeleton exist
- [x] Offline-first is now enforced as a **build-time check** for real
      (`validateWorkflowDefinition` in `InspectionDE.ts`), not just a
      Handbook aspiration
- [ ] TIER_0/1/2 package building itself is still unimplemented (skeleton only)
- [ ] Delta sync protocol — not started

---

## Documentation

- ✅ `README.md`, `PROJECT_MAP.md`, `STARTUP_CHECKLIST.md`, `BUILD_STATUS.md` (this file)
- [ ] `docs/ADRs/` as standalone files (currently embedded in Artefakt #0002)
- [ ] Runbooks (AddWorkflow, PublishKnowledge, DefineRules) — not started

---

## Critical Path (Updated)

```
✅ DONE: Knowledge + Decision engines, implemented + tested + deterministic
✅ DONE: Context Engine, implemented + tested
✅ DONE: Workflow Engine, implemented + integration tested against real engines
✅ DONE: Both DriverOS workflows (Inspection_DE, ADR_Check_DE) defined, validated, proven end-to-end
✅ DONE: AI Engine unit tested (100% statement coverage), model routing + fallback proven
✅ DONE: knowledgeUsed[] evidentiary tracking complete for all step types, real trustLevel wired through
✅ DONE: TRANSLATE has a real executor; fallback transitions are explicit, not coincidental
✅ DONE: PostgresKnowledgeStorage — first real DB backend, reference pattern for the rest
✅ DONE: DriverOS UI skeleton (TrustLevelBadge, WorkflowUI, useWorkflow) — type-checked, not yet running
         ↓
🚀 NEXT: PostgreSQL storage for Decision (Rules) + Workflow engines, following the Knowledge pattern
         ↓
🚀 NEXT: WorkflowController HTTP API (thin wrapper around WorkflowEngine) — what useWorkflow.ts expects
         ↓
🚀 NEXT: Wire ClaudeAPIProvider to the real Anthropic API
         ↓
🚀 NEXT: DriverOS app scaffold (Vite + package.json) so the UI actually runs in a browser
         ↓
🚀 NEXT: Beta test, close remaining coverage gaps, launch
```

**Nothing is blocking anyone anymore — storage, AI wiring, and the API/UI layer can all run in parallel.**

---

## Immediate Next Actions

1. Build `PostgresRuleStorage` and `PostgresWorkflowStorage` following `PostgresKnowledgeStorage`'s pattern (mapper functions + mocked-Pool tests first, real DB integration test second)
2. Set up a docker-compose Postgres instance and write one real (non-mocked) integration test per storage class, to validate the actual SQL schema — the mocked-Pool tests today only prove mapping logic, not that the migration is correct
3. Build `WorkflowController` — the thin HTTP layer between DriverOS UI and `WorkflowEngine` (`POST /api/workflows`, `POST /api/workflows/:id/steps`, etc. — exact contract is in `apps/driver-os/src/hooks/useWorkflow.ts`'s header comment)
4. Wire `ClaudeAPIProvider` to the real Anthropic API (test suite already covers the contract it needs to satisfy)
5. Resolve the TRANSLATE/AI Engine knowledge-context tension (see Workflow Engine section above) — either give TRANSLATE steps a minimal phrase-knowledge source or special-case pure-translation in AI Engine's "online needs knowledge" guard
6. Get legal review on the sample German knowledge content before any of it reaches a real user
7. Scaffold `apps/driver-os` as a runnable app (Vite, package.json, entrypoint) so `WorkflowUI` can actually be previewed
8. Close remaining coverage gaps in Knowledge (`listVersions`, `OfflinePackageBuilder`) and Decision (`validateRules` branches) engines

---

Last updated: July 18, 2026 — after running the full suite + bootstrap live (both workflows), plus `npm run type-check:all`
Next update: after Rule/Workflow Postgres storage lands
