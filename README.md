# Guardian Engine

**A contextual assistance platform for Europe. Never be helpless in unfamiliar law, procedures, or emergency situations.**

---

## Project Philosophy

Guardian Engine is **not a collection of features**. It's a **platform architecture** designed to work for 10 years.

**Core principle:** Context first. Workflow over features. Verified knowledge over AI.

- **Constitution** (Artefakt #0001): Mission, vision, manifest, core principles
- **Engineering Handbook**: Development rules, priorities, golden rules
- **Domain Model** (Artefakt #0002): Encjes, bounded contexts, data flows

This README and all code files are **part of the Guardian Engine Bible**.

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│          GUARDIAN ENGINE PLATFORM                    │
│                                                      │
│  ┌────────────┐   ┌────────────┐   ┌─────────────┐  │
│  │ KNOWLEDGE  │   │  CONTEXT   │   │  DECISION   │  │
│  │  Engine    │   │   Engine   │   │   Engine    │  │
│  └─────┬──────┘   └─────┬──────┘   └──────┬──────┘  │
│        │ port          │ port            │ port     │
│        ▼                ▼                 ▼          │
│  ┌──────────────────────────────────────────────┐   │
│  │       WORKFLOW ENGINE (Orchestrator)        │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │ port                       │
│                   ┌─────▼─────┐                      │
│                   │  AI Engine │ (Service)           │
│                   └───────────┘                      │
└─────────────────────────────────────────────────────┘
         ▼
    DriverOS (UI)
    ↓ future: TravelOS, FleetOS, MotoOS, CamperOS
```

**Key rule:** Engines do not know about each other. Only **Workflow Engine** knows all ports.

---

## Directory Structure

```
guardian-engine/
├── apps/
│   └── driver-os/              # DriverOS product (UI only)
├── core/                       # Guardian Engine cores
│   ├── knowledge/              # KnowledgeEngine + versioning
│   ├── context/                # ContextEngine + SituationContext
│   ├── decision/               # DecisionEngine + rule matching
│   ├── workflow/               # WorkflowEngine + orchestration
│   ├── ai/                     # AIEngine + model routing
│   └── index.ports.ts          # Port definitions (contracts)
├── shared/
│   ├── types/                  # Fundamental types (Country, Language, TrustLevel, etc.)
│   └── storage/                # Storage abstraction
├── packages/                   # (Future) TravelOS, FleetOS, etc.
├── docs/                       # Architectural decisions, guides
└── scripts/                    # Build, deploy, tooling
```

**Rule:** `core/` contains domain logic only. No UI, no framework specifics. `apps/driver-os/` renders WorkflowInstance state — that's it.

---

## Core Components

### 1. Knowledge Engine (`core/knowledge/`)

**Responsibility:** Source of truth. Never generates, only stores verified knowledge.

```typescript
// Get knowledge by country & language
const knowledge = await engine.getKnowledgeEntry(id, "DE", "de");

// Get emergency card (TIER_0, always works offline)
const card = await engine.getEmergencyCard("DE", "de");

// Publish new version (immutable, versioned)
const versionId = await publisher.publishVersion(entryId, {...});
```

**Trust levels (ADR-003):**
- T1 VERIFIED — Current, verified knowledge
- T2 VERIFIED_STALE — Past review date, mark for update
- T3 AI_ASSISTED — AI explanation, not legal
- T4 FALLBACK — Offline: emergency contacts, universal rights

### 2. Decision Engine (`core/decision/`)

**Responsibility:** Deterministic rules. Zero LLM. Zero probability.

```typescript
// Initialize (compile & validate rules at startup)
await engine.initialize();

// Match rules → always same output for same input
const outcome = await engine.matchRules({
  country: "DE",
  eventType: "ROAD_INSPECTION",
  vehicle: { category: "TRUCK" }
});
// → Returns WorkflowDefId or fallback TrustLevel
```

**Property:** Rules are versioned, conflicting rules = build-time error.

### 3. Context Engine (`core/context/`)

**Responsibility:** Build situation context on demand. Not persisted, only snapshotted.

```typescript
const context = await engine.buildContext({
  userId: "...",
  location: { latitude, longitude },
  language: "de"
});
// → Resolved country, user profile, vehicle, connectivity, etc.
```

**Property:** Immutable snapshot frozen for entire workflow instance.

### 4. Workflow Engine (`core/workflow/`)

**Responsibility:** Orchestrate all engines. Every incident is a workflow.

```typescript
// Start workflow
const instance = await engine.startWorkflow({
  userId: "...",
  defId: "Inspection_DE"
});

// Execute step by step
const result = await engine.executeStep(instance.id, userInput);
// → Returns UI prompt, next step, attachments

// Complete workflow → Incident report
const incident = await engine.completeWorkflow(instance.id);
```

**Property:** Workflow steps are atomic (SHOW_KNOWLEDGE, COLLECT_INPUT, AI_ASSIST, OCR, TRANSLATE, CAPTURE_PHOTO, GENERATE_REPORT, EMERGENCY_CARD).

### 5. AI Engine (`core/ai/`)

**Responsibility:** Assist, never decide. Always mark as T3_AI_ASSISTED or T4_FALLBACK.

```typescript
const response = await engine.assist({
  prompt: "How do I respond to this?",
  context: situationContext,
  knowledgeContext: [knowledge1, knowledge2],
  stepKind: StepKind.TRANSLATE,
  modelHint: "haiku"  // Cost optimization
});
// → { content: "...", trustLevel: T3_AI_ASSISTED, usage: {...} }
```

**Model routing (cost optimization):**
- **Haiku** ($1/$5): 80% of tasks (translation, OCR, classification)
- **Sonnet** ($3/$15): Reasoning about legal context
- **Opus** ($5/$25): Offline batch processing only

**Cost tips:**
- Prompt caching: 90% savings on cached input
- Batch API: 50% savings for non-urgent tasks
- Default to cheap: route simple tasks to Haiku

---

## Data Flow Example: Road Inspection (German)

```
1. User: [ROAD_INSPECTION button]
   ↓
2. Context Engine → SituationContext(DE, offline, TRUCK)
   ↓
3. Decision Engine → Rule match → Inspection_DE v1.2
   ↓
4. Workflow Engine starts WorkflowInstance
   step 1: EMERGENCY_CARD    → Show rights offline (TIER_0)
   step 2: SHOW_KNOWLEDGE    → Prawa kierowcy (T1, Knowledge Engine)
   step 3: TRANSLATE         → requires NETWORK
      offline? → fallback: phrase cards from package
   step 4: CAPTURE_PHOTO     → Store attachment
   step 5: GENERATE_REPORT   → Create Incident
   ↓
5. Post incident → Sync, optional anonymization → Knowledge feedback loop
```

**Key property:** AI appears **zero times** unless explicitly needed. This is correct.

---

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize Engines

```typescript
import { KnowledgeEngine } from "core/knowledge/KnowledgeEngine";
import { DecisionEngine } from "core/decision/DecisionEngine";
import { ContextEngine } from "core/context/ContextEngine";
import { WorkflowEngine } from "core/workflow/WorkflowEngine";
import { AIEngine, ClaudeAPIProvider } from "core/ai/AIEngine";

// Create storage implementations (your choice: IndexedDB, PostgreSQL, etc.)
const knowledgeStorage = new YourKnowledgeStorage();
const ruleStorage = new YourRuleStorage();
const workflowStorage = new YourWorkflowStorage();

// Instantiate engines
const knowledge = new KnowledgeEngine(knowledgeStorage);
const decision = new DecisionEngine(ruleStorage);
const context = new ContextEngine(...);
const ai = new AIEngine(new ClaudeAPIProvider(process.env.ANTHROPIC_API_KEY));

// Workflow coordinates all
const workflow = new WorkflowEngine(
  workflowStorage,
  knowledge,
  context,
  decision,
  ai
);

// Initialize (compiles rules, validates)
await decision.initialize();

// Start workflow
const instance = await workflow.startWorkflow({
  userId: "user123",
  defId: "Inspection_DE"
});
```

### 3. Define Workflows

Workflow definitions are **static**, part of build:

```typescript
const inspectionDE: WorkflowDefinition = {
  id: "Inspection_DE",
  name: "German Road Inspection",
  version: "1.0.0",
  entryStepId: "step_emergency",
  offlineCapable: true,
  steps: [
    {
      id: "step_emergency",
      kind: StepKind.EMERGENCY_CARD,
      title: "Your Rights",
      requires: [],
      fallback: undefined,
      next: "step_knowledge"
    },
    {
      id: "step_knowledge",
      kind: StepKind.SHOW_KNOWLEDGE,
      title: "Information",
      requires: [],
      next: "step_translate"
    },
    {
      id: "step_translate",
      kind: StepKind.TRANSLATE,
      title: "Translate Documents",
      requires: [Capability.NETWORK],
      fallback: "step_photo",
      next: "step_photo"
    },
    {
      id: "step_photo",
      kind: StepKind.CAPTURE_PHOTO,
      title: "Document Evidence",
      requires: [Capability.CAMERA],
      next: "step_report"
    },
    {
      id: "step_report",
      kind: StepKind.GENERATE_REPORT,
      title: "Create Report",
      requires: [],
      next: undefined
    }
  ]
};
```

### 4. Define Rules

Rules route contexts to workflows:

```typescript
const rules = [
  RuleBuilder.create(createRuleId("rule-inspection-de"))
    .priority(100)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .when("vehicle.category", "eq", "TRUCK")
    .thenWorkflow(createWorkflowDefId("Inspection_DE"), "Professional truck inspection"),

  RuleBuilder.create(createRuleId("rule-inspection-de-car"))
    .priority(99)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .thenWorkflow(createWorkflowDefId("Inspection_DE"), "Standard inspection")
];

// Save rules
for (const rule of rules) {
  await ruleStorage.saveRule(rule);
}

// Compile at engine init
await decision.initialize();
```

### 5. Publish Knowledge

Knowledge is never auto-generated:

```typescript
const publisher = new KnowledgePublisher(knowledgeStorage);

const versionId = await publisher.publishVersion(
  createKnowledgeId("traffic-law-de-rights"),
  {
    language: "de",
    content: {
      summary: "Deine Rechte bei Verkehrskontrolle",
      actions: [
        { order: 1, text: "Bleib ruhig", critical: true },
        { order: 2, text: "Zeige Dokumente", critical: true }
      ],
      rights: [
        "Du hast das Recht zu schweigen",
        "Du kannst einen Anwalt anfordern"
      ],
      warnings: ["Versuche nicht zu fliehen"],
      details: "Vollständiger juristischer Text...",
      legalRefs: [
        {
          type: "LAW_TEXT",
          reference: "StVO §63",
          retrievedAt: new Date()
        }
      ]
    },
    sources: [{
      type: "OFFICIAL_SITE",
      reference: "https://www.gesetze-im-internet.de/stvo/",
      retrievedAt: new Date()
    }],
    confidence: ConfidenceLevel.OFFICIAL,
    effectiveDate: new Date(),
    validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    verifiedBy: "admin@guardian.de",
    nextReviewDue: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
  }
);
```

---

## Testing Philosophy

**100% coverage for:**
- Business Rules (Decision Engine)
- Decision Engine (deterministic, no randomness)
- Workflow Engine (happy paths + edge cases)

**Confidence-based for:**
- UI (DriverOS)
- Integration with external APIs

```typescript
describe("DecisionEngine", () => {
  it("German truck inspection → Inspection_DE", async () => {
    const outcome = await engine.matchRules({
      country: "DE",
      vehicle: { category: "TRUCK" },
      eventType: "ROAD_INSPECTION"
    });
    expect(outcome.workflowDefId).toBe("Inspection_DE");
  });

  it("Same input → same output (determinism)", async () => {
    const input = {...};
    const result1 = await engine.matchRules(input);
    const result2 = await engine.matchRules(input);
    expect(result1).toEqual(result2);
  });
});
```

---

## Offline Strategy

**TIER_0:** Emergency cards + contacts. Always bundled, never optional.
**TIER_1:** Critical workflows + country-specific knowledge.
**TIER_2:** Neighboring countries + planned route.

Every workflow step that requires network **must** have a `fallback` step. Validated at build time.

---

## Cost Optimization (AI)

1. **Route by complexity:** Haiku for most, Sonnet for reasoning
2. **Prompt caching:** Freeze Knowledge context, 90% input savings
3. **Batch processing:** Non-urgent AI tasks processed overnight at 50% discount
4. **Model swapping:** AI is an adapter behind a port — change model in one place

**Current estimate:** €0.001 per user per workflow (Haiku routing + caching).

---

## Next Artifacts

- **Artefakt #0003** – Workflow Definition Spec: JSON/DSL, validator, offline rules
- **Artefakt #0004** – Knowledge Pipeline: verification, roles, editorial tools
- **Artefakt #0005** – Offline Sync Protocol: delta sync, checksums, TIER strategy

---

## Development Rules

From Engineering Handbook:

1. **Small files, small classes.** Pure functions. Dependency Injection.
2. **Business logic never in UI.** React components stay thin.
3. **Test business rules 100%.** Decision Engine especially.
4. **No undocumented module in production.** Each core has README + ADRs + examples.
5. **Prefer composition over inheritance.**
6. **Measure first, optimize later.** No premature optimization.

---

## Key Principles (Never Compromise)

✅ **Context first** — Understand before answering  
✅ **Workflow over features** — Everything is a workflow  
✅ **Offline first** — Critical paths work without network  
✅ **Verified knowledge first** — AI extends, never replaces  
✅ **Privacy by design** — Minimum data, encrypted, GDPR-ready  
✅ **Deterministic decisions** — Same input = same output, always  
✅ **Every incident becomes knowledge** — Feedback loop after anonimization

---

## Support

Questions? Check:
- `docs/` — Architecture Decision Records (ADRs)
- `core/*/README.md` — Per-engine guides
- The Constitution (Artefakt #0001)
- Engineering Handbook v0.1

This is the Guardian Engine Bible. Build with respect for its principles.

---

**Last updated:** July 2026  
**Maintained by:** Guardian Engine Core Team  
**Status:** Production Ready v0.1
