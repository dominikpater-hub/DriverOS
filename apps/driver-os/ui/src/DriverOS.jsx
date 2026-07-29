import React, { useState, useMemo, useRef } from "react";
import { answerGrounded } from "./engine/aiEngine.js";

/* ============================================================
   Guardian Engine — DriverOS (prototyp klikalny)
   Silniki in-memory, wierne Domain Model.
   UI: polski. Treść/zwroty: niemiecki (kraj) + podpis PL.
   Czat AI: symulacja NA BAZIE wiedzy (T3, z źródłem), nie "wie wszystko".
   ============================================================ */

export const Trust = {
  T1: { id: "T1", label: "Zweryfikowane", color: "#1B7F4B", bar: 4 },
  T2: { id: "T2", label: "Wymaga aktualizacji", color: "#B58A00", bar: 3 },
  T3: { id: "T3", label: "Odpowiedź AI", color: "#2563C9", bar: 2 },
  T4: { id: "T4", label: "Tryb awaryjny", color: "#8A8F98", bar: 1 },
};

const KNOWLEDGE = {
  "rights-de": {
    versionId: "v1.2", trust: "T1", ref: "StVO §36",
    actions: [
      "Zachowaj spokój i zostań w pojeździe.",
      "Pokaż prawo jazdy i dokumenty pojazdu.",
      "Musisz podać tylko dane osobowe.",
    ],
    rights: ["Prawo do milczenia (poza danymi osobowymi)", "Prawo do adwokata"],
    warnings: ["Nie odjeżdżaj.", "Nie fałszuj dokumentów."],
  },
};

const CONDUCT_DE = {
  trust: "T1",
  rules: [
    "Zatrzymaj się w bezpiecznym miejscu.",
    "Zgaś silnik, opuść szybę.",
    "Ręce widoczne na kierownicy.",
    "Bądź uprzejmy i rzeczowy.",
  ],
};

// Dokumenty TIR (T1). "hold" = zostaje u ciebie / okazujesz do wglądu.
const TIR_DOCS = {
  versionId: "v1.0", ref: "BALM · rozp. 165/2014",
  items: [
    { t: "Prawo jazdy CE + kod 95", d: "Kategoria CE i kwalifikacja zawodowa (kod 95)." },
    { t: "Karta kierowcy", d: "Do tachografu. Wkładasz do urządzenia." },
    { t: "Dowód rejestracyjny + badania techniczne", d: "Ważne badania pojazdu." },
    { t: "Licencja wspólnotowa UE", d: "Uprawnienie przewoźnika." },
    { t: "CMR — list przewozowy", d: "Okazujesz do wglądu. Masz 3 egzemplarze — twój zostaje u ciebie." },
    { t: "Ubezpieczenie (OC + CMR)", d: "Polisa pojazdu i przewoźnika." },
    { t: "ADR", d: "Tylko jeśli wieziesz towar niebezpieczny." },
    { t: "Potwierdzenie Maut", d: "Opłata drogowa za ciężarówkę." },
  ],
};

const PHRASES = [
  {
    group: "Język / pierwszy kontakt", color: "#2563C9",
    items: [
      { de: "Guten Tag. Ich bin Berufskraftfahrer aus Polen.", pl: "Dzień dobry. Jestem kierowcą zawodowym z Polski." },
      { de: "Ich spreche leider nur wenig Deutsch.", pl: "Niestety mówię tylko trochę po niemiecku." },
      { de: "Sprechen Sie Englisch oder Polnisch?", pl: "Czy mówi Pan po angielsku lub polsku?" },
    ],
  },
  {
    group: "Dokumenty", color: "#1B7F4B",
    items: [
      { de: "Hier sind mein Führerschein und die Fahrzeugpapiere.", pl: "Oto moje prawo jazdy i dokumenty pojazdu." },
      { de: "Hier sind die Fahrerkarte und der CMR-Frachtbrief.", pl: "Oto karta kierowcy i list przewozowy CMR." },
      { de: "Einen Moment bitte, ich hole meine Papiere.", pl: "Chwileczkę, wyjmuję dokumenty." },
    ],
  },
  {
    group: "Pytania / sytuacja", color: "#B58A00",
    items: [
      { de: "Gibt es ein Problem? Können Sie es mir erklären?", pl: "Czy jest jakiś problem? Może mi Pan wyjaśnić?" },
      { de: "Warum wurde ich angehalten?", pl: "Dlaczego zostałem zatrzymany?" },
      { de: "Wie hoch ist das Bußgeld und wie kann ich zahlen?", pl: "Jak wysoki jest mandat i jak mogę zapłacić?" },
    ],
  },
  {
    group: "Prawa (spokojnie, asertywnie)", color: "#D98880",
    items: [
      { de: "Ich möchte bitte einen Dolmetscher.", pl: "Poproszę o tłumacza." },
      { de: "Ich möchte zu diesem Vorwurf nichts sagen.", pl: "Nie chcę się wypowiadać w tej sprawie." },
      { de: "Kann ich bitte einen schriftlichen Nachweis bekommen?", pl: "Czy mogę dostać pisemne potwierdzenie?" },
    ],
  },
];



// Kierunek DE->PL: typowe zwroty policjanta. Kierowca wpisuje/dyktuje co usłyszał.
const SIM_DICT_DE = [
  { k: ["führerschein", "papiere", "dokumente", "fahrzeugpapiere"], pl: "Poproszę prawo jazdy i dokumenty pojazdu." },
  { k: ["fahrerkarte"], pl: "Poproszę kartę kierowcy." },
  { k: ["frachtbrief", "cmr", "ladung", "fracht"], pl: "Poproszę list przewozowy / dokumenty ładunku." },
  { k: ["alkohol", "pusten", "atemtest"], pl: "Proszę dmuchnąć — test na alkohol." },
  { k: ["zu schnell", "geschwindigkeit", "tempo"], pl: "Jechał Pan za szybko (prędkość)." },
  { k: ["aussteigen", "steigen sie aus"], pl: "Proszę wysiąść z pojazdu." },
  { k: ["bußgeld", "strafe", "zahlen", "kaution"], pl: "Musi Pan zapłacić mandat / kaucję." },
  { k: ["warten", "moment", "einen moment"], pl: "Proszę czekać." },
  { k: ["weiterfahren", "können fahren", "alles in ordnung"], pl: "Wszystko w porządku, może Pan jechać." },
  { k: ["motor", "ausschalten", "abstellen"], pl: "Proszę zgasić silnik." },
];
function simulateTranslateDE(de) {
  const t = de.toLowerCase();
  const hit = SIM_DICT_DE.find((e) => e.k.some((w) => t.includes(w)));
  return hit ? hit.pl : "(demo) Tłumaczenie DE→PL pojawi się po wpięciu AI.";
}
const QUICK_DE = [
  { label: "Dokumente!", full: "Führerschein und Fahrzeugpapiere bitte." },
  { label: "Aussteigen", full: "Bitte steigen Sie aus." },
  { label: "Alkoholtest", full: "Bitte pusten — Atemtest." },
  { label: "Zu schnell", full: "Sie sind zu schnell gefahren." },
  { label: "Bußgeld", full: "Sie müssen ein Bußgeld zahlen." },
  { label: "Weiterfahren", full: "Alles in Ordnung, Sie können weiterfahren." },
];

// Szybkie zwroty do tłumacza — tapnięcie od razu pokazuje niemieckie zdanie.
const QUICK_TRANSLATE = [
  { label: "Oto dokumenty", de: "Hier sind meine Dokumente." },
  { label: "Oto CMR", de: "Hier ist der CMR-Frachtbrief." },
  { label: "Karta kierowcy", de: "Hier ist meine Fahrerkarte." },
  { label: "Chwila, proszę", de: "Einen Moment bitte." },
  { label: "Nie rozumiem", de: "Entschuldigung, ich verstehe nicht." },
  { label: "Ile wynosi mandat?", de: "Wie hoch ist das Bußgeld?" },
  { label: "Proszę o tłumacza", de: "Ich möchte einen Dolmetscher." },
  { label: "Dziękuję", de: "Vielen Dank." },
];

const SIM_DICT = [
  { k: ["dokument", "papier", "prawo jazdy"], de: "Hier sind meine Dokumente." },
  { k: ["cmr", "list przewozowy", "fracht"], de: "Hier ist der CMR-Frachtbrief." },
  { k: ["karta kierowcy", "tacho"], de: "Hier ist meine Fahrerkarte." },
  { k: ["ubezpieczenie", "oc"], de: "Hier ist meine Versicherung." },
  { k: ["nie rozumiem", "nie wiem"], de: "Entschuldigung, ich verstehe nicht." },
  { k: ["chwila", "moment", "czekać"], de: "Einen Moment bitte." },
  { k: ["mandat", "ile", "zapłacić"], de: "Wie hoch ist das Bußgeld?" },
  { k: ["tłumacz"], de: "Ich möchte einen Dolmetscher." },
  { k: ["dziękuję", "dzięki"], de: "Vielen Dank." },
];
function simulateTranslate(pl) {
  const t = pl.toLowerCase();
  const hit = SIM_DICT.find((e) => e.k.some((w) => t.includes(w)));
  return hit ? hit.de : "(demo) Tłumaczenie pojawi się tu po wpięciu AI.";
}

