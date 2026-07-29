# Guardian Engine — Startup Checklist

**Executable plan. Do this in order. Do not skip.**

---

## Pre-Launch (Today)

### ✅ Phase 0: Architecture Sign-Off

- [ ] Read Artefakt #0001 (Constitution)
- [ ] Read Engineering Handbook
- [ ] Read Artefakt #0002 (Domain Model)
- [ ] Understand the five bounded contexts
- [ ] Agree on Architecture Rules (from `README.md`)
- [ ] **Decision:** Is this the right direction? (Yes → continue)

**Time:** 2-3 hours  
**Owner:** Tech Lead + Product

---

## Week 1: Foundation

### ✅ Day 1-2: Shared Types & Ports

**Goal:** Compile-time safety for all types + port contracts

```bash
# Structure is ready, implement types
cd shared/types/
# Review: index.ts has all value objects, IDs, enums
# Check: CountryCode, LanguageCode, TrustLevel, etc.
```

**Checklist:**
- [ ] `shared/types/index.ts` complete
- [ ] All branded ID types (KnowledgeId, VersionId, etc.)
- [ ] All enums (TrustLevel, StepKind, Capability, etc.)
- [ ] Validation helpers (isValidCountryCode, etc.)
- [ ] Compile test: `npm run type-check` passes

```bash
cd core/
# Review: index.ports.ts has all port definitions
# Check: IKnowledgePort, IDecisionPort, etc.
```

- [ ] `core/index.ports.ts` complete
- [ ] All five engine ports defined
- [ ] All snapshots + interfaces
- [ ] Compile test: `npm run type-check` passes

**Time:** 4-6 hours  
**Owner:** One architect

### ✅ Day 3-4: Knowledge Engine

**Goal:** Versioned, immutable knowledge storage

```bash
cd core/knowledge/
# Build KnowledgeEngine with:
```

**Checklist:**
- [ ] KnowledgeVersion entity (immutable)
- [ ] KnowledgeEntry aggregate (version container)
- [ ] KnowledgeEngine implements IKnowledgePort
- [ ] KnowledgeEngine.getKnowledgeEntry()
- [ ] KnowledgeEngine.searchKnowledge()
- [ ] KnowledgeEngine.getEmergencyCard() — TIER_0
- [ ] KnowledgePublisher.publishVersion() — versioning logic
- [ ] OfflinePackageBuilder (delta packaging)
- [ ] Unit tests: 100% coverage
  - [ ] Version immutability
  - [ ] Superseding logic
  - [ ] Trust level calculation (VERIFIED vs STALE)
  - [ ] Emergency card retrieval

**Integration:** Create mock storage for testing

```typescript
class MockKnowledgeStorage implements IKnowledgeStorage {
  private entries = new Map<KnowledgeId, KnowledgeEntry>();
  async getEntry(id): Promise<...> { return this.entries.get(id) ?? null; }
  // ... implement rest
}
```

**Time:** 6-8 hours  
**Owner:** One backend engineer

### ✅ Day 5: Decision Engine

**Goal:** Deterministic rules, 100% testable

```bash
cd core/decision/
# Build DecisionEngine with:
```

**Checklist:**
- [ ] Rule entity (priority, conditions, outcome)
- [ ] Condition evaluation logic (all operators: eq, neq, in, gt, lt, etc.)
- [ ] DecisionEngine.matchRules() — main function
- [ ] Rule compilation at init (byPriority map)
- [ ] Conflict detection (ties = validation error)
- [ ] RuleBuilder DSL
- [ ] ExampleRules (at least: Inspection_DE, Truck_ADR_DE)
- [ ] Unit tests: 100% coverage
  - [ ] Each operator (eq, neq, in, nin, gt, lt, gte, lte)
  - [ ] Multi-condition AND logic
  - [ ] Priority ordering
  - [ ] Determinism (same input = same output 1000x)
  - [ ] Default fallback

