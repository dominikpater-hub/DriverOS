# Guardian Engine — Plan realizacji v2 (po M1)

**Data:** 29 lipca 2026
**Stan (zweryfikowany):** `main` na GitHubie (`dominikpater-hub/DriverOS`), `npm run verify` zielony — `tsc` 0 · Jest 139/139 · `arch:check` 0 · bootstrap oba workflowy end-to-end. Vercel: zielony placeholder (nie produkt).

Ten plan zastępuje v1 tam, gdzie się różni. Największa zmiana vs v1: **UI (Franek) awansuje do osobnego, priorytetowego milestone'u** — masz dowiedziony prototyp i uwagi do niego, więc przerabiamy go w źródło (cienki klient nad `core/`), a nie budujemy UI od zera na końcu.

---

## 0. Gdzie jesteśmy naprawdę

**Zrobione (M1 — kompletne):**
- Scalone 3 snapshoty w jedno repo platformy; arch-gate przechodzi.
- Prymitywy 6/6 ujednolicone (`shared/types` = jedno źródło, `shared/platform` re-eksportuje + trzyma agregaty).
- 1.3 — workflowy autorowane wyłącznie jako `WorkflowVersion`, kompilowane do runtime.
- 1.4 — rejestr executorów zamiast `switch(kind)`.
- DriverOS + TravelOS: manifesty + zwalidowane WorkflowVersion (dowód ADR-009).
- R6 (twardy błąd konfliktu reguł), backend AI proxy z guardrailami (kontrakt), Postgres dla Knowledge.

**Dwa równoległe światy, które trzeba spiąć:**
1. **Platforma** (`core/` TS) — realne silniki, testy, ale silnik wykonuje skompilowany runtime; executory `SHOW_KNOWLEDGE`/`AI_ASSIST`/`TRANSLATE` używają portów, ale AI provider to mock, storage in-memory, offline niezbudowany.
2. **Franek** (prototyp React `driveros-adr/`) — dowiedziony UX asystenta w trasie (drabina zaufania w UI, czat groundowany, tłumacz, raport dowodowy, degradacja T4 offline, GPS za zgodą — poprawki z tej sesji), ale wciąż z **własnymi silnikami in-memory w JSX**. To jest to, co użytkownik widzi — i to trzeba przesadzić na `core/`.

---

## 1. Mapa milestone'ów (co zostało)

| Milestone | Zawiera | Można równolegle? |
|---|---|---|
| **M2 — Pełny silnik** | Faza 2: executory na portach, DecisionRecord+replay, Evidence Context, EmergencyCard→Knowledge | rdzeń, blokuje M5 częściowo |
| **M3 — Offline-first** | Tor A: IndexedDB, Postgres (Decision/Workflow), OfflinePackageBuilder, delta-sync | równolegle po M2 start |
| **M4 — AI produkcyjne** | Tor B: ResponseValidator, testy kontraktowe, realny provider za proxy | równolegle; **odblokowuje realny deploy Vercel** |
| **M5 — Franek: UI jako źródło** | Przerobienie prototypu w cienki klient nad `core/`; Franek jako twarz asystenta | start po M2 (executory zwracają renderowalny stan) |
| **M6 — Launch DriverOS v0.1** | pokrycie, PackageBuilder, GDPR, CI, treść PL/DE zweryfikowana prawnie, build+deploy | po M2–M5 |
| **M7 — TravelOS** | drugi produkt = manifest + paczki, zero linii w `core/` | po M6 |

**Ścieżka krytyczna:** M2 → M5 → M6. Tory M3/M4 biegną obok. Tor C (weryfikacja treści prawnej) = proces, przez cały czas.

---

## 2. M2 — Pełny silnik (Faza 2)

| # | Pozycja | Szac. | Ryzyko |
|---|---|---|---|
| 2.1 | Realne executory na portach (dokończenie) | 2 dr | średnie |
| 2.2 | DecisionRecord w orkiestratorze + replay-test (ADR-007) | 2 dr | średnie |
| 2.3 | Evidence Context `core/incident/` (ADR-008) | 3 dr | średnie |
| 2.4 | EmergencyCard → Knowledge (D-02) | 1.5 dr | niskie |
| 2.5 | Pełna analiza nakładania reguł (R6 docelowo) | 2 dr | średnie |

