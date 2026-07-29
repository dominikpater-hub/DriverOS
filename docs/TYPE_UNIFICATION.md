# Type Unification — decyzja i mapa (Faza 1 / M1)

**Decyzja (1.1):** kanonicznym domem **prymitywów** jest `shared/types` (zależy od niego 87 testów silników — najniższe ryzyko migracji). `shared/platform` zachowuje swoje **unikalne agregaty platformowe** (WorkflowVersion, StepDefinition-new, PredicateExpression, AIRequest/Response, DecisionRecord, ProductManifest, RetryPolicy, …), ale **przestaje definiować własne kopie prymitywów** — re-eksportuje je z `shared/types`. Adoptujemy przy tym lepsze wybory platformy (branded SemVer, pełne katalogi enumów).

## Mapa prymitywów (overlap → akcja)

| Prymityw | shared/types (było) | shared/platform (było) | Akcja |
|---|---|---|---|
| `StepKind` | 9 członków | 11 (NOTIFY, WAIT) | shared/types → superset (11); platform re-eksport |
| `Capability` | {CAMERA,MICROPHONE,NETWORK,GPS,STORAGE} | pełny (14) | shared/types → superset; platform re-eksport; `STORAGE` zachowany obok `OFFLINE_STORAGE` |
| `TrustLevel` | AI_ASSISTED… (wartości T1_…) | T1_VERIFIED… | shared/types → nazwy `T1_VERIFIED…` (wartości bez zmian); platform re-eksport |
| `SemVer` | `{major,minor,patch}` | branded-string | shared/types → **branded-string** (kanon); helper `parseSemVer`; RuleBuilder ustawia `"1.0.0"` |
| `CountryCode`/`LanguageCode` | string-union | branded-string | **transza 2** (rozjazd union↔branded — osobno) |
| `SituationContext` | Date-based | DateTime-mirror | **transza 2** (spięte z migracją WorkflowEngine 1.3) |

Kroki 1–4 (StepKind, Capability, TrustLevel, SemVer) wykonane w tej sesji z bramką `verify` po każdym. CountryCode/SituationContext + WorkflowEngine (1.3) — kolejna transza.

---

## Status wykonania (ta sesja)

**Zrobione i zweryfikowane** (`npm run verify` zielony po każdym kroku — tsc 0, Jest 132/132, arch 0):

- [x] **StepKind** — superset (11) w `shared/types`; `shared/platform/workflow.ts` re-eksportuje.
- [x] **Capability** — pełny katalog (14 + `STORAGE` jako `@deprecated` alias) w `shared/types`; `shared/platform/capability.ts` re-eksportuje, zachowuje `CapabilityStatus`/`CapabilityProbe`/`isUsable`.
- [x] **TrustLevel** — nazwy członków ujednolicone na `T1_VERIFIED…T4_FALLBACK` (wartości bez zmian) w 9 plikach; `shared/platform/trust.ts` re-eksportuje.
- [x] **SemVer** — kanoniczna forma branded-string w `shared/types` (+ `isSemVer`/`asSemVer`/`parseSemVer`); `RuleBuilder` ustawia `"1.0.0"`; `shared/platform/ids.ts` re-eksportuje.

**Pozostałe w M1 (następna transza, wyższe ryzyko):**

- [ ] **CountryCode** — unify na union `shared/types` (bezpieczne: AT/CH/IT są w unii). **LanguageCode** — uwaga: `LocalizedText = Record<LanguageCode,string>` wymaga `Partial<>` przy przejściu na union, inaczej łamie tytuły kroków.
- [ ] **SituationContext** / **DateTime** — spięte z migracją WorkflowEngine.
- [ ] **1.3 Migracja `WorkflowEngine` na `WorkflowVersion`** (transitions/guards/offline) + przepisanie 9 testów integracyjnych + bootstrap.
- [ ] **1.4 Wpięcie `StepExecutorRegistry`** w orkiestrator (usunięcie `switch(kind)`).

Efekt: duplikacja prymitywów zmniejszona z 6 do 2 obszarów (CountryCode/LanguageCode + SituationContext), a te są już spięte z 1.3 — więc domknięcie M1 = jedna skupiona transza migracji WorkflowEngine.

---

## 1.3 — wykonane (podejście: kompilator, pod ryzyko)

Zamiast przepisywać wnętrze prawnie-krytycznego `WorkflowEngine` (najwyższe ryzyko), wprowadzono most **`compileWorkflowVersion(WorkflowVersion) → runtime WorkflowDefinition`** (`core/workflow/compileWorkflowVersion.ts`).

- Oba shipowane workflowy (`Inspection_DE`, `ADR_Check_DE`) są teraz **autorowane wyłącznie jako `WorkflowVersion`** (platforma: transitions/guards/offline/checksum, walidowane przez `WorkflowValidator`). Ręcznie pisany stary kształt runtime **zniknął** — powstaje z kompilacji.
- Mapowanie: `transitions[default].to → next`, `offline.mode=FALLBACK → fallback`, `requiredCapabilities → requires`, `knowledgeRef → data.knowledgeTags`, `LocalizedText → string`.
- Silnik i 9 testów integracyjnych **bez zmian** — konsumują skompilowany runtime. `knowledgeRef` ujednolicony z tagiem wyszukiwania (spójne z seedem wiedzy).
- Weryfikacja: `tsc` 0, **Jest 132/132**, `arch:check` 0, `bootstrap-local.ts` przechodzi **oba** workflowy end-to-end (Incident z 3 wpisami wiedzy: emergency + rights + adr).

**Pozostaje w M1:** 1.4 (wpięcie `StepExecutorRegistry` zamiast `switch(kind)` — wymaga executorów na portach, styka się z Fazą 2.1) oraz CountryCode/LanguageCode/SituationContext (LanguageCode wymaga `Partial<Record<>>` w `LocalizedText`). Silnik natywnie na `WorkflowVersion` (bez formy runtime) to opcjonalne dalsze zacieśnienie — dziś runtime jest już tylko wyjściem kompilatora, nie drugim autorskim kształtem.