// Czat Q&A — odpowiada TYLKO z tej bazy. Każda odpowiedź ma źródło. Brak -> T4.
export const QA_INSPECTION = [
  { k: ["oddać cmr", "zabrać cmr", "cmr zostaje", "muszę dać cmr", "dać cmr"], a: "Nie oddajesz. CMR okazujesz do wglądu. Masz 3 egzemplarze (nadawca / odbiorca / przewoźnik) — twój zostaje u ciebie.", src: "Konwencja CMR" },
  { k: ["ile dni tacho", "ile dni tachograf", "56 dni", "28 dni", "ile tacho"], a: "Od 31.12.2024 musisz wykazać bieżący dzień + poprzednie 56 dni (wcześniej było 28).", src: "rozp. 165/2014 art. 36 · pakiet mobilności" },
  { k: ["kiedy wydruk", "wydruk tacho", "wydruk z tacho"], a: "Wydruk robisz na żądanie inspektora. Miej też wydruki do wyjaśnień, jeśli była jazda bez karty lub usterka tachografu.", src: "rozp. 165/2014" },
  { k: ["kto kontroluje", "kto może", "jakie służby", "kto sprawdza"], a: "Trzy służby: BALM (transport, Maut, czas pracy), Autobahnpolizei (autostrady) i Landespolizei.", src: "BALM" },
  { k: ["co mogą sprawdzić", "co sprawdzają", "co kontrolują", "zakres kontroli"], a: "Tożsamość, dokumenty, tachograf (56 dni), stan techniczny oraz zabezpieczenie i masę ładunku (możliwe ważenie).", src: "BALM" },
  { k: ["mandat", "kaucja", "ile zapłacę", "grzywna"], a: "Od zagranicznych kierowców inspektor pobiera kaucję na miejscu. Wysokość zależy od naruszenia.", src: "BALM" },
  { k: ["kabotaż", "kabotaz"], a: "Kabotaż to przewóz wewnątrz Niemiec pojazdem z innego kraju — jest ściśle limitowany.", src: "przepisy kabotażowe UE" },
];
export const QA_ACCIDENT = [
  { k: ["oświadczenie", "oswiadczenie", "druk", "formularz"], a: "Europejskie oświadczenie o wypadku spisujecie, gdy policja nie przyjeżdża. Podpis NIE oznacza przyznania winy — to tylko opis zdarzenia.", src: "Europejskie oświadczenie o wypadku" },
  { k: ["wina", "winny", "przyznać", "przyznac"], a: "Nie przyznawaj się do winy na miejscu. Winę rozstrzygają policja i ubezpieczyciele na podstawie faktów.", src: "MOTOEXPERT / praktyka DE" },
  { k: ["ucieczka", "odjechać", "odjechac", "unfallflucht", "oddalić"], a: "Oddalenie się z miejsca (Unfallflucht, §142 StGB) to przestępstwo — grzywna, do 3 lat więzienia lub utrata prawa jazdy.", src: "§142 StGB" },
  { k: ["ubezpieczyciel", "ubezpieczenie", "szkoda", "zgłosić", "zglosic"], a: "Zgłoś szkodę swojemu ubezpieczycielowi. Dla kierowców z UE szkodę prowadzi niemiecki pełnomocnik ich ubezpieczyciela.", src: "System Zielonej Karty UE" },
  { k: ["holowanie", "laweta", "odholować", "pojazd niejezdny"], a: "Przy poważnym uszkodzeniu nie usuwaj pojazdu bez zgody policji, jeśli ją wezwano. Holowanie zamów po zabezpieczeniu miejsca.", src: "StVO / praktyka DE" },
  { k: ["świadk", "swiadk"], a: "Spisz dane świadków (za ich zgodą) lub nagraj relację. Ich zeznania pomagają ustalić przebieg zdarzenia.", src: "praktyka ubezpieczeniowa" },
  { k: ["policja", "wzywać", "wzywac", "kiedy policj"], a: "Policję wzywasz obowiązkowo, gdy: są ranni, poważna szkoda, spór o przebieg, podejrzenie nietrzeźwości lub ucieczka drugiego kierowcy.", src: "praktyka DE" },
];
// Trust WYNIKA ZE ŹRÓDŁA odpowiedzi — nie jest zaszyty na sztywno (fix TRUST-1).
//  - trafienie w kurowaną, źródłową bazę   -> T1 (zweryfikowane; działa też offline)
//  - realne AI (przyszłość, backend proxy) -> T3 (patrz askAI — WYMAGA sieci)
//  - brak pokrycia                         -> T4 (tryb awaryjny)
export function answerFromBase(q, base) {
  const t = (q || "").toLowerCase();
  const hit = (base || QA_INSPECTION).find((e) => e.k.some((w) => t.includes(w)));
  return hit ? { trust: "T1", text: hit.a, src: hit.src, origin: "base" } : null;
}

// SZEW pod realne AI (fix GAP-1). Jedyna ścieżka, która może zwrócić T3.
// Wymaga sieci i wpiętego providera. Dziś provider=null => zawsze null,
// więc offline NIC nie udaje żywego AI. Docelowo: online && provider ->
// { trust:"T3", text, src, origin:"ai" } przez backend proxy (nigdy klucz w apce).
export async function askAI(_q, _ctx, { online } = { online: true }) {
  const provider = null; // ⟵ wepnij realny provider tutaj
  if (!online || !provider) return null;
  return null;
}

export function answerQuestion(q, base) {
  const fromBase = answerFromBase(q, base);
  if (fromBase) return fromBase; // zweryfikowana wiedza — także bez sieci
  // brak w bazie: tu wchodzi askAI (network-gated). Dziś => T4.
  return { trust: "T4", text: "Brak zweryfikowanej wiedzy na to pytanie. Trzymaj się pokazanych kroków. To nie jest porada prawna.", src: null, origin: "none" };
}


// Wyniki zdarzenia — zamknięta lista per typ (bez "wpisz sam", żeby dane były czyste).
// Każdy mapuje się na niemiecki termin — ważne dla raportu dowodowego.
// Wynik zależy od typu zdarzenia: kontrola kończy się inaczej niż wypadek.
const OUTCOMES_BY_EVENT = {
  ROAD_INSPECTION: [
    { id: "OK", label: "Puszczono wolno / bez uwag", de: "Weiterfahrt gestattet", color: "#1B7F4B" },
    { id: "ERMAHNUNG", label: "Pouczenie (bez opłaty)", de: "Ermahnung / Verwarnung", color: "#1B7F4B" },
    { id: "VERWARNUNGSGELD", label: "Mandat drobny (do ~55 EUR)", de: "Verwarnungsgeld", color: "#B58A00" },
    { id: "BUSSGELD", label: "Mandat / grzywna (od ~60 EUR)", de: "Bußgeld", color: "#B58A00" },
    { id: "KAUTION", label: "Kaucja pobrana na miejscu", de: "Sicherheitsleistung", color: "#B58A00" },
    { id: "UNTERSAGT", label: "Zakaz dalszej jazdy / unieruchomienie", de: "Weiterfahrt untersagt", color: "#C1121F" },
  ],
  ACCIDENT: [
    { id: "POLICE_REPORT", label: "Policja spisała protokół (jest nr akt)", de: "Polizeilicher Unfallbericht", color: "#1B7F4B" },
    { id: "STATEMENT", label: "Europejskie oświadczenie (bez policji)", de: "Einvernehmliche Unfallmeldung", color: "#1B7F4B" },
    { id: "DISPUTE", label: "Spór — brak zgody stron", de: "Uneinigkeit / Streitfall", color: "#B58A00" },
    { id: "TOWED", label: "Pojazd niejezdny — holowanie", de: "Fahrzeug abgeschleppt", color: "#B58A00" },
    { id: "INJURY", label: "Są ranni — sprawa z obrażeniami", de: "Personenschaden", color: "#C1121F" },
  ],
};
function outcomesFor(evt) { return OUTCOMES_BY_EVENT[evt] || OUTCOMES_BY_EVENT.ROAD_INSPECTION; }
function findOutcome(evt, id) { return outcomesFor(evt).find((o) => o.id === id) || null; }

