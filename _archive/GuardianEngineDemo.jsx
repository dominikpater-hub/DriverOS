import React, { useState, useMemo } from "react";
import {
  Truck, Car, Wifi, WifiOff, ShieldCheck, Camera, FileText,
  ChevronRight, Check, Radio, Languages, ClipboardList,
  RotateCcw, Info, X, AlertTriangle
} from "lucide-react";

// ---------------------------------------------------------------------------
// DOMAIN DATA — mirrors Artefakt #0002 (Guardian Domain Model)
// ---------------------------------------------------------------------------

const KNOWLEDGE = {
  DE: {
    label: "Niemcy",
    versionId: "kv-de-traffic-rights · v1.2",
    source: "StVO §36 · gesetze-im-internet.de",
    verifiedAt: "2026-03-01",
    nextReviewDue: "2026-09-01",
    summary: "Zjedź bezpiecznie na pobocze i zachowaj spokój.",
    actions: [
      "Wyłącz silnik, włącz światła awaryjne",
      "Przygotuj prawo jazdy, dowód rejestracyjny i polisę OC",
      "Zostań w pojeździe do wezwania funkcjonariusza",
    ],
    rights: [
      "Masz prawo poprosić o obecność tłumacza",
      "Masz prawo do milczenia poza danymi podstawowymi",
    ],
    warnings: [
      "Nie opuszczaj pojazdu bez wezwania",
      "Nie podpisuj dokumentów, których nie rozumiesz",
    ],
  },
  FR: {
    label: "Francja",
    versionId: "kv-fr-traffic-rights · v1.0",
    source: "Code de la route · Art. R233-1",
    verifiedAt: "2026-01-14",
    nextReviewDue: "2026-07-14",
    summary: "Zatrzymaj się w bezpiecznym miejscu wskazanym przez funkcjonariusza.",
    actions: [
      "Miej przy sobie kartę pojazdu i ubezpieczenie",
      "Trzymaj ręce widoczne na kierownicy do momentu wezwania",
    ],
    rights: [
      "Masz prawo znać powód kontroli",
      "Masz prawo do kontaktu z konsulatem",
    ],
    warnings: ["Nie prowadź negocjacji na miejscu kontroli"],
  },
};

const ADR_ACTION = "Sprawdź, czy ładunek wymaga oznaczeń ADR i miej przy sobie świadectwo przewozu.";

const UNIVERSAL_FALLBACK = {
  summary: "Brak zweryfikowanej wiedzy dla tego kraju — zastosowano zasady uniwersalne.",
  actions: [
    "Zachowaj spokój i bądź uprzejmy",
    "Przygotuj dokumenty tożsamości i pojazdu",
  ],
  rights: [
    "Prawo do informacji o przyczynie kontroli",
    "Prawo do kontaktu z konsulatem swojego kraju",
  ],
  warnings: ["Nie podpisuj niczego, czego nie rozumiesz"],
};

const EMERGENCY_CARD = {
  contacts: ["112 — europejski numer alarmowy", "Konsulat — najbliższa placówka (pakiet offline)"],
  rights: "Masz prawo do bezpiecznego i godnego traktowania podczas każdej kontroli.",
};

const PHRASE = "Poproszę o obecność tłumacza.";
const PHRASE_AI = "Ich hätte gerne einen Dolmetscher.";
const PHRASE_OFFLINE = "Ich hätte gerne einen Dolmetscher. (fraza z pakietu offline)";

const TRUST = {
  T1: { key: "T1", label: "ZWERYFIKOWANE", sub: "verified", classes: "bg-emerald-500 text-emerald-950", dim: "text-emerald-600" },
  T2: { key: "T2", label: "WYMAGA PRZEGLĄDU", sub: "stale", classes: "bg-amber-500 text-amber-950", dim: "text-amber-600" },
  T3: { key: "T3", label: "WSPOMAGANE AI", sub: "ai-assisted", classes: "bg-blue-500 text-blue-950", dim: "text-blue-600" },
  T4: { key: "T4", label: "AWARYJNE", sub: "fallback", classes: "bg-red-500 text-red-950", dim: "text-red-600" },
};

const STEPS = [
  { kind: "EMERGENCY_CARD", title: "Karta bezpieczeństwa", icon: ShieldCheck },
  { kind: "SHOW_KNOWLEDGE", title: "Twoje prawa i obowiązki", icon: ClipboardList },
  { kind: "TRANSLATE", title: "Tłumacz", icon: Languages },
  { kind: "CAPTURE_PHOTO", title: "Dokumentacja zdjęciowa", icon: Camera },
  { kind: "GENERATE_REPORT", title: "Raport z incydentu", icon: FileText },
];

