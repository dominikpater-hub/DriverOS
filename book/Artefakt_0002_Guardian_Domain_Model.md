# To jest Artefakt #0002.

# Guardian Domain Model

**Version 0.1**

Status: Draft do zatwierdzenia
Zależy od: Artefakt #0001 (Constitution), Engineering Handbook v0.1
Decyduje o: strukturze katalogów, schemacie bazy, kontraktach między silnikami

---

## 0. Rozstrzygnięcia otwartych kwestii

Zanim encje — trzy decyzje architektoniczne, które determinują cały model.

### ADR-001: Silniki tworzą graf, nie pipeline

**Kontekst:** Konstytucja rysuje Knowledge → Context → Decision → Workflow → AI → UI jako pionową strzałkę.

**Decyzja:** Silniki są **usługami w grafie zależności**. Workflow Engine jest orkiestratorem i może wielokrotnie odpytywać Knowledge, Context i AI w trakcie jednego incydentu. Strzałka z Konstytucji opisuje *hierarchię zaufania* (co ma pierwszeństwo), nie kolejność wywołań.

**Konsekwencje:** Każdy silnik wystawia interfejs (port). Workflow Engine zależy od portów, nigdy od implementacji. Żaden silnik nie zna Workflow Engine.

### ADR-002: Wiedza jest wersjonowana, nie niemutowalna

**Kontekst:** Brief mówi "Knowledge is immutable", ale przepisy się zmieniają.

**Decyzja:** Niemutowalna jest **KnowledgeVersion** (pojedyncza wersja wpisu). **KnowledgeEntry** jest logicznym kontenerem wersji. Nowa wersja nigdy nie nadpisuje starej — stara dostaje `supersededBy` i `validUntil`.

**Konsekwencje:** Raport z incydentu z 2026 roku zawsze wskazuje wersję przepisu obowiązującą *w momencie incydentu*. To jest wymóg prawny i dowodowy, nie tylko elegancja.

### ADR-003: Ścieżka degradacji odpowiedzi (Trust Ladder)

**Kontekst:** Nie jest zdefiniowane, co się dzieje, gdy nie ma zweryfikowanej wiedzy, a użytkownik stoi przed policjantem.

**Decyzja:** Każda odpowiedź systemu ma jawny poziom zaufania:

| Poziom | Źródło | Prezentacja |
|---|---|---|
| T1 VERIFIED | KnowledgeVersion, ważna, zweryfikowana | Bez zastrzeżeń |
| T2 VERIFIED_STALE | KnowledgeVersion po terminie review | Znacznik "wymaga weryfikacji, stan na [data]" |
| T3 AI_ASSISTED | AI na bazie kontekstu, brak wpisu w Knowledge | Wyraźne oznaczenie "wskazówka AI, nie porada prawna" |
| T4 FALLBACK | Brak wiedzy i AI (offline) | Karta awaryjna: kontakty, konsulat, prawa uniwersalne |

**Konsekwencje:** `trustLevel` jest polem każdej odpowiedzi w systemie. UI ma obowiązek go renderować. Decision Engine decyduje o poziomie — nigdy AI o sobie samym.

---

## 1. Mapa domeny (Bounded Contexts)

Pięć kontekstów. Granice kontekstów = granice pakietów w `core/`.

```
┌─────────────────────────────────────────────────────┐
│                  GUARDIAN ENGINE                     │
│                                                      │
│  ┌────────────┐   ┌────────────┐   ┌─────────────┐  │
│  │ KNOWLEDGE  │   │  CONTEXT   │   │  DECISION   │  │
│  │  (prawda)  │   │ (sytuacja) │   │  (reguły)   │  │
│  └─────┬──────┘   └─────┬──────┘   └──────┬──────┘  │
│        │ port           │ port            │ port     │
│        ▼                ▼                 ▼          │
│  ┌──────────────────────────────────────────────┐   │
│  │        WORKFLOW  (orkiestracja)              │   │
│  └──────────────────────┬───────────────────────┘   │
│                         │ port                       │
│                   ┌─────▼─────┐                      │
│                   │    AI     │ (usługa, nie prawda) │
│                   └───────────┘                      │
└─────────────────────────────────────────────────────┘
```