**Test assertion:**
```typescript
const input = { country: "DE", eventType: "ROAD_INSPECTION", ... };
const result1 = await engine.matchRules(input);
const result2 = await engine.matchRules(input);
expect(result1).toEqual(result2); // Always same
```

**Time:** 4-6 hours  
**Owner:** One backend engineer

---

## Week 2: Orchestration Layer

### ✅ Day 1-2: Context Engine

**Goal:** Build situation context (ephemeral, not persisted)

```bash
cd core/context/
```

**Checklist:**
- [ ] ContextEngine.buildContext() — main function
- [ ] Country resolution (GPS + fallback to user profile)
- [ ] User profile lookup
- [ ] Vehicle lookup
- [ ] Connectivity detection
- [ ] SituationContext immutability (frozen snapshot)
- [ ] Unit tests: 80% coverage
  - [ ] GPS → CountryCode
  - [ ] Missing GPS → fallback to homeCountry
  - [ ] User profile merging
  - [ ] Vehicle matching

**Time:** 2-3 hours  
**Owner:** One backend engineer

### ✅ Day 3-5: Workflow Engine (Main Event)

**Goal:** Orchestrate all engines, execute workflows

```bash
cd core/workflow/
```

**Checklist:**
- [ ] WorkflowDefinition structure (steps, entry, offline flag)
- [ ] StepDefinition (all kinds, requires, fallback)
- [ ] WorkflowInstance (state tracking)
- [ ] Incident (final report)
- [ ] WorkflowEngine.startWorkflow()
- [ ] WorkflowEngine.executeStep()
  - [ ] SHOW_KNOWLEDGE executor (calls Knowledge Engine)
  - [ ] COLLECT_INPUT executor
  - [ ] AI_ASSIST executor (calls AI Engine) — defer if AI not ready yet
  - [ ] EMERGENCY_CARD executor
  - [ ] CAPTURE_PHOTO executor
  - [ ] GENERATE_REPORT executor
- [ ] WorkflowEngine.completeWorkflow() — incident generation
- [ ] Knowledge usage tracking (for audits)
- [ ] Step history recording
- [ ] Unit tests: 100% coverage
  - [ ] Happy path: start → step → step → complete
  - [ ] Offline fallbacks
  - [ ] Knowledge tracking
  - [ ] Incident generation
  - [ ] State transitions

**Example workflow to test with:**

```typescript
const exampleWorkflow: WorkflowDefinition = {
  id: "Inspection_DE",
  name: "German Road Inspection",
  version: "1.0.0",
  entryStepId: "step_1",
  offlineCapable: true,
  steps: [
    {
      id: "step_1",
      kind: StepKind.EMERGENCY_CARD,
      title: "Your Rights",
      requires: [],
      next: "step_2"
    },
    {
      id: "step_2",
      kind: StepKind.SHOW_KNOWLEDGE,
      title: "Traffic Law Info",
      requires: [],
      next: "step_3"
    },
    {
      id: "step_3",
      kind: StepKind.CAPTURE_PHOTO,
      title: "Document Evidence",
      requires: [Capability.CAMERA],
      fallback: "step_4",
      next: "step_4"
    },
    {
      id: "step_4",
      kind: StepKind.GENERATE_REPORT,
      title: "Create Report",
      requires: [],
      next: undefined // End
    }
  ]
};
```

**Time:** 8-10 hours  
**Owner:** Two backend engineers (pair programming recommended)

---

## Week 3: AI & Offline

### ✅ Day 1-2: AI Engine

**Goal:** Model routing, cost optimization, assistance service

```bash
cd core/ai/
```

**Checklist:**
- [ ] MODEL_ROUTING (step kind → model)
- [ ] ClaudeAPIProvider (Claude API integration)
- [ ] AIEngine.assist()
- [ ] System prompt builder (guards against hallucination)
- [ ] Trust level marking (always T3 or T4)
- [ ] Source extraction (knowledge referenced)
- [ ] Model cost calculator
- [ ] Batch processor (for offline batch)
- [ ] Unit tests: 80% coverage
  - [ ] Model routing
  - [ ] Prompt building
  - [ ] Response trust level
  - [ ] Fallback behavior (offline)