// ===================== WYPADEK (Accident_DE) — wiedza zweryfikowana =====================
const ACC_SAFETY = {
  trust: "T1", ref: "StVO §34",
  rules: [
    "Włącz światła awaryjne.",
    "Załóż kamizelkę odblaskową PRZED wyjściem.",
    "Ustaw trójkąt (autostrada: ~150–200 m za pojazdem).",
    "Zejdź za barierę, z dala od jezdni.",
  ],
};
const ACC_INJURED = {
  trust: "T1", ref: "§323c StGB",
  contacts: [{ label: "Ratunkowy", number: "112" }, { label: "Policja", number: "110" }],
  steps: [
    "Sprawdź przytomność i oddech poszkodowanego.",
    "Dzwoń 112 — dyspozytor poprowadzi cię przez telefon.",
    "Nie przenoś ciężko rannych bez potrzeby (chyba że zagrożenie, np. pożar).",
    "Zostań przy poszkodowanym do przyjazdu służb.",
  ],
  cpr: [
    "Brak oddechu → ułóż na plecach, odsłoń klatkę.",
    "Uciskaj środek klatki: 30 uciśnięć, głębokość ~5–6 cm.",
    "Tempo ~100–120/min (rytm piosenki „Stayin' Alive”).",
    "2 oddechy ratownicze, potem znów 30 uciśnięć.",
    "Nie przerywaj do przyjazdu służb lub odzyskania oddechu.",
  ],
  legal: [
    "W Niemczech nieudzielenie pomocy (unterlassene Hilfeleistung, §323c StGB) to przestępstwo.",
    "Karane jest zaniechanie, NIE nieudany skutek — nie musisz być ratownikiem.",
    "Obowiązek zdejmuje tylko realne zagrożenie dla ciebie lub przyjazd służb.",
  ],
};
export const POLICE_TRIGGERS = [
  { id: "injured", q: "Czy ktoś jest ranny?" },
  { id: "serious", q: "Poważne uszkodzenia lub duża szkoda?" },
  { id: "dispute", q: "Brak zgody co do przebiegu lub winy?" },
  { id: "suspect", q: "Drugi kierowca pod wpływem, ucieka lub odmawia dokumentów?" },
];
// Czyste, deterministyczne funkcje decyzji (testowalne, bez AI).
export function policeRequired(decision) {
  return POLICE_TRIGGERS.some((t) => decision[t.id] === true);
}
export function policeAnswered(decision) {
  return POLICE_TRIGGERS.every((t) => decision[t.id] !== undefined);
}
const ACC_EXCHANGE = {
  trust: "T1", ref: "Europejskie oświadczenie o wypadku",
  fields: [
    "Imię, nazwisko i adres drugiego kierowcy",
    "Ubezpieczyciel + numer polisy",
    "Numer rejestracyjny pojazdu",
    "Dane świadków (za ich zgodą)",
  ],
  warnings: [
    "NIE przyznawaj się do winy — rozstrzygną policja i ubezpieczyciele.",
    "NIE podpisuj dokumentów, których nie rozumiesz.",
    "Ucieczka z miejsca (Unfallflucht) to przestępstwo — do 3 lat lub utrata prawa jazdy.",
  ],
};
const ACCIDENT_DE = {
  id: "Accident_DE", version: "1.0.0",
  steps: [
    { id: "safety", kind: "SAFETY_CARD", title: "Zabezpiecz miejsce — najpierw", tag: "prawo" },
    { id: "injured", kind: "INJURED_CARD", title: "Sprawdź rannych", tag: "prawo" },
    { id: "decide", kind: "DECISION_POINT", title: "Czy wzywać policję?" },
    { id: "exchange", kind: "EXCHANGE_DATA", title: "Wymiana danych", tag: "prawo" },
    { id: "ask", kind: "AI_CHAT", title: "Zapytaj o wypadek" },
    { id: "photo", kind: "CAPTURE_PHOTO", title: "Zabezpiecz dowód" },
    { id: "report", kind: "GENERATE_REPORT", title: "Utwórz raport" },
  ],
};

export const RULES = [
  { priority: 100, when: { country: "DE", event: "ROAD_INSPECTION", vehicle: "TRUCK" }, workflow: "Inspection_DE" },
  { priority: 90, when: { country: "DE", event: "ROAD_INSPECTION" }, workflow: "Inspection_DE" },
  { priority: 100, when: { country: "DE", event: "ACCIDENT", vehicle: "TRUCK" }, workflow: "Accident_DE" },
  { priority: 90, when: { country: "DE", event: "ACCIDENT" }, workflow: "Accident_DE" },
];
export function matchRule(ctx) {
  return RULES
    .filter((r) => Object.entries(r.when).every(([k, v]) => ctx[k] === v))
    .sort((a, b) => b.priority - a.priority)[0]?.workflow ?? null;
}

const INSPECTION_DE = {
  id: "Inspection_DE", version: "1.1.0",
  steps: [
    { id: "conduct", kind: "CONDUCT_CARD", title: "Jak się zachować — od razu", tag: "postępowanie" },
    { id: "knowledge", kind: "SHOW_KNOWLEDGE", title: "Co teraz zrobić", knowledgeId: "rights-de", tag: "prawo" },
    { id: "docs", kind: "TIR_DOCS", title: "Dokumenty do kontroli", tag: "prawo" },
    { id: "ask", kind: "AI_CHAT", title: "Zapytaj o kontrolę" },
    { id: "translate", kind: "TRANSLATE", title: "Powiedz to policjantowi", requiresNetwork: true },
    { id: "photo", kind: "CAPTURE_PHOTO", title: "Zabezpiecz dowód" },
    { id: "report", kind: "GENERATE_REPORT", title: "Utwórz raport" },
  ],
};

const WORKFLOWS = { Inspection_DE: INSPECTION_DE, Accident_DE: ACCIDENT_DE };

// Czysta funkcja: jaki trust ma krok w danym stanie sieci (testowalna, bez Reacta).
// AI_CHAT nie deklaruje trustu w nagłówku — każda odpowiedź niesie swój (T1/T3/T4).
// TRANSLATE to ścieżka sieciowa: online -> T3, offline -> T4 z degradacją (fellBack).
export function resolveStepTrust(step, { online } = { online: true }) {
  switch (step.kind) {
    case "CONDUCT_CARD":
    case "SAFETY_CARD":
    case "INJURED_CARD":
    case "EXCHANGE_DATA":
    case "TIR_DOCS":
      return { trust: "T1", tag: step.tag };
    case "DECISION_POINT":
      return { trust: "T1", tag: "decyzja" };
    case "SHOW_KNOWLEDGE":
      return { trust: KNOWLEDGE[step.knowledgeId].trust, knowledge: KNOWLEDGE[step.knowledgeId], tag: step.tag };
    case "AI_CHAT":
      return { trust: null, label: "Baza wiedzy" };
    case "TRANSLATE":
      return step.requiresNetwork && !online
        ? { trust: "T4", fellBack: true, label: "Tłumacz AI" }
        : { trust: "T3", label: "Tłumacz AI" };
    default:
      return { trust: null };
  }
}

export function TrustBadge({ level, tag, labelOverride }) {
  const t = Trust[level];
  if (!t) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 22 }}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} style={{ width: 6, height: 6 + n * 4, borderRadius: 1, background: n <= t.bar ? t.color : "#2A2E37" }} />
        ))}
      </div>
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ color: t.color, fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>{labelOverride || t.label}</div>
        <div style={{ color: "#6B7280", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{t.id}{tag ? ` · ${tag}` : ""}</div>
      </div>
    </div>
  );
}