**2.1** — executory już wołają porty (SHOW_KNOWLEDGE→Knowledge, AI_ASSIST/TRANSLATE→AI), respektują offline/fallback. Dokończyć: `OCR`, `DECISION_POINT` (guard-driven, `evaluatePredicate`), `CAPTURE_PHOTO` edge-cases, `CapabilityProbe` przed krokiem. Kryterium: każdy StepKind ma executor + test (happy/offline/brak capability). **Uwaga:** to naturalne miejsce, by wpiąć bogate executory do wspólnego wzorca — dziś są metodami silnika za rejestrem (1.4), docelowo osobne pliki.

**2.2** — Workflow Engine tworzy `DecisionRecord` po każdym `matchRules()` (typ już w `shared/platform`). Append-only. **Replay-test:** ten sam `contextSnapshot` + te same wersje reguł → identyczny output (dopisać do suite determinizmu). Kryterium: audytowalność „dlaczego pokazaliśmy X".

**2.3** — `core/incident/` (Evidence): `Incident` niemutowalny, budowany ze zdarzenia `WorkflowCompleted`, kopia (contextSnapshot, knowledgeUsed, trustLevels, decisionIds). Inwariant: **ABANDONED też rodzi Incident**. GDPR: anonimizacja + retencja tu mieszkają. Wymaga aktualizacji Artefaktu #0002 §5.

**2.4** — `EmergencyCard` = `KnowledgeEntry(domain=EMERGENCY, offlineTier=TIER_0) + contacts`. Karty praw zyskują historię dowodową. −1 agregat.

**2.5** — dziś twardy błąd tylko na identyczne warunki przy tym samym priorytecie; docelowo wykrycie semantycznego nakładania różnych warunków.

**Bramka M2:** `npm run verify` zielony + nowe testy Evidence/DecisionRecord; bootstrap dalej przechodzi.

---

## 3. M5 — Franek: UI jako źródło (priorytet — przeróbka prototypu)

