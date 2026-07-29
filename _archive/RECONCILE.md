# Reconcile — co i dlaczego (2026-07-18)

Bazą jest KOD z `guardian-engine.zip` (chat "Co powiesz").
Zweryfikowany na żywo: 76/76 testów (Jest), tsc czysty (core+shared+apps ORAZ driver-os),
scripts/bootstrap-local.ts przechodzi oba workflowy DriverOS end-to-end.

## Odrzucone (tu, w _archive/)
- superseded-ts/    — starsze wersje plików .ts SPRZED finalnych fixów (brak executora
                      TRANSLATE, brak trackingu knowledgeUsed, brak `export` na interfejsach,
                      validateWorkflowDefinition jeszcze wklejony w InspectionDE zamiast wyekstrahowany).
                      Zip ma nowsze wersje wszystkich.
- superseded-config/ — package.json (Vitest/ESM) i tsconfig (Bundler) z WCZEŚNIEJSZEJ konwencji.
                      Zip używa Jest + CommonJS + monorepo workspaces. NIE mieszać.
- GuardianEngineDemo.jsx — samodzielny prototyp React. Zip ma prawdziwe komponenty
                      DriverOS UI (WorkflowUI, TrustLevelBadge, useWorkflow).
- duplikaty -1/-2/-3 — identyczne bit-w-bit, artefakt wielokrotnego pobierania.

## KSIĄŻKA (book/)
Pliki .md governance (Constitution, ADR-y, DECISION_LOG, journal, Roadmap, Index)
+ pełny Artefakt #0002 i Handbook PDF. To osobna warstwa: "living architecture docs".
Zip miał własne README/BUILD_STATUS/PROJECT_MAP/STARTUP_CHECKLIST (o KODZIE) — zostały w korzeniu.

## Partia 4 (AI proxy + providery + postgres) — 2026-07-18
DOŁĄCZONE do repo (nowe, nie było w zipie):
- apps/backend/ai/{contract,handleGenerate,AnthropicUpstream,expressAdapter}.ts + test
  → przepisane z ESM/Vitest na CommonJS/Jest, wpięte w npm test (11 testów).
- core/ai/providers/GuardianBackendProvider.ts
  → przepisany, by implementować ILLMProvider z zipowego AIEngine.ts (nie z "shared/types/ai.js").

ODRZUCONE (tu, superseded-ts/) — mniejsze wersje "odtworzone z pamięci" (ESM/.js),
zastąpione przez PEŁNE, zintegrowane wersje w zipie:
- AIEngine.ts (143 vs 361 w zipie), AIEngine_test.ts
- AnthropicDirectProvider.ts, MockLLMProvider.ts (zip ma ClaudeAPIProvider + MockLLMProvider wbudowane)
- PostgresKnowledgeStorage.ts/_test.ts (181 vs 280), schema.sql (58 vs 75 — zip ma trigger niemutowalności)
- ai_types_ref.ts, knowledge_types_ref.ts, anthropic-responses.ts (fixtures)
- DriverOS_jsx.txt — prototyp