// ---------------------------------------------------------------------------
// DECISION ENGINE — pure function, deterministic
// ---------------------------------------------------------------------------

function matchRule(country, vehicle) {
  if (country === "DE" && vehicle === "TRUCK") {
    return {
      ruleId: "rule-inspection-de-truck", priority: 100, workflowDefId: "Inspection_DE_Truck",
      conditions: [["country", "eq", "DE"], ["eventType", "eq", "ROAD_INSPECTION"], ["vehicle.category", "eq", "TRUCK"]],
    };
  }
  if (country === "DE") {
    return { ruleId: "rule-inspection-de", priority: 50, workflowDefId: "Inspection_DE",
      conditions: [["country", "eq", "DE"], ["eventType", "eq", "ROAD_INSPECTION"]] };
  }
  if (country === "FR") {
    return { ruleId: "rule-inspection-fr", priority: 50, workflowDefId: "Inspection_FR",
      conditions: [["country", "eq", "FR"], ["eventType", "eq", "ROAD_INSPECTION"]] };
  }
  return { ruleId: "rule-fallback", priority: 0, workflowDefId: "Inspection_Generic",
    conditions: [["eventType", "eq", "ROAD_INSPECTION"]] };
}

// ---------------------------------------------------------------------------
// UI ATOMS
// ---------------------------------------------------------------------------