**Cel:** prototyp React (Franek / `driveros-adr`) staje się **realnym klientem DriverOS**, konsumującym `core/` przez `IWorkflowPort` — zgodnie z Domain Model §10 („apps tylko renderuje stan `WorkflowInstance`"). Koniec silników w JSX. Zachowujemy dowiedziony UX i poprawki z tej sesji (drabina zaufania w UI, czat groundowany, tłumacz z degradacją T4 offline, GPS za zgodą, uczciwe copy dowodu).

**Kim jest Franek (decyzje do potwierdzenia, ale robocze założenia):**
- **Franek = twarz asystenta** — warstwa persony/rozmowy nad workflowami, nie drugi ośrodek decyzji. Persony (Tacho/Inspector/Mentor/Risk) = **workflowy/tryby**, nie osobne byty (decyzja z pierwszej sesji). Franek *tłumaczy i prowadzi*, nie *liczy i nie decyduje* — liczenie/decyzje zostają w Decision Engine (deterministycznie).
- **Guardian Engine** niewidoczny userowi; user „gada z Frankiem", programista pracuje na DriverOS/core.
- Ekran główny (OS/„Dzisiaj") jako launcher; asysta (kontrola/wypadek) i „Zapytaj" to moduły. Uwaga strategiczna: atrapa licznika czasu jazdy na ekranie głównym to commodity — nie eksponować jej ponad realny wyróżnik (asysta).

| # | Pozycja | Szac. | Ryzyko |
|---|---|---|---|
| 5.0 | Wciągnąć prototyp do monorepo jako `apps/driver-os/ui` (Vite build) | 1 dr | niskie |
| 5.1 | Warstwa kontroler/hooki: UI ↔ `IWorkflowPort` (`useWorkflow`, `useOffline`) | 2 dr | średnie |
| 5.2 | Wygasić inline'owe silniki w JSX; ekrany renderują `StepExecutionResult` | 3 dr | średnie |
| 5.3 | Franek jako warstwa persony (rozmowa/ton/awatar) nad workflowami; czat przez AI Engine (grounding, T3/T4) | 3 dr | średnie |
| 5.4 | `TrustLevelBadge`/`WorkflowUI` na realnym stanie (szkielety są w `apps/driver-os/src`) | 2 dr | niskie |
| 5.5 | Zebrać „uwagi do UI" w backlog i wdrożyć te dotyczące Franka | 2 dr | zależne |

**Kryteria akceptacji:** UI bez logiki biznesowej (`arch:check`: `apps/driver-os/ui` importuje tylko Workflow + shared); oba workflowy (kontrola, wypadek) klikalne end-to-end na realnym silniku; drabina zaufania i offline działają z `core/`, nie z atrap w JSX; czat Franka nie wymyśla (grounding), degraduje do T4 offline.
**Zależności:** M2 (executory zwracają renderowalny stan). Może startować od 5.0/5.1 równolegle z końcówką M2.
**Efekt uboczny:** gdy UI jest realnym buildem → **zastępuje placeholder na Vercelu** (patrz M4/deploy).

> **Potrzebne od Ciebie:** plik „uwagi do UI / Franka", jeśli istnieje osobno — wtedy 5.5 dostaje konkretny backlog zamiast moich założeń. Bez niego pracuję na uwagach z pierwszej sesji (Franek = twarz, persony = workflowy, „co mam teraz zrobić", trust ladder widoczny).

---

## 4. Tory równoległe

### Tor A — Offline-first (M3)
IndexedDB storage (klient) + Postgres dla Decision/Workflow + `OfflinePackageBuilder` (TIER_0/1/2, checksumy) + delta-sync + `WorkflowPackageBuilder`. Test „krytyczny workflow działa w pełni offline" (wymuś `CapabilityProbe→UNAVAILABLE(NETWORK)`, asertuj dokładny `fallbackStepId`). **To najsztandarowsza niezbudowana zasada.**

### Tor B — AI produkcyjne (M4)
`ResponseValidator` 100% (cited⊆allowed, brak zmyślonych sygnatur) → testy kontraktowe na mocku zgodnym z kontraktem → realny `ClaudeAPIProvider` za istniejącym proxy (klucz tylko w backendzie) → routing modelu + budżety. **Wdrożenie proxy jako funkcja serverless na Vercelu = pierwszy użyteczny deploy** (zastępuje placeholder po stronie API).

### Tor C — Weryfikacja treści prawnej (proces)
Żadna treść (PL/DE) nie idzie do kierowcy bez ludzkiej weryfikacji prawnej. Bramka `knowledge:publish` odmawia bez `source`+`verifiedBy`. Gate przed launchem.

---

## 5. Deploy (Vercel) — ścieżka od placeholdera do produktu

Dziś: placeholder (`vercel.json` + `public/`), zielony. Kolejno:
1. **API:** backend AI proxy (Tor B) jako Vercel serverless → realny endpoint `/ai/generate`.
2. **UI:** Franek build (M5) → statyczny/edge build DriverOS → zastępuje placeholder jako główna apka.
3. **Higiena:** `main` zawsze zielony (`verify` w CI jako required check) — Vercel auto-deployuje z `main`.

---

## 6. Kolejność zbiorcza + kamienie milowe

| Milestone | Kryterium wyjścia |
|---|---|
| **M2** | executory na portach + DecisionRecord+replay + Evidence Context; `verify` zielony |
| **M5 (start równolegle)** | Franek w monorepo, konsumuje `core/` przez `IWorkflowPort`; koniec silników w JSX |
| **M3** | krytyczny workflow w pełni offline; paczki TIER_0/1; delta-sync |
| **M4** | realny provider za proxy; ResponseValidator 100%; fallback T4 gwarantowany; proxy na Vercelu |
| **M6** | DriverOS v0.1: Franek nad `core/`, offline działa, AI za proxy, treść zweryfikowana, CI zielony, deploy |
| **M7** | TravelOS: manifest + paczki, zero linii w `core/` |

**Szacunek (1 os + AI):** M2 ≈ 10 dr · M5 ≈ 11 dr (nakłada się częściowo z M2) · M3 ≈ 12 dr · M4 ≈ 7 dr · M6 ≈ 8 dr. Tory równoległe skracają kalendarz. Liczby = rząd wielkości.

---

## 7. Zasady przekrojowe (bez zmian z v1)
Bramka `npm run verify` po każdej pozycji · granice = build (dependency-cruiser) · wszystko niemutowalne wersjonowane · AI nigdy źródłem prawdy (T3/T4 z typu) · Privacy by Design jako inwariant · aktualizacje Biblii (#0002 §5, ADR-004…009) przy zmianach modelu · treść prawna tylko po ludzkiej weryfikacji.

---

## 8. Najbliższy krok proponowany
**M2.1–2.3** (dokończenie executorów → DecisionRecord+replay → Evidence Context), bo to odblokowuje M5 (Franek dostaje realny, renderowalny stan + dowodowość). Równolegle mogę zacząć **M5.0** (wciągnięcie prototypu Franka do monorepo jako build), żeby UI od razu żyło obok `core/`.

---

## Postęp M2 (ta sesja)

- [x] **2.2 DecisionRecord + audyt replay** (ADR-007) — append-only log, rekord po każdym matchRules (też T4), replay deterministyczny.
- [x] **2.3 Evidence Context** `core/incident/` (ADR-008) — niemutowalny Incident, ABANDONED też seala, link do DecisionRecordów, anonimizacja; wpięty opcjonalnie w `WorkflowEngine.completeWorkflow`.
- [x] **2.1 (część) — guarded transitions + DECISION_POINT** — deterministyczne routowanie warunkowe (`evaluatePredicate`), kompilator niesie transitions do runtime; liniowe workflowy bez zmian; test rozgałęzienia.
- [x] **2.1 (reszta) — executor OCR + `CapabilityProbe`** — OCR przez port AI (T3/T4, nigdy verified); probe deklarowanych capability przed krokiem (ADR-006), brak capability → deklarowany fallback (Offline First). Additive/opcjonalne. +4 testy.
- [ ] **2.4 EmergencyCard → Knowledge (D-02)** — refaktor `KnowledgeEngine` (ryzyko), osobna transza.
- [ ] **2.5 pełna analiza nakładania reguł** — osobna transza.

**M2.1 domknięte.** Każdy StepKind ma executor (SHOW_KNOWLEDGE, COLLECT_INPUT, AI_ASSIST, EMERGENCY_CARD, CAPTURE_PHOTO, TRANSLATE, OCR, GENERATE_REPORT, DECISION_POINT). NOTIFY/WAIT — świadomie bez executora (brak workflowa ich używającego; rzucą jasny błąd „register one"). Pozostaje 2.4 i 2.5 (osobne transze).

Stan: `tsc` 0 · **Jest 154/154** · `arch:check` 0 · bootstrap oba workflowy. Na GitHubie (`main`, `ac273e5`).

## Postęp M5 (ta sesja)

- [x] **5.0 Franek w monorepo jako build** — prototyp React (asystent w trasie) wciągnięty jako workspace `@guardian-engine/driver-os-ui` (`apps/driver-os/ui`, Vite + React 19), build zielony (`vite build` → `dist/`, 36 modułów). Powłoka: `App` (router OS), `Dashboard` („Dzisiaj"), `DriverOS` (Franek: kontrola/wypadek, `TrustBadge`), `KnowledgeQA` („Zapytaj"). Motyw `C` wyjęty do `theme.js`. **Szew ADR:** trener (osobna sesja) zastąpiony `adr-trainer.stub.jsx` z dokładną powierzchnią, jakiej importuje powłoka (`default, ALL, MODULES, countDueReviews`) — podmiana jednego pliku wpina realny trener. Workspaces: dodany glob `apps/*/ui`.
- [ ] **5.1 hooki UI ↔ `IWorkflowPort`** (`useWorkflow`, `useOffline`) — następne.
- [ ] **5.2 wygaszenie silników w JSX** (`engine/` → `core/` przez port); wtedy `arch:check` egzekwuje „ui importuje tylko Workflow + shared".
- [ ] **5.3 Franek jako warstwa persony** nad workflowami; czat przez AI Engine (grounding, T3/T4).
- [ ] **5.4 `TrustLevelBadge`/`WorkflowUI` na realnym stanie**.
- [ ] **5.5 backlog „uwagi do UI/Franka"** (czeka na plik od użytkownika; inaczej uwagi z sesji 1).

Uwaga: M5.0 NIE konsumuje jeszcze `core/` (ekrany dalej mają własne silniki w JSX — `engine/aiEngine.js`, `engine/retrieval.js`); to jest treść M5.1–5.2. `verify` po M5.0: `tsc` 0 · **Jest 154/154** · `arch:check` 0 (68 modułów, +ui, 0 naruszeń).