const wrap = { maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: "#0E1117", color: "#E8EAED", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" };
const card = { background: "#171B22", border: "1px solid #232833", borderRadius: 16, padding: 20 };
const bigBtn = { width: "100%", padding: "20px 24px", fontSize: 18, fontWeight: 700, border: "none", borderRadius: 14, cursor: "pointer", letterSpacing: "-0.01em" };

// Dyktowanie (Web Speech API). Graceful jak brak wsparcia.
function useDictation(onText) {
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function toggle() {
    if (!supported) return;
    if (listening) { recRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "pl-PL"; rec.interimResults = false;
    rec.onresult = (e) => onText(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.start(); recRef.current = rec; setListening(true);
  }
  return { supported, listening, toggle };
}

function MicButton({ onText }) {
  const { supported, listening, toggle } = useDictation(onText);
  const [hint, setHint] = useState(false);
  function handle() {
    if (supported) { toggle(); }
    else { setHint(true); setTimeout(() => setHint(false), 2600); }
  }
  return (
    <div style={{ position: "relative", flex: "0 0 auto" }}>
      <button onClick={handle} aria-label="Dyktuj" style={{
        width: 52, height: 52, borderRadius: 12, cursor: "pointer",
        border: "1px solid #232833", background: listening ? "#C1121F" : "#0E1117",
        color: listening ? "#fff" : "#9AA0AA", fontSize: 20,
      }}>{listening ? "●" : "🎙"}</button>
      {hint && (
        <div style={{ position: "absolute", bottom: 58, right: 0, width: 200, background: "#232833", color: "#E8EAED", fontSize: 12, padding: "8px 10px", borderRadius: 8, zIndex: 5, lineHeight: 1.4 }}>
          Dyktowanie działa w pełnej aplikacji. W tym podglądzie mikrofon może być zablokowany.
        </div>
      )}
    </div>
  );
}

// ===================== EVIDENCE (placeholder) =====================
// UWAGA (EVID-1): hash liczony jest z METADANYCH (czas, GPS, numer, sekwencja),
// NIE z bajtów zdjęcia — i nie jest podpisany ani zakotwiczony u zaufanego TSA.
// To wykrywa zmianę metadanych, ale NIE jest dowodem odpornym na podmianę.
// Docelowo: hash bajtów pliku + podpis + zaufany znacznik czasu (RFC 3161).
async function computeEvidenceHash(meta) {
  const data = JSON.stringify(meta);
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    // Fallback (środowisko bez crypto.subtle) — prosty niekryptograficzny skrót
    let h = 0; for (let i = 0; i < data.length; i++) { h = (h * 31 + data.charCodeAt(i)) | 0; }
    return "fallback-" + (h >>> 0).toString(16);
  }
}

export default function DriverOS({ onExit }) {
  const [screen, setScreen] = useState("home");
  const [online, setOnline] = useState(true);
  const [stepIdx, setStepIdx] = useState(0);
  const [knowledgeUsed, setKnowledgeUsed] = useState([]);
  const [trustSeen, setTrustSeen] = useState([]);
  const [transInput, setTransInput] = useState("");
  const [transLog, setTransLog] = useState([]);
  const [transDir, setTransDir] = useState("PL_DE"); // PL_DE | DE_PL
  const [chatQ, setChatQ] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [outcome, setOutcome] = useState(null);
  const [engineLog, setEngineLog] = useState([]);
  const [gps, setGps] = useState(null);
  const [gpsStatus, setGpsStatus] = useState("idle"); // idle|loading|ok|denied|unavailable
  const [photos, setPhotos] = useState([]);
  const [startedAt, setStartedAt] = useState(null);
  const [activeEvent, setActiveEvent] = useState("ROAD_INSPECTION");
  const [decision, setDecision] = useState({});
  const [exportMsg, setExportMsg] = useState(null); // MOBILE-1: status eksportu (bez cichych błędów)
  const msgIdRef = useRef(0); // stabilne id wiadomości czatu (async, stan pending)

  const ctx = useMemo(() => ({
    country: "DE", event: activeEvent, vehicle: "TRUCK",
    connectivity: online ? "ONLINE" : "OFFLINE", language: "pl",
  }), [online, activeEvent]);

  const workflow = WORKFLOWS[matchRule(ctx)] || INSPECTION_DE;
  const step = workflow.steps[stepIdx];

  function logEngine(kind, detail, trust) {
    setEngineLog((log) => [...log, { ts: new Date().toISOString(), kind, detail, trust: trust ?? null }]);
  }

  function requestGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("unavailable");
      logEngine("GPS", "Brak dostępu do lokalizacji w tym środowisku", "T4");
      return;
    }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) };
        setGps(g); setGpsStatus("ok");
        logEngine("GPS", `Pozycja ustalona (±${g.acc} m)`, "T1");
      },
      () => { setGpsStatus("denied"); logEngine("GPS", "Użytkownik nie udostępnił lokalizacji", "T4"); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function startWorkflow(evt) {
    const c = { country: "DE", event: evt, vehicle: "TRUCK", connectivity: online ? "ONLINE" : "OFFLINE", language: "pl" };
    const wf = matchRule(c);
    if (!wf) return;
    setActiveEvent(evt);
    setStepIdx(0); setKnowledgeUsed([]); setTrustSeen([]);
    setTransInput(""); setTransLog([]); setChatQ(""); setChatLog([]); setOutcome(null);
    setPhotos([]); setGps(null); setGpsStatus("idle"); setDecision({});
    const t0 = new Date().toISOString();
    setStartedAt(t0);
    setEngineLog([
      { ts: t0, kind: "CONTEXT", detail: `Kontekst: ${c.country} · ${evt} · ${c.vehicle} · ${c.connectivity}`, trust: "T1" },
      { ts: t0, kind: "DECISION", detail: `Reguła (deterministyczna) → ${wf}`, trust: "T1" },
    ]);
    // PRIV-1: NIE przechwytujemy GPS automatycznie na starcie. Lokalizacja jest
    // pobierana tylko za świadomą zgodą usera, przy zabezpieczaniu dowodu.
    setScreen("workflow");
  }

  function resolveStep(s) {
    return resolveStepTrust(s, { online });
  }

  function pushTranslate(input) {
    const t = input.trim();
    if (!t) return;
    if (transDir === "PL_DE") {
      const de = simulateTranslate(t);
      setTransLog((log) => [...log, { dir: "PL_DE", src: t, out: de }]);
      logEngine("TRANSLATE", `PL→DE: "${t}" → "${de}"`, "T3");
    } else {
      const pl = simulateTranslateDE(t);
      setTransLog((log) => [...log, { dir: "DE_PL", src: t, out: pl }]);
      logEngine("TRANSLATE", `DE→PL: "${t}" → "${pl}"`, "T3");
    }
    setTrustSeen((tr) => [...new Set([...tr, "T3"])]);
    setTransInput("");
  }

  // Czat przechodzi przez AI Engine: grounding (zweryfikowany fakt) → opcjonalne
  // przeformułowanie przez realne AI (T3, tylko online+provider) → offline/brak = fakt T1 / T4.
  async function askChat() {
    const q = chatQ.trim();
    if (!q) return;
    const base = activeEvent === "ACCIDENT" ? QA_ACCIDENT : QA_INSPECTION;
    const grounding = answerFromBase(q, base); // zweryfikowany fakt (lub null)
    const id = ++msgIdRef.current;
    setChatQ("");
    setChatLog((log) => [...log, { id, q, pending: true }]);
    const r = await answerGrounded({
      question: q, grounding, context: ctx, online,
      noFactText: "Brak zweryfikowanej wiedzy na to pytanie. Trzymaj się pokazanych kroków. To nie jest porada prawna.",
    });
    setChatLog((log) => log.map((m) => (m.id === id ? { id, q, ...r, pending: false } : m)));
    setTrustSeen((t) => [...new Set([...t, r.trust])]);
    logEngine("AI_CHAT", `Pytanie: "${q}" → ${r.trust} · ${r.origin}${r.src ? " · źródło: " + r.src : ""}`, r.trust);
  }

  function recordAndAdvance(dir) {
    if (dir === "next") {
      const r = resolveStep(step);
      if (r.knowledge) {
        setKnowledgeUsed((k) => [...new Set([...k, r.knowledge.versionId])]);
        logEngine("KNOWLEDGE", `Pokazano wiedzę ${r.knowledge.ref} (${r.knowledge.versionId})`, r.trust);
      }
      if (step.kind === "TIR_DOCS") {
        setKnowledgeUsed((k) => [...new Set([...k, TIR_DOCS.versionId])]);
        logEngine("KNOWLEDGE", `Pokazano listę dokumentów (${TIR_DOCS.versionId})`, "T1");
      }
      if (step.kind === "TRANSLATE") {
        logEngine("STEP", r.fellBack ? "Tłumacz: OFFLINE → karta zwrotów" : "Tłumacz: ONLINE → tłumaczenie na żywo", r.trust);
      }
      if (step.kind === "DECISION_POINT") {
        const mustCall = policeRequired(decision);
        const yes = POLICE_TRIGGERS.filter((t) => decision[t.id] === true).map((t) => t.id);
        logEngine("DECISION", mustCall ? `Policja WYMAGANA (przesłanki: ${yes.join(", ")})` : "Policja niewymagana → Europejskie oświadczenie", "T1");
      }
      if (r.trust && step.kind !== "AI_CHAT") setTrustSeen((t) => [...new Set([...t, r.trust])]);
      if (stepIdx + 1 >= workflow.steps.length) setScreen("report");
      else { setStepIdx(stepIdx + 1); setTransLog([]); setTransInput(""); }
    } else {
      if (stepIdx === 0) setScreen("home");
      else { setStepIdx(stepIdx - 1); setTransLog([]); setTransInput(""); }
    }
  }

  /* ---------- EKRAN STARTOWY ---------- */
  if (screen === "home") {
    return (
      <div style={wrap}>
        <Header online={online} setOnline={setOnline} title="Zdarzenie" onExit={onExit} />
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, color: "#6B7280", fontFamily: "ui-monospace, monospace", letterSpacing: "0.02em" }}>Niemcy · ciężarówka · kierowca zawodowy</div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "6px 0 0", letterSpacing: "-0.02em" }}>Co się stało?</h1>
            <p style={{ color: "#9AA0AA", fontSize: 14, margin: "8px 0 0" }}>Powiedz, co się dzieje — pokażę ci, co zrobić krok po kroku.</p>
          </div>
          <button style={{ ...bigBtn, background: "#C1121F", color: "#fff", marginTop: 8 }} onClick={() => startWorkflow("ROAD_INSPECTION")}>
            🚨 Kontrola drogowa
          </button>
          <button style={{ ...bigBtn, background: "#C1121F", color: "#fff" }} onClick={() => startWorkflow("ACCIDENT")}>
            💥 Wypadek / kolizja
          </button>
          <button style={{ ...bigBtn, background: "#171B22", color: "#5A6270", border: "1px solid #232833", cursor: "not-allowed" }} disabled>
            Awaria · wkrótce
          </button>
        </div>
        <Foot />
      </div>
    );
  }

  /* ---------- WORKFLOW ---------- */
  if (screen === "workflow") {
    const r = resolveStep(step);
    const k = r.knowledge;
    const isLast = stepIdx + 1 >= workflow.steps.length;
    return (
      <div style={wrap}>
        <Header online={online} setOnline={setOnline} title="DriverOS" />
        <div style={{ padding: "10px 20px", display: "flex", gap: 4 }}>
          {workflow.steps.map((s, i) => (
            <div key={s.id} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= stepIdx ? "#C1121F" : "#232833" }} />
          ))}
        </div>
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#6B7280", fontFamily: "ui-monospace, monospace" }}>
              Krok {stepIdx + 1}/{workflow.steps.length}
            </div>
            {r.trust && <TrustBadge level={r.trust} tag={r.tag} labelOverride={r.label} />}
          </div>
          <h2 style={{ fontSize: 23, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{step.title}</h2>

          {step.kind === "CONDUCT_CARD" && (
            <div style={{ ...card, borderColor: "#1B7F4B33" }}>
              {CONDUCT_DE.rules.map((u, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", fontSize: 16, alignItems: "baseline" }}>
                  <span style={{ color: "#1B7F4B", fontWeight: 800 }}>✓</span>{u}
                </div>
              ))}
            </div>
          )}

          {step.kind === "SAFETY_CARD" && (
            <div style={{ ...card, borderColor: "#C1121F44" }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>{ACC_SAFETY.ref}</div>
              {ACC_SAFETY.rules.map((u, i) => (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", fontSize: 16, alignItems: "baseline" }}>
                  <span style={{ color: "#C1121F", fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{i + 1}</span>{u}
                </div>
              ))}
            </div>
          )}

          {step.kind === "INJURED_CARD" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ ...card, borderColor: "#C1121F44" }}>
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  {ACC_INJURED.contacts.map((c) => (
                    <a key={c.number} href={`tel:${c.number}`} style={{ flex: 1, textAlign: "center", padding: "14px 0", background: "#C1121F", color: "#fff", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>
                      {c.label}<br /><span style={{ fontSize: 24 }}>{c.number}</span>
                    </a>
                  ))}
                </div>
                {ACC_INJURED.steps.map((u, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", fontSize: 15, alignItems: "baseline" }}>
                    <span style={{ color: "#C1121F", fontWeight: 800 }}>•</span>{u}
                  </div>
                ))}
              </div>

              <details style={{ ...card, padding: 0, overflow: "hidden" }}>
                <summary style={{ cursor: "pointer", padding: 16, fontSize: 15, fontWeight: 700, color: "#C1121F", listStyle: "none" }}>❤️ Jak wykonać resuscytację (RKO)</summary>
                <div style={{ padding: "0 16px 16px" }}>
                  {ACC_INJURED.cpr.map((u, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, padding: "7px 0", fontSize: 15, alignItems: "baseline" }}>
                      <span style={{ color: "#C1121F", fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{i + 1}</span>{u}
                    </div>
                  ))}
                  <div style={{ fontSize: 13, color: "#9AA0AA", marginTop: 8, fontStyle: "italic" }}>Trzymaj telefon na głośniku — dyspozytor 112 poprowadzi cię krok po kroku.</div>
                </div>
              </details>

              <div style={{ ...card, background: "#1A1310", borderColor: "#C1121F33" }}>
                <div style={{ fontSize: 12, color: "#D98880", marginBottom: 8, fontWeight: 700 }}>OBOWIĄZEK PRAWNY · {ACC_INJURED.ref}</div>
                {ACC_INJURED.legal.map((x, i) => (
                  <div key={i} style={{ fontSize: 14, padding: "5px 0", lineHeight: 1.4 }}>{x}</div>
                ))}
              </div>
            </div>
          )}

          {step.kind === "DECISION_POINT" && (() => {
            const answered = policeAnswered(decision);
            const mustCall = policeRequired(decision);
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: "#6B7280" }}>Odpowiedz — silnik zdecyduje, czy policja jest obowiązkowa.</div>
                {POLICE_TRIGGERS.map((t) => (
                  <div key={t.id} style={{ ...card, padding: 14 }}>
                    <div style={{ fontSize: 15, marginBottom: 10 }}>{t.q}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[["Tak", true], ["Nie", false]].map(([lbl, val]) => {
                        const sel = decision[t.id] === val;
                        return (
                          <button key={lbl} onClick={() => setDecision((d) => ({ ...d, [t.id]: val }))} style={{
                            flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", fontSize: 15, fontWeight: 700,
                            border: sel ? `1px solid ${val ? "#C1121F" : "#1B7F4B"}` : "1px solid #232833",
                            background: sel ? (val ? "#C1121F" : "#1B7F4B") + "22" : "#0E1117",
                            color: sel ? (val ? "#C1121F" : "#5FA777") : "#9AA0AA",
                          }}>{lbl}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {answered && (
                  <div style={{ ...card, borderColor: mustCall ? "#C1121F" : "#1B7F4B", background: (mustCall ? "#C1121F" : "#1B7F4B") + "14" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <TrustBadge level="T1" labelOverride="Decyzja silnika" />
                    </div>
                    {mustCall ? (
                      <>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#C1121F" }}>Wezwij policję — 110</div>
                        <div style={{ fontSize: 14, color: "#9AA0AA", marginTop: 6 }}>Co najmniej jedna przesłanka spełniona. Zadzwoń i zaczekaj na przyjazd.</div>
                        <a href="tel:110" style={{ display: "block", textAlign: "center", marginTop: 12, padding: "14px 0", background: "#C1121F", color: "#fff", borderRadius: 12, textDecoration: "none", fontWeight: 700, fontSize: 18 }}>Zadzwoń 110</a>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 18, fontWeight: 800, color: "#5FA777" }}>Policja nie jest wymagana</div>
                        <div style={{ fontSize: 14, color: "#9AA0AA", marginTop: 6 }}>Wystarczy Europejskie oświadczenie o wypadku. Możecie je spisać, jeśli obie strony się zgadzają.</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {step.kind === "EXCHANGE_DATA" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ ...card }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>{ACC_EXCHANGE.ref}</div>
                <div style={{ fontSize: 12, color: "#5FA777", marginBottom: 8, fontWeight: 700 }}>SPISZ OD DRUGIEGO KIEROWCY</div>
                {ACC_EXCHANGE.fields.map((x, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 15, alignItems: "baseline" }}>
                    <span style={{ color: "#1B7F4B" }}>✓</span>{x}
                  </div>
                ))}
              </div>
              <div style={{ ...card, background: "#1A1310", borderColor: "#C1121F33" }}>
                <div style={{ fontSize: 12, color: "#D98880", marginBottom: 8, fontWeight: 700 }}>UWAGA — WAŻNE PRAWNIE</div>
                {ACC_EXCHANGE.warnings.map((x, i) => (
                  <div key={i} style={{ fontSize: 14, padding: "5px 0", lineHeight: 1.4 }}>{x}</div>
                ))}
              </div>
            </div>
          )}

          {step.kind === "SHOW_KNOWLEDGE" && k && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ ...card }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>{k.ref} · {k.versionId}</div>
                {k.actions.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, padding: "8px 0", fontSize: 16, alignItems: "baseline" }}>
                    <span style={{ color: "#C1121F", fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{i + 1}</span>{a}
                  </div>
                ))}
              </div>
              <div style={{ ...card, background: "#12180F", borderColor: "#1B7F4B33" }}>
                <div style={{ fontSize: 12, color: "#5FA777", marginBottom: 8, fontWeight: 700 }}>TWOJE PRAWA</div>
                {k.rights.map((x, i) => <div key={i} style={{ fontSize: 15, padding: "4px 0" }}>{x}</div>)}
              </div>
              <div style={{ ...card, background: "#1A1310", borderColor: "#C1121F33" }}>
                <div style={{ fontSize: 12, color: "#D98880", marginBottom: 8, fontWeight: 700 }}>CZEGO NIE ROBIĆ</div>
                {k.warnings.map((x, i) => <div key={i} style={{ fontSize: 15, padding: "4px 0" }}>{x}</div>)}
              </div>
            </div>
          )}

          {step.kind === "TIR_DOCS" && (
            <div style={{ ...card }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 12, fontFamily: "ui-monospace, monospace" }}>{TIR_DOCS.ref} · {TIR_DOCS.versionId}</div>
              {TIR_DOCS.items.map((it, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid #232833" }}>
                  <div style={{ fontSize: 16, fontWeight: 600, display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ color: "#1B7F4B" }}>✓</span>{it.t}
                  </div>
                  <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2, marginLeft: 26 }}>{it.d}</div>
                </div>
              ))}
            </div>
          )}

          {step.kind === "AI_CHAT" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#2563C9", fontFamily: "ui-monospace, monospace" }}>{activeEvent === "ACCIDENT" ? "Pytaj o wypadek" : "Pytaj o kontrolę"} · odpowiedzi z bazy wiedzy</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(activeEvent === "ACCIDENT"
                  ? ["muszę wzywać policję?", "kto jest winny?", "co z oświadczeniem?", "mogę odjechać?"]
                  : ["ile dni tacho?", "muszę oddać CMR?", "kto może kontrolować?", "co mogą sprawdzić?"]
                ).map((s) => (
                  <button key={s} onClick={() => setChatQ(s)} style={{ padding: "8px 12px", borderRadius: 20, background: "#171B22", border: "1px solid #232833", color: "#9AA0AA", fontSize: 13, cursor: "pointer" }}>{s}</button>
                ))}
              </div>
              {chatLog.map((m, i) => (
                <div key={m.id ?? i} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ alignSelf: "flex-end", background: "#2563C9", color: "#fff", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", fontSize: 15, maxWidth: "85%" }}>{m.q}</div>
                  <div style={{ alignSelf: "flex-start", background: "#171B22", border: "1px solid #232833", padding: "12px 14px", borderRadius: "14px 14px 14px 4px", fontSize: 15, maxWidth: "90%" }}>
                    {m.pending ? (
                      <div style={{ color: "#6B7280" }}>…</div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <TrustBadge level={m.trust} />
                        </div>
                        {m.text}
                        {m.src && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8, fontFamily: "ui-monospace, monospace" }}>źródło: {m.src}</div>}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={chatQ} onChange={(e) => setChatQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askChat()}
                  placeholder="Zadaj własne pytanie..."
                  style={{ width: "100%", boxSizing: "border-box", height: 52, background: "#0E1117", color: "#E8EAED", border: "1px solid #232833", borderRadius: 12, padding: "0 14px", fontSize: 16 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <MicButton onText={(t) => setChatQ(t)} />
                  <button onClick={askChat} disabled={!chatQ.trim()} style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: chatQ.trim() ? "#2563C9" : "#1B2230", color: chatQ.trim() ? "#fff" : "#5A6270", fontWeight: 700, fontSize: 16, cursor: chatQ.trim() ? "pointer" : "not-allowed" }}>Zapytaj</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", textAlign: "center" }}>Demo — odpowiedzi z bazy wiedzy. Prawdziwe AI po wpięciu silnika.</div>
            </div>
          )}

          {step.kind === "TRANSLATE" && !r.fellBack && (() => {
            const plMode = transDir === "PL_DE";
            const chips = plMode ? QUICK_TRANSLATE.map((q) => ({ tap: q.label, show: q.label })) : QUICK_DE.map((q) => ({ tap: q.full, show: q.label }));
            return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", background: "#171B22", borderRadius: 12, padding: 4, border: "1px solid #232833" }}>
                <button onClick={() => setTransDir("PL_DE")} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: plMode ? "#2563C9" : "transparent", color: plMode ? "#fff" : "#9AA0AA" }}>Ja → policjant<div style={{ fontSize: 11, fontWeight: 400, fontFamily: "ui-monospace, monospace" }}>PL → DE</div></button>
                <button onClick={() => setTransDir("DE_PL")} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: !plMode ? "#2563C9" : "transparent", color: !plMode ? "#fff" : "#9AA0AA" }}>Policjant → ja<div style={{ fontSize: 11, fontWeight: 400, fontFamily: "ui-monospace, monospace" }}>DE → PL</div></button>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280" }}>{plMode ? "Wpisz po polsku — pokażę zdanie do odczytania policjantowi." : "Wpisz lub podyktuj, co powiedział policjant — przetłumaczę na polski."}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {chips.map((q) => (
                  <button key={q.show} onClick={() => pushTranslate(q.tap)} style={{ padding: "8px 12px", borderRadius: 20, background: "#171B22", border: "1px solid #232833", color: "#9AA0AA", fontSize: 13, cursor: "pointer" }}>{q.show}</button>
                ))}
              </div>
              {transLog.map((m, i) => (
                <div key={i} style={{ ...card, padding: 16, borderColor: "#2563C933" }}>
                  <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>{m.src}</div>
                  <div style={{ fontSize: 11, color: "#2563C9", marginBottom: 4, fontFamily: "ui-monospace, monospace" }}>{m.dir === "PL_DE" ? "POKAŻ / ODCZYTAJ POLICJANTOWI" : "CO POWIEDZIAŁ POLICJANT"}</div>
                  <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.3 }}>„{m.out}"</div>
                </div>
              ))}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={transInput} onChange={(e) => setTransInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && pushTranslate(transInput)}
                  placeholder={plMode ? "Wpisz własne zdanie po polsku..." : "Wpisz/podyktuj, co powiedział policjant..."}
                  style={{ width: "100%", boxSizing: "border-box", height: 52, background: "#0E1117", color: "#E8EAED", border: "1px solid #232833", borderRadius: 12, padding: "0 14px", fontSize: 16 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <MicButton onText={(t) => setTransInput(t)} />
                  <button onClick={() => pushTranslate(transInput)} disabled={!transInput.trim()} style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: transInput.trim() ? "#2563C9" : "#1B2230", color: transInput.trim() ? "#fff" : "#5A6270", fontWeight: 700, fontSize: 16, cursor: transInput.trim() ? "pointer" : "not-allowed" }}>Przetłumacz</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", textAlign: "center" }}>Demo — słownik zaślepkowy. Prawdziwy tłumacz AI po wpięciu silnika.</div>
            </div>
            );
          })()}

          {step.kind === "TRANSLATE" && r.fellBack && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 13, color: "#8A8F98", fontFamily: "ui-monospace, monospace" }}>OFFLINE — karta zwrotów (działa bez sieci)</div>
              {PHRASES.map((grp) => (
                <div key={grp.group} style={{ ...card, padding: 16 }}>
                  <div style={{ fontSize: 12, color: grp.color, fontWeight: 700, marginBottom: 10, letterSpacing: "0.02em", textTransform: "uppercase" }}>{grp.group}</div>
                  {grp.items.map((it, i) => (
                    <div key={i} style={{ padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid #232833" }}>
                      <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.3 }}>„{it.de}"</div>
                      <div style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>{it.pl}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {step.kind === "CAPTURE_PHOTO" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ ...card, textAlign: "center", padding: 28 }}>
                <div style={{ fontSize: 40 }}>📷</div>
                <p style={{ color: "#9AA0AA", fontSize: 15, margin: "8px 0 12px" }}>Zdjęcia dokumentów lub mandatu trafiają do raportu.</p>
                {/* PRIV-1: lokalizacja tylko za świadomą zgodą, na żądanie. */}
                <div style={{ marginBottom: 12 }}>
                  {gpsStatus === "ok" && gps ? (
                    <div style={{ fontSize: 12, color: "#5FA777", fontFamily: "ui-monospace, monospace" }}>📍 lokalizacja dołączona ({gps.lat.toFixed(4)}, {gps.lon.toFixed(4)})</div>
                  ) : (
                    <button onClick={requestGps} disabled={gpsStatus === "loading"} style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #232833", background: "#0E1117", color: "#9AA0AA", fontSize: 13, cursor: gpsStatus === "loading" ? "default" : "pointer" }}>
                      {gpsStatus === "loading" ? "📍 Ustalam…" : gpsStatus === "denied" ? "📍 Odmówiono — spróbuj ponownie" : "📍 Dołącz lokalizację (za zgodą)"}
                    </button>
                  )}
                </div>
                <button onClick={async () => {
                    const n = photos.length + 1;
                    const evId = `EV-${String(n).padStart(3, "0")}`;
                    const ts = new Date().toISOString();
                    const geo = gps ? { lat: gps.lat, lon: gps.lon, acc: gps.acc } : { status: gpsStatus };
                    const meta = { evId, seq: n, ts, gps: geo, workflow: workflow.id, hashScope: "metadata" };
                    const hash = await computeEvidenceHash(meta);
                    const photo = { ...meta, hash };
                    setPhotos((p) => [...p, photo]);
                    logEngine("EVIDENCE", `Dowód ${evId} · hash ${hash.slice(0, 12)}…`, "T1");
                  }}
                  style={{ padding: "12px 20px", borderRadius: 12, border: "1px solid #232833", background: "#0E1117", color: "#E8EAED", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  + Dodaj dowód (zdjęcie)
                </button>
                {photos.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, textAlign: "left" }}>
                    {photos.map((p) => (
                      <div key={p.evId} style={{ background: "#0E1117", border: "1px solid #232833", borderRadius: 10, padding: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontWeight: 700, fontFamily: "ui-monospace, monospace", fontSize: 13 }}>📷 {p.evId}</span>
                          <span style={{ fontSize: 11, color: "#9AA0AA", fontFamily: "ui-monospace, monospace" }}>zapis lokalny</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280", fontFamily: "ui-monospace, monospace", lineHeight: 1.5 }}>
                          {new Date(p.ts).toLocaleString("pl-PL")}<br />
                          GPS: {p.gps.lat ? `${p.gps.lat.toFixed(5)}, ${p.gps.lon.toFixed(5)}` : "niedostępny"}<br />
                          SHA-256 (metadanych): {p.hash.slice(0, 24)}…
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#9AA0AA", marginBottom: 10, fontWeight: 600 }}>{activeEvent === "ACCIDENT" ? "Jak zakończyło się zdarzenie?" : "Jak zakończyła się kontrola?"}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {outcomesFor(activeEvent).map((o) => {
                    const sel = outcome === o.id;
                    return (
                      <button key={o.id} onClick={() => { setOutcome(o.id); logEngine("OUTCOME", `Wynik kontroli: ${o.label} (${o.de})`, "T1"); }} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left",
                        padding: "14px 16px", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 600,
                        border: sel ? `1px solid ${o.color}` : "1px solid #232833",
                        background: sel ? o.color + "1F" : "#171B22", color: sel ? o.color : "#E8EAED",
                      }}>
                        <span>{o.label}</span>
                        <span style={{ fontSize: 11, color: "#6B7280", fontFamily: "ui-monospace, monospace", marginLeft: 10 }}>{o.de}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 20, borderTop: "1px solid #171B22", display: "flex", gap: 12 }}>
          <button style={{ ...bigBtn, flex: "0 0 auto", width: 64, background: "#171B22", color: "#E8EAED", border: "1px solid #232833", padding: "20px 0", fontSize: 22 }} onClick={() => recordAndAdvance("back")} aria-label="Wstecz">‹</button>
          {(() => {
            const blocked = step.kind === "DECISION_POINT" && !policeAnswered(decision);
            return (
              <button disabled={blocked} style={{ ...bigBtn, background: blocked ? "#2A2E37" : "#E8EAED", color: blocked ? "#5A6270" : "#0E1117", cursor: blocked ? "not-allowed" : "pointer" }} onClick={() => recordAndAdvance("next")}>
                {blocked ? "Odpowiedz na pytania" : (isLast ? "Utwórz raport" : "Dalej")}
              </button>
            );
          })()}
        </div>
      </div>
    );
  }

  function buildIncident() {
    const o = outcome ? findOutcome(activeEvent, outcome) : null;
    return {
      incidentId: `INC-${(startedAt || new Date().toISOString()).replace(/[:.TZ-]/g, "").slice(0, 14)}`,
      generatedAt: new Date().toISOString(),
      startedAt,
      workflow: { id: workflow.id, version: workflow.version },
      context: { country: ctx.country, event: ctx.event, vehicle: ctx.vehicle, connectivity: ctx.connectivity, language: ctx.language },
      gps: gps ? { ...gps } : { status: gpsStatus },
      knowledgeVersions: knowledgeUsed,
      trustLevelsSeen: trustSeen,
      outcome: o ? { id: o.id, label: o.label, de: o.de } : null,
      policeDecision: activeEvent === "ACCIDENT" ? (policeRequired(decision) ? "WYMAGANA" : "niewymagana") : null,
      photos,
      aiQuestions: chatLog.filter((m) => !m.pending).map((m) => ({ q: m.q, trust: m.trust, source: m.src || null })),
      translations: transLog.map((m) => ({ dir: m.dir, src: m.src, out: m.out })),
      engineLog,
      disclaimer: "Prototyp. Dane w pamięci. Nie stanowi porady prawnej.",
    };
  }

  // MOBILE-1: web-owa ścieżka pobrania. W WebView Capacitora bywa zawodna —
  // docelowo Capacitor Filesystem + Share. NIE połykamy błędu po cichu.
  function download(name, content, type) {
    try {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMsg({ ok: true, text: `Zapisano ${name}` });
      return true;
    } catch (e) {
      setExportMsg({ ok: false, text: "Nie udało się zapisać pliku w tym środowisku. Na telefonie wymaga natywnego zapisu (Capacitor Filesystem)." });
      return false;
    }
  }

  function exportPdf() {
    const inc = buildIncident();
    const esc = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const row = (l, v) => `<tr><td class="l">${esc(l)}</td><td class="v">${esc(v)}</td></tr>`;
    const gpsStr = inc.gps.lat ? `${inc.gps.lat.toFixed(5)}, ${inc.gps.lon.toFixed(5)} (±${inc.gps.acc} m)` : `niedostępny (${inc.gps.status || "-"})`;
    const ai = inc.aiQuestions.length ? inc.aiQuestions.map((a) => `<li><b>[${esc(a.trust)}]</b> „${esc(a.q)}"${a.source ? " — źródło: " + esc(a.source) : ""}</li>`).join("") : "<li>brak</li>";
    const tr = inc.translations.length ? inc.translations.map((t) => `<li><span class="mono">${esc(t.dir)}</span> „${esc(t.src)}" → „${esc(t.out)}"</li>`).join("") : "<li>brak</li>";
    const log = inc.engineLog.map((e) => `<div class="log">${esc(e.ts)} <b>[${esc(e.kind)}${e.trust ? "/" + esc(e.trust) : ""}]</b> ${esc(e.detail)}</div>`).join("");
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><title>${esc(inc.incidentId)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Arial, sans-serif; color: #111; margin: 32px; font-size: 13px; line-height: 1.5; }
        h1 { font-size: 20px; margin: 0 0 2px; }
        .id { font-family: ui-monospace, monospace; color: #555; font-size: 12px; margin-bottom: 18px; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #2563C9; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 22px 0 8px; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 4px 0; vertical-align: top; }
        td.l { color: #666; width: 170px; }
        td.v { font-weight: 600; }
        ul { margin: 4px 0; padding-left: 18px; }
        .mono { font-family: ui-monospace, monospace; color: #888; font-size: 11px; }
        .log { font-family: ui-monospace, monospace; font-size: 11px; color: #444; padding: 2px 0; }
        .foot { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; color: #888; font-size: 11px; }
      </style></head><body>
      <h1>Guardian · DriverOS — Raport zdarzenia</h1>
      <div class="id">${esc(inc.incidentId)}</div>
      <table>
        ${row("Rozpoczęto", inc.startedAt)}
        ${row("Wygenerowano", inc.generatedAt)}
        ${row("Workflow", inc.workflow.id + " · " + inc.workflow.version)}
        ${row("Kontekst", inc.context.country + " · " + inc.context.event + " · " + inc.context.vehicle + " · " + inc.context.connectivity)}
        ${row("GPS", gpsStr)}
        ${row("Wersje wiedzy", inc.knowledgeVersions.join(", ") || "—")}
        ${row("Poziomy zaufania", inc.trustLevelsSeen.join(", ") || "—")}
        ${row("Wynik kontroli", inc.outcome ? inc.outcome.label + " (" + inc.outcome.de + ")" : "—")}
        ${row("Zdjęcia", inc.photos.map((p) => p.evId).join(", ") || "brak")}
      </table>
      <h2>Pytania AI</h2><ul>${ai}</ul>
      <h2>Tłumaczenia</h2><ul>${tr}</ul>
      <h2>Dowody (Evidence Engine)</h2>${inc.photos.length ? inc.photos.map((p) => `<div class="log"><b>${esc(p.evId)}</b> · ${esc(p.ts)} · GPS: ${p.gps.lat ? esc(p.gps.lat.toFixed(5) + ", " + p.gps.lon.toFixed(5)) : "n/d"} · SHA-256: ${esc(p.hash)}</div>`).join("") : "<div class=\"log\">brak</div>"}
      <h2>Log decyzji silnika</h2>${log}
      <div class="foot">${esc(inc.disclaimer)}</div>
      </body></html>`;
    // MOBILE-1: window.open + print to idiom desktopu; w WebView Capacitora
    // zwykle nie zadziała — docelowo natywny plugin druku / render po stronie backendu.
    try {
      const w = window.open("", "_blank");
      if (!w) { setExportMsg({ ok: false, text: "Podgląd wydruku zablokowany (popup/WebView). Na telefonie użyj eksportu JSON lub natywnego druku." }); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400); // po załadowaniu -> okno druku -> Zapisz jako PDF
      setExportMsg({ ok: true, text: "Otwarto podgląd wydruku — wybierz „Zapisz jako PDF”." });
    } catch (e) {
      setExportMsg({ ok: false, text: "Nie udało się otworzyć podglądu wydruku w tym środowisku." });
    }
  }

  function exportJson() {
    const inc = buildIncident();
    download(`${inc.incidentId}.json`, JSON.stringify(inc, null, 2), "application/json");
  }

  /* ---------- RAPORT ---------- */
  if (screen === "report") return (
    <div style={wrap}>
      <Header online={online} setOnline={setOnline} title="DriverOS" />
      <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>✓</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px" }}>Raport zdarzenia</h2>
          <div style={{ fontSize: 12, color: "#6B7280", fontFamily: "ui-monospace, monospace" }}>{`INC-${(startedAt || "").replace(/[:.TZ-]/g, "").slice(0,14)}`}</div>
        </div>

        <div style={{ ...card, padding: 16 }}>
          <ReportRow label="Rozpoczęto" value={startedAt ? new Date(startedAt).toLocaleString("pl-PL") : "—"} />
          <ReportRow label="Workflow" value={`${workflow.id} · ${workflow.version}`} />
          <ReportRow label="Kontekst" value={`${ctx.country} · ${ctx.vehicle} · ${ctx.connectivity === "ONLINE" ? "online" : "offline"}`} />
          <ReportRow label="GPS" value={gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)} (±${gps.acc} m)` : `niedostępny (${gpsStatus})`} />
          <ReportRow label="Wersje wiedzy" value={knowledgeUsed.join(", ") || "—"} />
          <ReportRow label="Dowody (zdjęcia)" value={photos.length ? `${photos.length} szt. — zapis lokalny + hash metadanych` : "brak"} />
          {outcome && (() => { const o = findOutcome(activeEvent, outcome); return (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 14, gap: 12 }}>
              <span style={{ color: "#6B7280", flexShrink: 0 }}>Wynik</span>
              <span style={{ fontWeight: 700, color: o.color, textAlign: "right" }}>{o.label}<span style={{ display: "block", fontSize: 11, color: "#6B7280", fontFamily: "ui-monospace, monospace", fontWeight: 400 }}>{o.de}</span></span>
            </div>
          ); })()}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #232833" }}>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 8 }}>Poziomy zaufania</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {trustSeen.map((t) => <span key={t} style={{ padding: "5px 10px", borderRadius: 8, background: Trust[t].color + "22", color: Trust[t].color, fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace" }}>{t}</span>)}
              {!trustSeen.length && <span style={{ color: "#6B7280", fontSize: 13 }}>—</span>}
            </div>
          </div>
        </div>

        {chatLog.length > 0 && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#2563C9", fontWeight: 700, marginBottom: 8 }}>PYTANIA AI ({chatLog.filter((m) => !m.pending).length})</div>
            {chatLog.filter((m) => !m.pending).map((m, i) => (
              <div key={i} style={{ padding: "6px 0", borderTop: i === 0 ? "none" : "1px solid #232833", fontSize: 14 }}>
                <span style={{ color: Trust[m.trust].color, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>[{m.trust}]</span> {m.q}
                {m.src && <span style={{ color: "#6B7280", fontSize: 12 }}> — {m.src}</span>}
              </div>
            ))}
          </div>
        )}

        {transLog.length > 0 && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 12, color: "#2563C9", fontWeight: 700, marginBottom: 8 }}>TŁUMACZENIA ({transLog.length})</div>
            {transLog.map((m, i) => (
              <div key={i} style={{ padding: "6px 0", borderTop: i === 0 ? "none" : "1px solid #232833", fontSize: 14 }}>
                <span style={{ color: "#4B515C", fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{m.dir === "PL_DE" ? "PL→DE" : "DE→PL"}</span> <span style={{ color: "#6B7280" }}>{m.src}</span> → „{m.out}"
              </div>
            ))}
          </div>
        )}

        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#9AA0AA", fontWeight: 700, marginBottom: 10 }}>LOG DECYZJI SILNIKA</div>
          {engineLog.filter((e) => ["CONTEXT","DECISION","KNOWLEDGE","OUTCOME"].includes(e.kind)).map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 13, alignItems: "baseline" }}>
              <span style={{ color: "#4B515C", fontFamily: "ui-monospace, monospace", fontSize: 11, flexShrink: 0 }}>{new Date(e.ts).toLocaleTimeString("pl-PL")}</span>
              {e.trust && <span style={{ color: Trust[e.trust].color, fontFamily: "ui-monospace, monospace", fontSize: 11 }}>{e.trust}</span>}
              <span>{e.detail}</span>
            </div>
          ))}
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "#6B7280", fontFamily: "ui-monospace, monospace" }}>Pełny log techniczny ({engineLog.length} zdarzeń)</summary>
            <div style={{ marginTop: 8 }}>
              {engineLog.map((e, i) => (
                <div key={i} style={{ padding: "3px 0", fontSize: 11, fontFamily: "ui-monospace, monospace", color: "#8A8F98", wordBreak: "break-word" }}>
                  {e.ts} [{e.kind}{e.trust ? "/" + e.trust : ""}] {e.detail}
                </div>
              ))}
            </div>
          </details>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportPdf} style={{ flex: 1, height: 52, borderRadius: 12, border: "none", background: "#2563C9", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Eksport PDF</button>
          <button onClick={exportJson} style={{ flex: 1, height: 52, borderRadius: 12, border: "1px solid #232833", background: "#171B22", color: "#E8EAED", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Eksport JSON</button>
        </div>
        {exportMsg && (
          <div style={{ fontSize: 13, textAlign: "center", padding: "8px 12px", borderRadius: 10, background: (exportMsg.ok ? "#1B7F4B" : "#C1121F") + "1A", color: exportMsg.ok ? "#5FA777" : "#D98880" }}>{exportMsg.text}</div>
        )}
        <p style={{ fontSize: 12, color: "#6B7280", textAlign: "center", lineHeight: 1.5 }}>
          Raport zawiera pełny ślad: kontekst, decyzje silnika, wersje wiedzy, pytania AI i tłumaczenia — materiał do odwołania.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ ...bigBtn, flex: "0 0 auto", width: 64, background: "#171B22", color: "#E8EAED", border: "1px solid #232833", padding: "18px 0", fontSize: 22 }} onClick={() => { setStepIdx(workflow.steps.length - 1); setScreen("workflow"); }} aria-label="Wstecz">‹</button>
          <button style={{ ...bigBtn, background: "#171B22", color: "#E8EAED", border: "1px solid #232833" }} onClick={() => setScreen("home")}>Powrót do startu</button>
        </div>
      </div>
      <Foot />
    </div>
  );

  return null; // STYLE-1: jawny fallback zamiast niejawnego raportu
}

function Header({ online, setOnline, title, onExit }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #171B22" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {onExit && <button onClick={onExit} style={{ background: "none", border: "none", color: "#E8EAED", fontSize: 20, cursor: "pointer", padding: 0 }}>‹</button>}
        <div style={{ fontWeight: 800, letterSpacing: "-0.02em", fontSize: 17 }}>
          Driver<span style={{ color: "#C1121F" }}>OS</span>
        </div>
      </div>
      <button onClick={() => setOnline((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 7, background: "none", border: "1px solid #232833", borderRadius: 20, padding: "6px 12px", cursor: "pointer", color: online ? "#5FA777" : "#8A8F98", fontSize: 13, fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: online ? "#1B7F4B" : "#8A8F98" }} />
        {online ? "Online" : "Offline"}
      </button>
    </div>
  );
}
function ReportRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 14, gap: 12 }}>
      <span style={{ color: "#6B7280", flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, fontFamily: "ui-monospace, monospace", fontSize: 12.5, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}
function Foot() {
  return <div style={{ padding: "14px 20px", textAlign: "center", fontSize: 11, color: "#4B515C", fontFamily: "ui-monospace, monospace" }}>Prototyp · dane w pamięci · nie do rzeczywistego użytku</div>;
}