**Cost validation:**
```typescript
const calculator = new ModelCostCalculator();
const haiku = calculator.estimateCost("haiku", { input: 1000, output: 100 });
const sonnet = calculator.estimateCost("sonnet", { input: 1000, output: 100 });
console.log(`Haiku: $${haiku}, Sonnet: $${sonnet}`); // Should be 5-10x difference
```

**Time:** 4-5 hours  
**Owner:** One backend engineer

### ✅ Day 3-4: Offline Strategy

**Goal:** TIER_0, TIER_1, TIER_2 packages + fallbacks

**Checklist:**
- [ ] OfflinePackageBuilder (already started in Knowledge Engine)
- [ ] TIER_0 package: Emergency cards + contacts (always bundled)
- [ ] TIER_1 package: Country-specific knowledge
- [ ] TIER_2 package: Regional/neighboring knowledge
- [ ] Delta sync logic (only changed versions)
- [ ] Checksum validation (package integrity)
- [ ] Fallback validation rule: every network-requiring step has fallback
- [ ] Integration tests
  - [ ] Build TIER_0 → verify offline access
  - [ ] Build TIER_1 for DE → verify German knowledge
  - [ ] Offline workflow: no network available → all fallbacks triggered

**Time:** 3-4 hours  
**Owner:** One backend engineer

### ✅ Day 5: Integration & Testing

**Goal:** All engines working together

**Checklist:**
- [ ] Create integration test harness
- [ ] Test full flow: Decision → Workflow → Knowledge/AI/Context
- [ ] Example scenario: Road Inspection
  1. User triggers inspection
  2. Decision Engine routes to Inspection_DE
  3. Workflow starts
  4. Step 1: Emergency Card (offline)
  5. Step 2: Show knowledge (from Knowledge Engine)
  6. Step 3: AI assist (calls AI Engine)
  7. Step 4: Capture photo
  8. Step 5: Generate report
  9. Incident created with knowledge versions tracked
- [ ] Verify offline flow (disable network, check fallbacks)
- [ ] Run full test suite: `npm test`
- [ ] Coverage report: `npm run test:coverage`

**Time:** 4-6 hours  
**Owner:** QA + Backend

---

## Week 4: First Product (DriverOS)

### ✅ Day 1-2: Define Inspection_DE

**Goal:** Create first real workflow + rules + knowledge

**Checklist:**

**Knowledge:**
- [ ] Publish "Traffic Law — User Rights" (German, T1 VERIFIED)
- [ ] Publish "What to do during inspection" (step-by-step)
- [ ] Publish "ADR requirements for trucks" (T1 OFFICIAL)
- [ ] Create emergency card "Police Stop" (TIER_0)

```typescript
const version = await publisher.publishVersion(
  createKnowledgeId("traffic-rights-de"),
  {
    language: "de",
    content: {
      summary: "Deine Rechte bei Verkehrskontrolle",
      actions: [
        { order: 1, text: "Bleib ruhig", critical: true },
        { order: 2, text: "Zeige gültiges Ausweisdokument" }
      ],
      rights: [
        "Du hast das Recht zu schweigen",
        "Du kannst einen Anwalt anfordern"
      ],
      warnings: ["Versuche nicht zu fliehen", "Lüge nicht"],
      details: "Vollständiger Text...",
      legalRefs: [{ type: "LAW_TEXT", reference: "StVO §63", ... }]
    },
    sources: [{ type: "OFFICIAL_SITE", reference: "https://www.gesetze...", ... }],
    confidence: ConfidenceLevel.OFFICIAL,
    effectiveDate: new Date(),
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    verifiedBy: "admin@guardian.de",
    nextReviewDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  }
);
```

**Rules:**
- [ ] Road Inspection in Germany → Inspection_DE
- [ ] Truck + ADR class → ADR_Check_DE
- [ ] Default fallback → Emergency card