Reguły zależności:

1. Knowledge, Context, Decision, AI **nie znają się nawzajem**.
2. Tylko Workflow zna wszystkie porty.
3. Produkty (DriverOS) znają tylko Workflow + katalog workflow'ów.
4. UI zna tylko stan WorkflowInstance. Nigdy silniki bezpośrednio.

---

## 2. Encje — Knowledge Context

### KnowledgeEntry (agregat)

Logiczny wpis wiedzy. Kontener wersji.

```
KnowledgeEntry
  id            : KnowledgeId
  domain        : enum (TRAFFIC_LAW, CUSTOMS, EMERGENCY, ADR, CABOTAGE, ...)
  country       : CountryCode        // ISO 3166-1
  scope         : enum (NATIONAL, EU, REGIONAL)
  tags          : Tag[]
  versions      : KnowledgeVersion[] // min. 1
  currentVersion: VersionId          // wyliczane, nie przechowywane ręcznie
```

### KnowledgeVersion (niemutowalna)

```
KnowledgeVersion
  id               : VersionId
  entryId          : KnowledgeId
  language         : LanguageCode
  content          : StructuredContent   // patrz §6
  source           : Source              // wymagane, min. 1
  confidence       : enum (OFFICIAL, VERIFIED, COMMUNITY)
  effectiveDate    : Date                // od kiedy przepis obowiązuje
  validUntil       : Date?               // null = bezterminowo
  verifiedAt       : DateTime
  verifiedBy       : VerifierId
  nextReviewDue    : Date                // po tej dacie → trustLevel T2
  supersededBy     : VersionId?
  checksum         : Hash                // integralność paczki offline
```

**Inwarianty:**
- Wersja bez `source` nie istnieje (Handbook: "Knowledge without metadata does not exist").
- Wersja raz opublikowana nigdy nie jest edytowana. Poprawka = nowa wersja.
- `content` nigdy nie jest generowany przez AI. AI może *proponować* draft, człowiek weryfikuje i publikuje.

### Source (value object)

```
Source
  type        : enum (LAW_TEXT, OFFICIAL_SITE, GOVERNMENT_API, EXPERT)
  reference   : string   // Dz.U., §, URL, sygnatura
  retrievedAt : DateTime
```

### EmergencyCard (agregat)

Specjalizacja wiedzy o najostrzejszym reżimie: **musi działać offline, zawsze, w każdej wersji aplikacji**.

```
EmergencyCard
  id          : CardId
  country     : CountryCode
  type        : enum (POLICE_STOP, ACCIDENT, MEDICAL, CONSULATE, RIGHTS)
  content     : StructuredContent
  contacts    : Contact[]      // 112, konsulat, lokalne numery
  offlineTier : TIER_0         // patrz §7 — zawsze najwyższy priorytet
```

---

## 3. Encje — Context Context

### SituationContext (value object, efemeryczny)

Kontekst **nie jest przechowywany**. Jest budowany na żądanie i wersjonowany snapshotem w incydencie.

```
SituationContext
  timestamp      : DateTime
  location       : GeoPoint?          // null gdy brak zgody/GPS
  resolvedCountry: CountryCode        // z GPS lub deklaracji użytkownika
  language       : LanguageCode
  connectivity   : enum (ONLINE, OFFLINE, DEGRADED)
  userProfile    : UserProfileRef
  vehicle        : VehicleRef?
  activeWorkflow : WorkflowInstanceId?
  incidentState  : IncidentRef?
```

**Inwariant:** AI Engine nigdy nie otrzymuje surowego promptu użytkownika. Otrzymuje `AIRequest = { prompt, SituationContext, KnowledgeVersion[], WorkflowStep, History }`.

### UserProfile / Vehicle

```
UserProfile
  id             : UserId
  type           : enum (PRO_DRIVER, TRAVELER, FLEET_DRIVER, RIDER, CAMPER)
  languages      : LanguageCode[]
  homeCountry    : CountryCode
  consents       : Consent[]        // GDPR: każda zgoda osobno, z datą

Vehicle
  id        : VehicleId
  category  : enum (TRUCK, VAN, CAR, MOTORCYCLE, CAMPER)
  adrClass  : ADRClass?
  plates    : EncryptedString      // dane wrażliwe — szyfrowane lokalnie
```

