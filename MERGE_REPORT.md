# Guardian Engine — Merge Report (scalenie + gotowość DriverOS/TravelOS)

**Data:** 27 lipca 2026
**Wynik:** `npm run verify` ✅ — `tsc --noEmit` 0 błędów · **Jest 132/132** (12 suit) · `arch:check` **0 naruszeń** (49 modułów, 105 zależności).

Trzy rozjeżdżające się snapshoty (`guardian-engine`, `guardian-final`, `fazaab`) scalone w **jedno kanoniczne repo**, które przechodzi bramkę architektury i ma zwalidowane oba produkty.

---

## 1. Co zostało scalone

Bazą jest `guardian-final` (realne silniki + backend AI proxy + `book/` + 87 testów). Wniesiono do niego warstwę platformową z `fazaab`:

| Element | Skąd | Gdzie w scalonym repo |
|---|---|---|
| Typy platformowe (ADR-004…009): workflow/capability/ai/decision-record/product/predicate/ids/trust/context | fazaab `shared/types/` | `shared/platform/` (osobny namespace, bez kolizji z `shared/types`) |
| `WorkflowValidator` (W-01…W-11) | fazaab | `core/workflow/validation/` |
| `StepExecutorRegistry` (fix OCP §8.3) | fazaab | `core/workflow/execution/` |
| Bramka `dependency-cruiser` (fix Z-01) | fazaab | `.dependency-cruiser.js` + skrypt `arch:check` |
| Zmigrowany `Inspection_DE` jako `WorkflowVersion` | fazaab | `apps/driver-os/workflows/InspectionDE.version.ts` |
| Testy platformowe (predicate 12, validator ~19, step 6) | fazaab (ts-node) | **przepisane na Jest**, w `npm test` |

Stary rdzeń (silniki, WorkflowEngine, InspectionDE w starym kształcie) **nietknięty** — 87 testów bez zmian.

---

## 2. Naprawione 5 naruszeń granic (arch-gate przechodzi)

Kanoniczny rdzeń wcześniej **oblewał** własną bramkę. Teraz 0 naruszeń:

- **4× „only-workflow-knows-all-ports"** (silniki importowały barrel `core/index.ports`) → **porty rozbite per kontekst** (`core/<silnik>/ports.ts`), `index.ports.ts` = czysty re-export barrel (importuje go tylko Workflow + testy). Cross-boundary DTO (`KnowledgeVersionSnapshot`, używany przez port AI) przeniesiony do `shared/snapshots.ts`, żeby `core/ai` nie importował `core/knowledge`.
- **1× „apps-only-import-workflow-and-shared"** (`DriverOSRules` importował `RuleBuilder` z silnika Decision) → `Rule`/`Condition`/`RuleBuilder` przeniesione do **`shared/rules.ts`**; apps autoruje reguły bez importu silnika (ADR-009 §7.3.1). Silnik re-eksportuje dla wstecznej zgodności.

Bramka jest teraz w CI-skrypcie: `npm run arch:check`.

---

## 3. R6 — konflikt reguł: warn → twardy błąd

`DecisionEngine.validateRules()` robił tylko `console.warn` (komentarz kłamał „Throws"). Teraz: **dwie reguły o tym samym priorytecie i identycznych warunkach = twardy błąd przy `initialize()`** (Domain Model §4). Różne warunki przy tym samym priorytecie wciąż ostrzegają (pełna analiza semantycznego nakładania to praca na później). Pokryte testem (`RuleConflict.test.ts`).

---

## 4. Gotowość produktowa — DriverOS **i** TravelOS

Dowód ADR-009 („drugi produkt = manifest + paczki, zero linii w `core/`") jako **działający test**, nie aspiracja:

- `apps/driver-os/manifest.ts` — `ProductManifest` DriverOS (capabilities, moduły, branding, feature flags, offline TIER-y, region).
- `apps/travel-os/manifest.ts` — `ProductManifest` TravelOS (węższy: bez OCR, CAMERA jako `restricted`).
- `apps/travel-os/workflows/BorderCrossing.version.ts` — pierwszy workflow TravelOS jako **czyste dane** na tych samych typach platformowych (WorkflowVersion), zero kodu w silnikach.
- `apps/__tests__/product-readiness.test.ts` (5 testów): oba workflowy przechodzą walidator względem capabilities **swojego manifestu**; W-07 poprawnie odrzuca DriverOS bez CAMERA i TravelOS bez TRANSLATION; camerowy workflow DriverOS **nie** waliduje się dla TravelOS (manifesty różnią się realnie).

`arch:check` potwierdza: `apps/travel-os` nie importuje żadnego silnika. Platforma faktycznie uniosła drugi produkt bez dotykania `core/`.

---

## 5. Co ŚWIADOMIE zostało na następną transzę (uczciwie)

To scalenie jest bezpieczne i addytywne — nie przepisywałem wnętrza silników. Pozostaje realna, ale osobna robota:

1. **Jedno źródło prymitywów.** Dziś współistnieją `shared/types` (runtime silników: SemVer jako obiekt, mały `Capability`, `StepKind` bez NOTIFY/WAIT) i `shared/platform` (autorstwo/walidacja: SemVer jako branded-string, pełny `Capability`, pełny `StepKind`). To jest kontrolowana duplikacja w jednym repo — docelowo scalić w jeden zestaw i zmigrować `WorkflowEngine` na `WorkflowVersion`. Nie zrobiłem tego teraz, bo to dotyka 87 testów silników i jest wielogodzinnym refaktorem wysokiego ryzyka — należy mu się osobna transza z tsc-driven migracją.
2. **WorkflowEngine na `WorkflowVersion` + `StepExecutorRegistry`** (dziś rejestr jest wpięty jako warstwa, ale orkiestrator wciąż używa starego `switch`/kształtu).
3. **Offline-first** — `OfflinePackageBuilder`, IndexedDB, delta-sync, TIER_0/1/2 (nadal niezbudowane; największa dziura wartości).
4. **DecisionRecord** — typ jest (`shared/platform/decision-record.ts`), brakuje wpięcia w orkiestrator + test replay (ADR-007).
5. **Evidence Context** (`core/incident/`, ADR-008) i **EmergencyCard → Knowledge** (D-02).
6. **Realny provider AI** za istniejącym backend proxy (kontrakt i guardraile już są).

---

## 6. Jak uruchomić

```bash
npm install
npm run verify        # type-check + jest (132) + arch:check (0 naruszeń)
# osobno:
npm run type-check
npm test
npm run arch:check
```

Struktura kluczowa:
```
shared/platform/     ← typy platformowe (ADR-004…009) + testy
shared/rules.ts      ← Rule/Condition/RuleBuilder (apps autorują bez silnika)
shared/snapshots.ts  ← cross-boundary DTO
core/<silnik>/ports.ts   ← porty per kontekst
core/index.ports.ts      ← barrel (tylko Workflow + testy)
core/workflow/validation/  ← WorkflowValidator (W-01…11)
core/workflow/execution/   ← StepExecutorRegistry
apps/driver-os/manifest.ts + workflows/InspectionDE.version.ts
apps/travel-os/manifest.ts + workflows/BorderCrossing.version.ts   ← dowód platformy
```