```typescript
await ruleStorage.saveRule(
  RuleBuilder.create(createRuleId("rule-inspection-de"))
    .priority(100)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .thenWorkflow(createWorkflowDefId("Inspection_DE"), "Standard German inspection")
);
```

**Workflow:**
- [ ] Entry: Emergency card
- [ ] Step: Show knowledge (rights)
- [ ] Step: Show knowledge (what to do)
- [ ] Step: Capture photo (fallback: phrase cards)
- [ ] Step: Translate documents (fallback: phrase cards)
- [ ] Step: Generate report

```typescript
const inspectionDE: WorkflowDefinition = {
  id: "Inspection_DE",
  name: "Verkehrskontrolle — Deutschland",
  version: "1.0.0",
  entryStepId: "step_emergency",
  offlineCapable: true,
  steps: [
    {
      id: "step_emergency",
      kind: StepKind.EMERGENCY_CARD,
      title: "Deine Rechte",
      requires: [],
      next: "step_knowledge_rights"
    },
    // ... more steps
  ]
};
```

**Time:** 4-6 hours  
**Owner:** Product Manager + Content Writer

### ✅ Day 3: DriverOS UI Skeleton

**Goal:** Thin UI that renders WorkflowInstance state

```bash
mkdir -p apps/driver-os/src
```

**Checklist:**
- [ ] Create React component for WorkflowUI
  - Input: WorkflowInstanceSnapshot
  - Output: User interactions (step input)
- [ ] Render current step
- [ ] Show knowledge (if SHOW_KNOWLEDGE)
- [ ] Render trust level badge (T1/T2/T3/T4)
- [ ] Next button (execute next step)
- [ ] File upload (for CAPTURE_PHOTO)
- [ ] No business logic — pure rendering

```typescript
// apps/driver-os/src/WorkflowUI.tsx
interface WorkflowUIProps {
  instance: WorkflowInstanceSnapshot;
  result: StepExecutionResult;
  onStepComplete: (input?: Record<string, unknown>) => Promise<void>;
}

export function WorkflowUI({ instance, result, onStepComplete }: WorkflowUIProps) {
  return (
    <div className="workflow-container">
      <header>
        <h1>{result.uiPrompt?.title}</h1>
        {result.uiPrompt?.trustLevel && (
          <TrustLevelBadge level={result.uiPrompt.trustLevel} />
        )}
      </header>
      
      <main>
        {/* Render step content */}
        {renderStepContent(result)}
      </main>
      
      <footer>
        <button onClick={() => onStepComplete()}>Next</button>
      </footer>
    </div>
  );
}
```

**Time:** 2-3 hours  
**Owner:** Frontend engineer

### ✅ Day 4: Integration

**Goal:** DriverOS talks to Workflow Engine

**Checklist:**
- [ ] Create DriverOS Controller (talks to Workflow Engine)
- [ ] startWorkflow() endpoint
- [ ] executeStep() endpoint
- [ ] Test: full user flow
  1. User clicks "Road Inspection"
  2. Decision Engine routes to Inspection_DE
  3. Workflow starts
  4. UI shows emergency card
  5. User clicks next
  6. UI shows knowledge
  7. User clicks next
  8. UI asks for photo
  9. User uploads photo
  10. UI shows report
- [ ] Verify offline mode (disable network)

**Time:** 3-4 hours  
**Owner:** Full stack engineer

### ✅ Day 5: Beta Testing

**Goal:** Real users, real feedback

**Checklist:**
- [ ] Internal test: 5-10 team members
- [ ] Test scenarios:
  - [ ] Happy path (online, all steps)
  - [ ] Offline path (network disabled)
  - [ ] Photo upload + OCR
  - [ ] Report generation
- [ ] Gather feedback
- [ ] Fix critical bugs
- [ ] Document issues for v0.2

**Time:** 4-6 hours  
**Owner:** QA + Product

---

## Week 5: Launch Readiness

### ✅ Day 1-2: Documentation