---

## 4. Encje — Decision Context

### Rule (deterministyczna, wersjonowana jak wiedza)

```
Rule
  id          : RuleId
  priority    : int
  conditions  : Condition[]      // country, workflow, event, vehicle, ...
  outcome     : Outcome          // wskazuje WorkflowDefinition lub trustLevel
  version     : SemVer
```

**Inwarianty:**
- Zero LLM. Zero prawdopodobieństwa. Rule engine musi dawać identyczny wynik dla identycznego wejścia — 100% testowalne (Handbook: Decision Engine 100% coverage).
- Konflikt reguł rozstrzyga `priority`; remis = błąd walidacji przy publikacji reguł, nie w runtime.

---

## 5. Encje — Workflow Context

### WorkflowDefinition (statyczna, część paczki wydania)

```
WorkflowDefinition
  id       : WorkflowDefId       // np. Inspection_DE
  version  : SemVer
  steps    : StepDefinition[]
  entry    : StepId
  offlineCapable : bool          // walidacja: krytyczne muszą = true
```

### StepDefinition

```
StepDefinition
  id          : StepId
  kind        : enum (SHOW_KNOWLEDGE, COLLECT_INPUT, AI_ASSIST,
                      OCR, TRANSLATE, CAPTURE_PHOTO, GENERATE_REPORT,
                      EMERGENCY_CARD, DECISION_POINT)
  requires    : Capability[]     // np. CAMERA, NETWORK, GPS
  fallback    : StepId?          // obowiązkowy, gdy requires zawiera NETWORK
  next        : Transition[]
```

**Inwariant:** krok wymagający sieci **musi** mieć `fallback`. Walidowane przy budowie paczki, nie w runtime. To jest Offline First zamienione w regułę kompilacji.

### WorkflowInstance (agregat, stan użytkownika)

```
WorkflowInstance
  id             : InstanceId
  definitionId   : WorkflowDefId + version
  state          : enum (ACTIVE, SUSPENDED, COMPLETED, ABANDONED)
  currentStep    : StepId
  contextSnapshot: SituationContext     // zamrożony na starcie
  stepHistory    : StepRecord[]
  createdAt / updatedAt
```

### Incident (agregat, dokument dowodowy)

```
Incident
  id              : IncidentId
  workflowInstance: InstanceId
  occurredAt      : DateTime
  location        : GeoPoint?
  country         : CountryCode
  attachments     : Attachment[]        // zdjęcia, OCR, nagrania
  knowledgeUsed   : VersionId[]         // KTÓRE wersje przepisów pokazano
  trustLevels     : TrustLevel[]        // czego użyto: T1? T3?
  report          : Report?
  anonymizedAt    : DateTime?           // → §8, pętla wiedzy
```

**Inwariant:** `knowledgeUsed` jest obowiązkowe. Raport bez wskazania wersji przepisów nie jest dowodem.

---

## 6. StructuredContent — format treści

Treść wiedzy nie jest markdown-blobem. Jest strukturą, żeby workflow mógł renderować "co robić TERAZ":

```
StructuredContent
  summary     : Text            // 1 zdanie: co robić
  actions     : ActionItem[]    // kroki, w kolejności
  rights      : Text[]          // twoje prawa
  warnings    : Text[]          // czego NIE robić
  details     : Text            // pełna treść, dla spokojniejszej chwili
  legalRefs   : Source[]
```

To wprost realizuje UX z Handbooka: pod stresem max 2 tapnięcia, 1 decyzja, 5 sekund do informacji krytycznej. `summary` + `actions[0]` to jest te 5 sekund.

---

## 7. Offline — model paczek

```
OfflinePackage
  country   : CountryCode
  tier      : enum
     TIER_0  // EmergencyCards + kontakty — ZAWSZE, wbudowane w apkę
     TIER_1  // workflow'y krytyczne + wiedza dla kraju użytkownika
     TIER_2  // kraje sąsiednie / trasa
  versions  : VersionId[]
  checksum  : Hash
  builtAt   : DateTime
```