function TrustBadge({ level, compact }) {
  const t = TRUST[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold tracking-wide ${t.classes}`}>
      {t.key} {!compact && <span className="font-normal opacity-80">· {t.label}</span>}
    </span>
  );
}

function TrustRail({ active }) {
  const order = ["T1", "T2", "T3", "T4"];
  return (
    <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-800 bg-slate-950">
      {order.map((k) => {
        const t = TRUST[k];
        const isActive = active === k;
        return (
          <div key={k} className={`flex-1 rounded-md border transition-all duration-300 ${
            isActive ? `${t.classes} border-transparent py-1.5` : "bg-slate-900 border-slate-800 py-1"
          }`}>
            <div className={`text-center text-[10px] font-bold tracking-widest ${isActive ? "" : "text-slate-600"}`}>
              {k}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PrimaryButton({ onClick, children, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-semibold py-3.5 transition-colors"
    >
      {children}
      {Icon && <Icon size={18} />}
    </button>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border py-3 flex flex-col items-center gap-1 transition-colors ${
        active ? "border-orange-500 bg-orange-500/10 text-orange-400" : "border-slate-800 text-slate-500 hover:border-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------------

export default function GuardianEngineDemo() {
  const [screen, setScreen] = useState("start");
  const [country, setCountry] = useState("DE");
  const [vehicle, setVehicle] = useState("TRUCK");
  const [connectivity, setConnectivity] = useState("ONLINE");
  const [stepIndex, setStepIndex] = useState(0);
  const [history, setHistory] = useState([]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [photoAttached, setPhotoAttached] = useState(false);

  const rule = useMemo(() => matchRule(country, vehicle), [country, vehicle]);
  const knowledge = KNOWLEDGE[country] || null;
  const knowledgeTrust = knowledge ? "T1" : "T4";
  const translateTrust = connectivity === "ONLINE" ? "T3" : "T4";

  const currentStep = STEPS[stepIndex];
  const activeTrust =
    currentStep?.kind === "SHOW_KNOWLEDGE" ? knowledgeTrust :
    currentStep?.kind === "TRANSLATE" ? translateTrust :
    null;

  function startCase() {
    setHistory([]);
    setStepIndex(0);
    setPhotoAttached(false);
    setScreen("decision");
  }

  function beginWorkflow() {
    setScreen("workflow");
  }

  function commitStepAndAdvance() {
    const record = { kind: currentStep.kind, title: currentStep.title, trust: activeTrust,
      ref: currentStep.kind === "SHOW_KNOWLEDGE" ? (knowledge ? knowledge.versionId : "brak wersji — użyto zasad uniwersalnych")
        : currentStep.kind === "TRANSLATE" ? (connectivity === "ONLINE" ? "tłumaczenie AI (na żywo)" : "fraza z pakietu offline")
        : null };
    const nextHistory = [...history, record];
    setHistory(nextHistory);
    if (stepIndex + 1 < STEPS.length) {
      setStepIndex(stepIndex + 1);
    } else {
      setScreen("incident");
    }
  }

  function reset() {
    setScreen("start");
    setHistory([]);
    setStepIndex(0);
    setPhotoAttached(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex justify-center">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&display=swap');`}</style>
      <div className="w-full max-w-md flex flex-col min-h-screen bg-slate-950 border-x border-slate-900">

        {/* HEADER */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="text-[15px] font-bold leading-tight">
              Guardian Engine
            </div>
            <div className="text-[11px] text-slate-500 leading-tight">DriverOS · Road Inspection</div>
          </div>
          <button
            onClick={() => setConnectivity(connectivity === "ONLINE" ? "OFFLINE" : "ONLINE")}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              connectivity === "ONLINE" ? "border-emerald-700 text-emerald-400" : "border-slate-700 text-slate-500"
            }`}
          >
            {connectivity === "ONLINE" ? <Wifi size={13} className="animate-pulse" /> : <WifiOff size={13} />}
            {connectivity}
          </button>
        </header>

        {/* TRUST RAIL — signature element (ADR-003) */}
        <TrustRail active={activeTrust} />

        {/* BODY */}
        <main className="flex-1 px-4 py-5">

          {screen === "start" && (
            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold tracking-widest text-slate-500 mb-2">KRAJ KONTROLI</div>
                <div className="flex gap-2">
                  <Chip active={country === "DE"} onClick={() => setCountry("DE")}>
                    <span className="text-lg">🇩🇪</span><span className="text-xs font-medium">Niemcy</span>
                  </Chip>
                  <Chip active={country === "FR"} onClick={() => setCountry("FR")}>
                    <span className="text-lg">🇫🇷</span><span className="text-xs font-medium">Francja</span>
                  </Chip>
                  <Chip active={country === "OTHER"} onClick={() => setCountry("OTHER")}>
                    <span className="text-lg">🌍</span><span className="text-xs font-medium">Inny</span>
                  </Chip>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold tracking-widest text-slate-500 mb-2">POJAZD</div>
                <div className="flex gap-2">
                  <Chip active={vehicle === "TRUCK"} onClick={() => setVehicle("TRUCK")}>
                    <Truck size={20} /><span className="text-xs font-medium">Ciężarówka</span>
                  </Chip>
                  <Chip active={vehicle === "CAR"} onClick={() => setVehicle("CAR")}>
                    <Car size={20} /><span className="text-xs font-medium">Samochód</span>
                  </Chip>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-3.5 py-3 text-[12.5px] text-slate-400 leading-relaxed">
                Guardian nie odpowiada na pytania — rozwiązuje sytuacje. Jeden tap uruchamia
                pełny workflow: Context → Decision → Workflow → Incident.
              </div>

              <div className="pt-4">
                <PrimaryButton onClick={startCase} icon={ChevronRight}>
                  <Radio size={18} /> ROAD INSPECTION
                </PrimaryButton>
              </div>
            </div>
          )}

          {screen === "decision" && (
            <div className="space-y-5">
              <Section label="CONTEXT ENGINE" />
              <FieldRow k="Kraj" v={country === "OTHER" ? "nieznany" : country} />
              <FieldRow k="Pojazd" v={vehicle === "TRUCK" ? "TRUCK" : "CAR"} />
              <FieldRow k="Łączność" v={connectivity} />
              <FieldRow k="Zdarzenie" v="ROAD_INSPECTION" />

              <Section label="DECISION ENGINE — dopasowanie reguł" />
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3.5 space-y-2">
                {rule.conditions.map(([field, op, val], i) => (
                  <div key={i} className="flex items-center gap-2 text-[12.5px]">
                    <Check size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-slate-400 font-mono">{field} {op} {String(val)}</span>
                  </div>
                ))}
                <div className="pt-2 mt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[12px] text-slate-500">reguła · priorytet {rule.priority}</span>
                  <span className="text-[12px] font-mono text-slate-400">{rule.ruleId}</span>
                </div>
              </div>

              <div className="rounded-lg bg-orange-500/10 border border-orange-800/50 px-3.5 py-3">
                <div className="text-[11px] text-orange-400/80 font-semibold tracking-wide">WYBRANY WORKFLOW</div>
                <div className="font-mono text-[13px] text-orange-300 mt-0.5">{rule.workflowDefId}</div>
              </div>

              <div className="pt-2">
                <PrimaryButton onClick={beginWorkflow} icon={ChevronRight}>Uruchom workflow</PrimaryButton>
              </div>
            </div>
          )}

          {screen === "workflow" && (
            <div className="space-y-5">
              {/* step progress */}
              <div className="flex items-center gap-1.5">
                {STEPS.map((s, i) => (
                  <div key={s.kind} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-orange-500" : "bg-slate-800"}`} />
                ))}
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <currentStep.icon size={16} />
                <span className="text-[12px] font-semibold tracking-widest">{currentStep.title.toUpperCase()}</span>
              </div>

              {currentStep.kind === "EMERGENCY_CARD" && (
                <div className="rounded-lg border border-violet-800/50 bg-violet-500/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-violet-300 tracking-wide">TIER_0 · ZAWSZE DOSTĘPNE OFFLINE</span>
                  </div>
                  <p className="text-[13.5px] text-slate-200">{EMERGENCY_CARD.rights}</p>
                  <div className="space-y-1.5">
                    {EMERGENCY_CARD.contacts.map((c) => (
                      <div key={c} className="text-[12.5px] text-slate-400">• {c}</div>
                    ))}
                  </div>
                </div>
              )}

              {currentStep.kind === "SHOW_KNOWLEDGE" && (
                <div className="space-y-3">
                  <TrustBadge level={knowledgeTrust} />
                  <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                    <p className="text-[13.5px] text-slate-200 font-medium">
                      {knowledge ? knowledge.summary : UNIVERSAL_FALLBACK.summary}
                    </p>
                    <List title="Co zrobić" items={vehicle === "TRUCK" && knowledge
                      ? [...knowledge.actions, ADR_ACTION]
                      : (knowledge ? knowledge.actions : UNIVERSAL_FALLBACK.actions)} />
                    <List title="Twoje prawa" items={knowledge ? knowledge.rights : UNIVERSAL_FALLBACK.rights} />
                    <List title="Czego unikać" items={knowledge ? knowledge.warnings : UNIVERSAL_FALLBACK.warnings} tone="warn" />
                    <div className="pt-2 mt-1 border-t border-slate-800 font-mono text-[11px] text-slate-500">
                      {knowledge
                        ? <>{knowledge.versionId} · zweryfikowano {knowledge.verifiedAt} · przegląd do {knowledge.nextReviewDue}</>
                        : <>brak wpisu w Knowledge Engine dla tego kraju</>}
                    </div>
                  </div>
                </div>
              )}

              {currentStep.kind === "TRANSLATE" && (
                <div className="space-y-3">
                  <TrustBadge level={translateTrust} />
                  <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                    <div className="text-[12px] text-slate-500">Fraza:</div>
                    <div className="text-[13.5px] text-slate-200">„{PHRASE}"</div>
                    <div className="text-[12px] text-slate-500 pt-1">Tłumaczenie:</div>
                    <div className="text-[14px] text-slate-100 font-medium">
                      „{connectivity === "ONLINE" ? PHRASE_AI : PHRASE_OFFLINE}"
                    </div>
                    {connectivity === "OFFLINE" && (
                      <div className="flex items-start gap-2 rounded-md bg-red-500/10 border border-red-800/40 px-3 py-2 mt-2">
                        <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                        <span className="text-[12px] text-red-300">
                          Krok wymaga sieci — brak połączenia, uruchomiono fallback z pakietu offline.
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-500 px-1">
                    Przełącz ONLINE/OFFLINE w nagłówku, by zobaczyć degradację zaufania na żywo.
                  </p>
                </div>
              )}

              {currentStep.kind === "CAPTURE_PHOTO" && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-3">
                  <p className="text-[13px] text-slate-400">Dołącz zdjęcie jako dowód do raportu incydentu.</p>
                  <button
                    onClick={() => setPhotoAttached(true)}
                    className={`w-full rounded-lg border py-6 flex flex-col items-center gap-2 transition-colors ${
                      photoAttached ? "border-emerald-700 bg-emerald-500/10 text-emerald-400" : "border-dashed border-slate-700 text-slate-500 hover:border-slate-600"
                    }`}
                  >
                    <Camera size={22} />
                    <span className="text-[12px] font-medium">{photoAttached ? "Zdjęcie dołączone" : "Dotknij, aby zrobić zdjęcie"}</span>
                  </button>
                </div>
              )}

              {currentStep.kind === "GENERATE_REPORT" && (
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                  <p className="text-[13px] text-slate-400">
                    Wszystkie kroki zostały zarejestrowane. Wygeneruj raport incydentu —
                    wskazane wersje wiedzy i poziomy zaufania staną się częścią dowodu.
                  </p>
                </div>
              )}

              <div className="pt-2">
                <PrimaryButton onClick={commitStepAndAdvance} icon={ChevronRight}>
                  {stepIndex + 1 < STEPS.length ? "Dalej" : "Wygeneruj raport"}
                </PrimaryButton>
              </div>
            </div>
          )}

          {screen === "incident" && (
            <div className="space-y-5">
              <Section label="INCIDENT — raport dowodowy" />
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 space-y-2">
                <FieldRow k="Incident ID" v={`INC-${country}-${Date.now().toString().slice(-6)}`} mono />
                <FieldRow k="Workflow" v={rule.workflowDefId} mono />
                <FieldRow k="Kraj / pojazd" v={`${country === "OTHER" ? "nieznany" : country} · ${vehicle}`} />
                <FieldRow k="Zakończono" v={new Date().toLocaleString("pl-PL")} />
              </div>

              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 rounded-lg border border-slate-800 px-3.5 py-2.5">
                    <div>
                      <div className="text-[12.5px] font-medium text-slate-200">{h.title}</div>
                      {h.ref && <div className="text-[11px] font-mono text-slate-500 mt-0.5">{h.ref}</div>}
                    </div>
                    {h.trust && <TrustBadge level={h.trust} compact />}
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-emerald-500/10 border border-emerald-800/40 px-3.5 py-3 text-[12px] text-emerald-300 leading-relaxed">
                Ten raport wskazuje dokładne wersje wiedzy i poziomy zaufania pokazane
                kierowcy — zgodnie z ADR-002 i ADR-003. Zmiana przepisu w przyszłości nie
                naruszy tego dowodu.
              </div>

              <PrimaryButton onClick={reset} icon={RotateCcw}>Nowy przypadek</PrimaryButton>
            </div>
          )}
        </main>

        {/* FOOTER */}
        <footer className="border-t border-slate-800 px-4 py-2.5">
          <button onClick={() => setLegendOpen(true)} className="flex items-center gap-1.5 text-[11.5px] text-slate-500 hover:text-slate-300">
            <Info size={13} /> Co oznaczają T1–T4?
          </button>
        </footer>

        {/* LEGEND SHEET */}
        {legendOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setLegendOpen(false)}>
            <div className="w-full max-w-md bg-slate-900 border-t border-slate-700 rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <span style={{ fontFamily: "'Space Grotesk', sans-serif" }} className="font-bold">Trust Ladder — ADR-003</span>
                <button onClick={() => setLegendOpen(false)}><X size={18} className="text-slate-500" /></button>
              </div>
              <div className="space-y-3">
                <LegendRow level="T1" text="Zweryfikowana wiedza, ważna. Prezentowana bez zastrzeżeń." />
                <LegendRow level="T2" text="Wiedza po terminie przeglądu. Oznaczona jako wymagająca weryfikacji." />
                <LegendRow level="T3" text="Wskazówka AI w oparciu o kontekst — nie porada prawna." />
                <LegendRow level="T4" text="Brak wiedzy i AI (np. offline). Karta awaryjna z uniwersalnymi zasadami." />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// small presentational helpers
// ---------------------------------------------------------------------------

function Section({ label }) {
  return <div className="text-[11px] font-semibold tracking-widest text-slate-600">{label}</div>;
}

function FieldRow({ k, v, mono }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-slate-500">{k}</span>
      <span className={`text-slate-200 ${mono ? "font-mono text-[11.5px]" : ""}`}>{v}</span>
    </div>
  );
}

function List({ title, items, tone }) {
  return (
    <div>
      <div className={`text-[11px] font-semibold tracking-wide mb-1 ${tone === "warn" ? "text-red-400" : "text-slate-500"}`}>{title}</div>
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it} className={`text-[12.5px] ${tone === "warn" ? "text-red-300" : "text-slate-300"}`}>• {it}</div>
        ))}
      </div>
    </div>
  );
}

function LegendRow({ level, text }) {
  return (
    <div className="flex items-start gap-3">
      <TrustBadge level={level} compact />
      <p className="text-[12.5px] text-slate-400 leading-snug pt-0.5">{text}</p>
    </div>
  );
}