**Checklist:**
- [ ] README updated (this repo level)
- [ ] API documentation (ports + engines)
- [ ] Architecture Decision Records (ADRs)
- [ ] Runbook: "How to add new workflow"
- [ ] Runbook: "How to publish knowledge"
- [ ] Runbook: "How to define rules"

**Time:** 3-4 hours  
**Owner:** Tech Lead

### ✅ Day 3: Deployment Preparation

**Checklist:**
- [ ] Docker setup (if deploying to server)
- [ ] Environment variables template (.env.example)
- [ ] Database migrations (if using PostgreSQL)
- [ ] Offline package generation script
- [ ] Monitoring setup (error tracking, usage metrics)

**Time:** 2-3 hours  
**Owner:** DevOps

### ✅ Day 4-5: Final Polish & Launch

**Checklist:**
- [ ] All tests passing: `npm test` → 100% pass rate
- [ ] Type checking: `npm run type-check` → Zero errors
- [ ] Lint: `npm run lint` → Zero warnings
- [ ] Coverage: > 80% for core engines
- [ ] Performance: Workflow execution < 500ms per step
- [ ] Offline: TIER_0 loads in < 100ms
- [ ] Security: No secrets in code
- [ ] GDPR: Consent tracking, PII encryption

**Launch command:**
```bash
npm run build
npm run engines:init
npm run offline:build
# Deploy to production
```

**Time:** 2-4 hours  
**Owner:** Tech Lead + DevOps

---

## Success Criteria

### Week 1 End
- [ ] All types compile
- [ ] All ports defined
- [ ] Knowledge Engine working (tests pass)
- [ ] Decision Engine deterministic (1000 test runs same result)

### Week 2 End
- [ ] Workflow Engine orchestrating all engines
- [ ] Context engine building situations
- [ ] Full integration test (Decision → Workflow → Knowledge) passing
- [ ] Offline fallbacks working

### Week 3 End
- [ ] AI Engine routed and costed
- [ ] TIER_0/1/2 offline packages buildable
- [ ] No network required for emergency card

### Week 4 End
- [ ] Inspection_DE workflow complete
- [ ] German knowledge published
- [ ] DriverOS UI showing workflow state
- [ ] Beta testers able to trigger inspection, see steps, complete flow

### Week 5 End
- [ ] All documentation complete
- [ ] DriverOS v0.1 deployed
- [ ] Zero critical bugs
- [ ] Ready for next product (TravelOS)

---

## If You Get Stuck

1. **Compile error?** → Check shared/types (foundation)
2. **Port error?** → Check index.ports.ts (contracts)
3. **Workflow not executing?** → Add console.logs in WorkflowEngine.executeStep()
4. **Tests failing?** → Check test setup, storage mocks
5. **Offline not working?** → Verify OfflinePackageBuilder + fallback chains
6. **AI cost high?** → Reduce model to Haiku, enable caching

---

## Daily Standup Template

```
STANDUP - Day X/35

Completed:
- [ ] Feature/task completed
- [ ] Tests written/passing
- [ ] Code reviewed

In Progress:
- [ ] Feature/task

Blockers:
- None / (list)

Next:
- [ ] Tomorrow's task
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Workflow too complex | Keep steps atomic, test each in isolation |
| AI costs explode | Route to Haiku by default, measure usage |
| Offline packages too large | Use delta sync, compress, estimate < 50MB TIER_0 |
| Knowledge versioning fails | Build comprehensive unit tests for superseding logic |
| Offline fallbacks not working | Validate at build time (every network step needs fallback) |

---

## Go-Live Checklist

- [ ] All engines deployed
- [ ] Offline packages built
- [ ] German knowledge published & verified
- [ ] Inspection_DE rules active
- [ ] DriverOS UI accessible
- [ ] Monitoring + alerts active
- [ ] Team trained on runbooks
- [ ] Communication plan (launch email, docs updated)
- [ ] Support team ready

---

**This is your path to launch. Follow it exactly.**

**Timeline: 5 weeks. Go.**

Last updated: July 2026