Synchronizacja: delta po `VersionId`, nigdy pełny re-download. Konflikt niemożliwy z definicji — wersje są niemutowalne (ADR-002 się spłaca).

---

## 8. Pętla wiedzy (Every Incident Becomes Knowledge)

```
Incident (COMPLETED)
   ↓  anonimizacja (usunięcie PII, rozmycie geo do poziomu regionu)
AnonymizedIncident
   ↓  agregacja (min. N incydentów, żeby nie dało się zidentyfikować)
KnowledgeCandidate
   ↓  weryfikacja przez człowieka
KnowledgeVersion (nowa, confidence = COMMUNITY lub VERIFIED)
```

**Inwariant:** żaden incydent nie zasila wiedzy bez anonimizacji ORAZ ludzkiej weryfikacji. AI może klastrować kandydatów — nigdy publikować.

---

## 9. Przepływ danych — Road Inspection (referencyjny)

```
1. Użytkownik: [KONTROLA]                          (1 tap)
2. Context Engine  → SituationContext (DE, offline, TRUCK)
3. Decision Engine → Rule match → Inspection_DE v1.2, trust=T1
4. Workflow Engine → start WorkflowInstance
     step: EMERGENCY_CARD   → Knowledge (TIER_0, lokalnie)
     step: SHOW_KNOWLEDGE   → prawa kierowcy (T1, wersja z paczki)
     step: TRANSLATE        → requires NETWORK
                              offline? → fallback: frazy z paczki
     step: CAPTURE_PHOTO    → Attachment[]
     step: GENERATE_REPORT  → Incident + knowledgeUsed[]
5. Po odzyskaniu sieci: sync, opcjonalna zgoda na anonimizację → §8
```

Zauważ: AI pojawił się w tym przepływie **zero razy obowiązkowo**. To jest test poprawności modelu.

---

## 10. Mapowanie na strukturę repo

```
guardian-engine/
  apps/
    driver-os/            # tylko: UI + katalog workflow'ów produktu
  core/
    knowledge/            # §2  KnowledgeEntry, Version, EmergencyCard, porty
    context/              # §3  SituationContext, resolvery
    decision/             # §4  Rule engine, deterministyczny, 100% testów
    workflow/             # §5  Definition, Instance, Incident, orkiestracja
    ai/                   # AIRequest, adaptery (RAG/OCR/tłumacz), NIGDY prawda
  shared/
    types/                # CountryCode, LanguageCode, TrustLevel, Ids
    storage/              # szyfrowany store lokalny, OfflinePackage
  packages/               # przyszłe: travel-os, fleet-os reużywają core/
```

Zasada: **wszystko z §2–§8 żyje w `core/` i `shared/`**. W `apps/driver-os/` nie ma ani jednej encji domenowej — tylko rendering stanu WorkflowInstance.

---

## 11. Co ten model gwarantuje za 2 lata

1. TravelOS = nowe WorkflowDefinitions + nowa paczka wiedzy. Zero zmian w silnikach.
2. Zmiana przepisu = nowa KnowledgeVersion. Stare raporty nietknięte i nadal dowodowe.
3. Audyt GDPR = Consent per zgoda, PII szyfrowane, pętla wiedzy tylko po anonimizacji.
4. Sąd/odwołanie od mandatu = Incident wskazuje dokładne wersje przepisów pokazane kierowcy.
5. AI można wymienić na inny model w jeden dzień — to adapter za portem, nie fundament.

---

## 12. Następne artefakty

- **Artefakt #0003 — Workflow Definition Spec**: format definicji (JSON/DSL), walidator paczek, reguła fallbacków.
- **Artefakt #0004 — Knowledge Pipeline**: proces weryfikacji, role, narzędzia edytorskie.
- **Artefakt #0005 — Offline Sync Protocol**: delta sync, checksumy, TIER-y.

---

*Guardian Engine Bible — Artefakt #0002 — wymaga zatwierdzenia przed refaktoringiem kodu.*
