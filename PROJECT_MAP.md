# Guardian Engine — Project Map

**Complete navigation guide. Start here.**

---

## Reading Order (Foundation First)

### 1. Philosophy & Architecture (Read First)

- [ ] `docs/Artefakt_0001_Constitution.md` — Mission, vision, manifest (Why Guardian Engine exists)
- [ ] `docs/Engineering_Handbook.md` — Development principles, golden rules (How we build)
- [ ] `docs/Artefakt_0002_Domain_Model.md` — Entities, bounded contexts, ADRs (What we build)
- [ ] `README.md` (this repo) — Architecture overview, quick start

**Time:** ~30 minutes. Do not skip.

### 2. Code Structure (Top-Down)

```
guardian-engine/                  # Main repository
├── shared/
│   └── types/                    # START HERE: Fundamental types
│       └── index.ts              # CountryCode, TrustLevel, IDs, etc.
│
├── core/
│   ├── index.ports.ts            # THEN: Port definitions (contracts)
│   ├── knowledge/                # Implement in this order:
│   │   └── KnowledgeEngine.ts     # 1. Knowledge Engine
│   ├── decision/
│   │   └── DecisionEngine.ts      # 2. Decision Engine (rules)
│   ├── context/
│   │   └── ContextEngine.ts       # 3. Context Engine
│   ├── workflow/
│   │   └── WorkflowEngine.ts      # 4. Workflow Engine (orchestrator)
│   └── ai/
│       └── AIEngine.ts            # 5. AI Engine (last)
│
└── apps/
    └── driver-os/                # Only UI lives here (consumes WorkflowEngine)
```

**Build order:** shared/types → ports → Knowledge → Decision → Context → Workflow → AI

---

## File-by-File Guide

### `shared/types/index.ts` — Foundation

**What:** Fundamental types (Country, Language, TrustLevel, IDs)  
**Why:** Used by all engines. Must be immutable.  
**How long:** 1-2 hours  
**Checklist:**
- [ ] CountryCode type + validator
- [ ] LanguageCode type + validator
- [ ] TrustLevel enum (T1-T4)
- [ ] Branded ID types (KnowledgeId, VersionId, etc.)
- [ ] SituationContext interface
- [ ] StructuredContent interface
- [ ] Offline package tier enums

---

### `core/index.ports.ts` — Contracts

**What:** Interface definitions for all five engines  
**Why:** Engines depend on ports, not implementations. Allows swapping.  
**How long:** 2-3 hours  
**Checklist:**
- [ ] IKnowledgePort interface + snapshots
- [ ] IContextPort interface
- [ ] IDecisionPort interface
- [ ] IWorkflowPort interface + snapshots
- [ ] IAIPort interface

**Key rule:** Every engine port is independent. No circular dependencies.

---

### `core/knowledge/KnowledgeEngine.ts` — Source of Truth

**What:** Immutable versioned knowledge storage  
**Why:** We never generate legal knowledge; we store and retrieve verified information  
**How long:** 3-4 hours  
**Checklist:**
- [ ] KnowledgeEntry aggregate (container for versions)
- [ ] KnowledgeVersion (immutable, once published never edited)
- [ ] EmergencyCard (TIER_0, always offline)
- [ ] KnowledgeEngine.getEntry() — retrieve by ID
- [ ] KnowledgeEngine.searchKnowledge() — search by tags
- [ ] KnowledgeEngine.getEmergencyCard() — offline fallback
- [ ] KnowledgePublisher — publish new versions (versioning logic)
- [ ] OfflinePackageBuilder — build TIER_0/1/2 packages
- [ ] Checksum validation for integrity

**Remember:** Knowledge without metadata (source, date, verifier) doesn't exist.

---

### `core/decision/DecisionEngine.ts` — Deterministic Rules

**What:** Rule matching engine. No LLM. No probability.  
**Why:** We need identical input → identical output always (100% testable)  
**How long:** 2-3 hours  
**Checklist:**
- [ ] Rule entity (priority, conditions, outcome)
- [ ] Condition evaluation (eq, neq, in, nin, gt, lt, gte, lte)
- [ ] DecisionEngine.matchRules() — main function
- [ ] Rule compilation at init (byPriority index)
- [ ] Conflict detection (ties = build-time error)
- [ ] RuleBuilder DSL for easier rule creation
- [ ] Example rules (Inspection_DE, truck ADR, etc.)

**Test:** Same input for 1000 times → same output every time.

---

### `core/context/ContextEngine.ts` — Situation Builder

**What:** Build SituationContext on demand from GPS, user profile, vehicle  
**Why:** Context is ephemeral (not persisted), only snapshotted in workflows  
**How long:** 1-2 hours  
**Checklist:**
- [ ] ContextEngine.buildContext() — main function
- [ ] Country resolution (GPS → CountryCode)
- [ ] User profile lookup
- [ ] Vehicle info lookup
- [ ] Immutable snapshot (frozen for workflow)

**Note:** Context is built once at workflow start and frozen. Never changes mid-workflow.

---

### `core/workflow/WorkflowEngine.ts` — Orchestrator

**What:** Coordinates all other engines. Executes workflows step by step.  
**Why:** Every user journey is a workflow. Every problem is solved through workflows.  
**How long:** 4-5 hours (most complex)  
**Checklist:**
- [ ] WorkflowDefinition (static, versioned structure)
- [ ] StepDefinition (atomic units: SHOW_KNOWLEDGE, COLLECT_INPUT, etc.)
- [ ] WorkflowInstance (runtime state)
- [ ] Incident (final report with knowledge used)
- [ ] WorkflowEngine.startWorkflow() — initialization
- [ ] WorkflowEngine.executeStep() — step-by-step execution
- [ ] Step executors (one per step type)
  - [ ] executeShowKnowledge — calls Knowledge Engine
  - [ ] executeCollectInput — stores user input
  - [ ] executeAIAssist — calls AI Engine with context
  - [ ] executeEmergencyCard — offline emergency info
  - [ ] executeCapturePhoto — photo attachment
  - [ ] executeGenerateReport — final report
- [ ] WorkflowEngine.completeWorkflow() — generate incident
- [ ] Knowledge usage tracking (for audits + evidence)

**Critical:** Every workflow step requiring network must have a `fallback`.

---

### `core/ai/AIEngine.ts` — Assistance Service

**What:** AI assistance with model routing and cost optimization  
**Why:** AI assists (explains), never decides. Always marks as T3_AI_ASSISTED or T4_FALLBACK  
**How long:** 2-3 hours  
**Checklist:**
- [ ] AIEngine.assist() — main function
- [ ] Model routing (Haiku for 80%, Sonnet for reasoning)
- [ ] ClaudeAPIProvider (Claude API integration)
- [ ] Prompt building (system + user)
- [ ] Context enforcement (AI never gets raw prompt)
- [ ] Trust level marking (always T3 or T4)
- [ ] Token usage tracking (for billing)
- [ ] Batch processing helper (50% cost reduction)
- [ ] Prompt caching helper (90% input savings)
- [ ] Cost calculator

**Remember:** If Knowledge Engine has answer → return Knowledge. Only use AI if needed.

---

## Development Workflow

### Phase 1: Core Implementation (1-2 weeks)

1. **Implement shared/types** — All fundamental types
2. **Define core/index.ports** — All port interfaces
3. **Build Knowledge Engine** — Storage, versioning, TIER_0
4. **Build Decision Engine** — Rules, compilation, validation
5. **Build Context Engine** — Simple, just builds context
6. **Build Workflow Engine** — The orchestrator
7. **Build AI Engine** — Model routing, prompting
8. **Write tests** — 100% for Decision/Workflow

### Phase 2: Offline Strategy (1 week)

1. Build offline package system
2. Implement delta sync protocol
3. Test offline workflows (all TIER_0 scenarios)
4. Test fallback chains

### Phase 3: First Product (DriverOS) (2 weeks)

1. Define `Inspection_DE` workflow
2. Publish German traffic law knowledge
3. Create inspection rules
4. Build DriverOS UI (thin, just renders state)

### Phase 4: Scaling (Ongoing)

1. Add TravelOS workflows
2. Add FleetOS features
3. Build knowledge pipeline (§8 — feedback loop)
4. Optimize costs

---

## Code Architecture Principles

### Dependency Direction

```
       UI (DriverOS)
         ▼
    Workflow Engine  ← ports from all others
    ▲   ▲   ▲   ▲
    │   │   │   └── AI Engine
    │   │   └────── Decision Engine
    │   └────────── Context Engine
    └────────────── Knowledge Engine
```

**Rule:** Dependencies point inward. Knowledge Engine knows nothing about others.

### Testing Strategy

```
Decision Engine       → 100% coverage (deterministic)
Workflow Engine       → 100% coverage (happy + edge cases)
Knowledge Engine      → Confidence (data-heavy)
Context Engine        → Confidence (mostly external lookups)
AI Engine             → Confidence (mocked LLM)
DriverOS (UI)         → Visual regression + key paths
```

### Storage Abstraction

Every engine defines its own storage interface:

```typescript
interface IKnowledgeStorage {
  getEntry(id: KnowledgeId): Promise<KnowledgeEntry | null>;
  // ...
}

interface IRuleStorage {
  getRule(id: RuleId): Promise<Rule | null>;
  // ...
}
```

**Why:** Swap implementations. IndexedDB for client, PostgreSQL for server.

---

## Configuration & Environment

### `.env.example`

```env
# Claude API
ANTHROPIC_API_KEY=your_key_here
ANTHROPIC_MODEL_HAIKU=claude-haiku-4-5-20250905
ANTHROPIC_MODEL_SONNET=claude-sonnet-4-6
ANTHROPIC_MODEL_OPUS=claude-opus-4-8

# Storage
DB_HOST=localhost
DB_PORT=5432
DB_NAME=guardian_engine

# Offline
TIER_0_UPDATE_DAYS=1
TIER_1_UPDATE_DAYS=7
TIER_2_UPDATE_DAYS=30

# Feature flags
ENABLE_AI_ASSIST=true
ENABLE_BATCH_PROCESSING=true
ENABLE_PROMPT_CACHING=true
```

---

## Scripts & Commands

### Build

```bash
npm run build              # TypeScript compile
npm run watch             # Watch mode
npm run type-check        # Type checking only
```

### Test

```bash
npm test                  # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
```

### Initialize

```bash
npm run engines:init     # Initialize all engines (compile rules, validate)
npm run knowledge:publish # Publish knowledge version
npm run rules:validate    # Validate rule set
npm run offline:build     # Build offline packages
```

---

## Key Decisions (Why This Way?)

### ADR-001: Graph not Pipeline

**Question:** Should engines chain linearly (Knowledge → Context → Decision → Workflow → AI)?  
**Answer:** No. Workflow Engine queries Knowledge/Context/Decision multiple times in a single workflow.

**Implication:** Engines are independent services. Workflow orchestrates.

### ADR-002: Versioned not Immutable

**Question:** Is knowledge immutable or just versioned?  
**Answer:** Versions are immutable. Knowledge entries are versioned containers.

**Implication:** Old incidents still show which version of law was applied. Evidence-proof.

### ADR-003: Trust Ladder

**Question:** What if we don't have verified knowledge for user's situation?  
**Answer:** Explicit trust levels: T1 (verified) → T2 (stale) → T3 (AI-assisted) → T4 (fallback).

**Implication:** UI always marks source. User knows what's legal vs. AI.

---

## Common Pitfalls (Don't Do This)

❌ **Don't** put business logic in DriverOS UI  
❌ **Don't** generate knowledge — only store verified  
❌ **Don't** have AI make decisions (only explain)  
❌ **Don't** design features before workflows  
❌ **Don't** make workflow steps too complex (keep atomic)  
❌ **Don't** skip offline fallbacks (validation at build time)  
❌ **Don't** mix engine implementations (dependency injection only)  
❌ **Don't** release undocumented code (docs = mandatory)

---

## Timeline

- **Week 1:** Core types + ports + Knowledge Engine
- **Week 2:** Decision + Context + Workflow Engine
- **Week 3:** AI Engine + offline strategy
- **Week 4:** Inspection_DE workflow + rules
- **Week 5:** DriverOS UI
- **Week 6:** Testing + optimization
- **Week 7:** Launch DriverOS v0.1

---

## Next Steps (From Here)

1. [ ] Create storage implementations (PostgreSQL + IndexedDB)
2. [ ] Implement all five engines
3. [ ] Write comprehensive tests
4. [ ] Build offline package system
5. [ ] Create `Inspection_DE` workflow
6. [ ] Publish German traffic law knowledge
7. [ ] Build DriverOS UI
8. [ ] Beta test with real users
9. [ ] Gather feedback → Artefakt #0003-#0005
10. [ ] Scale to TravelOS

---

## Support & Questions

- Architecture questions → Check ADRs in `docs/`
- Code examples → Look at engine implementations
- Workflow design → Study `Inspection_DE` example
- Rules → See `RuleBuilder` examples
- Testing → Check `*.test.ts` files

---

**This is the Guardian Engine. Build it right, and it lasts 10 years.**

Last updated: July 2026
