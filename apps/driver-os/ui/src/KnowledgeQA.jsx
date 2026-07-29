// KnowledgeQA.jsx — kafelek "Zapytaj", zakotwiczony w Knowledge Engine.
// Zasada (konstytucja Guardian + Artefakt #0004): AI nigdy nie dostaje surowego
// pytania. Odpowiedź WYWODZI SIĘ z treści (246 pozycji), Trust Badge mówi userowi
// na czym stoi, brak trafienia => T4 "nie wiem, sprawdź moduł".
//
// KROK 1 (ten plik): retrieval deterministyczny, offline, na Twojej treści.
// KROK 2 (później): ta sama funkcja retrieveGrounding() karmi AI przez backend —
//   AI tylko PRZEFORMUŁOWUJE znaleziony fakt, nie wymyśla. UI się nie zmienia.

import React, { useState } from "react";
import { retrieveBest } from "./engine/retrieval.js";

/* ---------- RETRIEVAL: pytanie -> najlepszy fakt z Twojej treści ----------
   Tokenizer i scoring żyją teraz we wspólnym engine/retrieval.js (fix DUP-1). */

/** Buduje tekst przeszukiwalny faktu z jego treści (pytania, uzasadnienie, odpowiedzi). */
function factText(f) {
  const parts = [f.why || "", f.topic || "", f.block || ""];
  const q = f.q || {};
  for (const fmt of Object.keys(q)) {
    const item = q[fmt];
    if (!item) continue;
    if (item.prompt) parts.push(item.prompt);
    if (item.correct) parts.push(Array.isArray(item.correct) ? item.correct.join(" ") : String(item.correct));
    if (item.options) parts.push(item.options.join(" "));
    if (item.pairs) parts.push(Object.entries(item.pairs).flat().join(" "));
  }
  return parts.join(" ");
}

/**
 * retrieveGrounding — serce kafelka. Zwraca najlepiej pasujący fakt + score.
 * To jest funkcja, którą w KROKU 2 wywoła backend, by zbudować kontekst dla AI.
 */
export function retrieveGrounding(question, ALL) {
  const r = retrieveBest(question, ALL, factText);
  return r ? { fact: r.item, score: r.score } : null;
}

/** Buduje odpowiedź dla usera z trafionego faktu — z treści, nie z AI. */
function answerFrom(grounding) {
  if (!grounding) {
    return {
      trust: "T4",
      text: "Nie mam na to zweryfikowanej odpowiedzi. Wejdź w odpowiedni moduł treningu albo trzymaj się oficjalnych źródeł. To nie jest porada prawna.",
      fact: null,
    };
  }
  const f = grounding.fact;
  return {
    trust: "T1",                     // treść pochodzi z Twojej zweryfikowanej bazy
    text: f.why || "Zobacz szczegóły w module.",
    fact: f,
  };
}

/* ---------- EKRAN "ZAPYTAJ" ---------- */
export default function KnowledgeQA({ ALL, MODULES, C, TrustBadge, onExit, onOpenModule }) {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState(null);
  const [history, setHistory] = useState([]);

  function ask(text) {
    const question = (text ?? q).trim();
    if (!question) return;
    const grounding = retrieveGrounding(question, ALL);
    const a = answerFrom(grounding);
    setAnswer({ question, ...a });
    setHistory((h) => [{ question, trust: a.trust }, ...h].slice(0, 5));
    setQ("");
  }

  const moduleTitle = (id) => (MODULES.find((m) => m.id === id) || {}).title || id;
  const suggestions = ["Ile dni tacho na kontroli?", "Po ilu godzinach jazdy przerwa?", "Co grozi za brak wyposażenia ADR?", "Jak zabezpieczyć ładunek?"];

  return (
    <div style={wrap(C)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${C.card}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onExit} style={{ background: "none", border: "none", color: C.text, fontSize: 20, cursor: "pointer", padding: 0 }}>‹</button>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>Driver<span style={{ color: C.red }}>OS</span><span style={{ color: C.dim, fontWeight: 600, fontSize: 13, marginLeft: 8 }}>Zapytaj</span></div>
        </div>
      </div>

      <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
        {!answer && (
          <div style={{ marginTop: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>O co chcesz zapytać?</h1>
            <p style={{ color: "#9AA0AA", fontSize: 14, margin: "8px 0 0", lineHeight: 1.5 }}>
              Odpowiadam wyłącznie z <span style={{ color: C.greenLite }}>zweryfikowanej wiedzy</span> DriverOS. Jeśli czegoś nie wiem — powiem wprost.
            </p>
          </div>
        )}

        {answer && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 13, color: C.dim, fontFamily: C.mono }}>Pytanie: {answer.question}</div>
            <div style={{ ...card(C), borderColor: (answer.trust === "T4" ? C.amber : C.green) + "55" }}>
              <TrustBadge level={answer.trust} tag={answer.fact ? moduleTitle(answer.fact.module) : "brak źródła"} />
              <p style={{ fontSize: 15, color: C.text, lineHeight: 1.55, margin: "14px 0 0" }}>{answer.text}</p>
              {answer.fact && (
                <>
                  <div style={{ marginTop: 12, fontSize: 11, color: C.dim, fontFamily: C.mono }}>{answer.fact.adrRef || answer.fact.ref || ""}</div>
                  <button onClick={() => onOpenModule(answer.fact.module)} style={{ ...smallBtn(C), marginTop: 14 }}>
                    Ćwicz w module: {moduleTitle(answer.fact.module)} →
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {!answer && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, color: C.dim, fontFamily: C.mono }}>PRZYKŁADY</div>
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)} style={{ textAlign: "left", padding: "12px 14px", borderRadius: 10, background: C.card, border: `1px solid ${C.line}`, color: C.text, fontSize: 14, cursor: "pointer" }}>{s}</button>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginBottom: 8 }}>OSTATNIE</div>
            {history.map((h, i) => (
              <button key={i} onClick={() => ask(h.question)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 0", background: "none", border: "none", borderTop: `1px solid ${C.card}`, color: C.dim, fontSize: 13, cursor: "pointer" }}>{h.question}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${C.card}`, display: "flex", gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Wpisz pytanie…"
          style={{ flex: 1, padding: "14px 16px", borderRadius: 12, background: C.card, color: C.text, border: `1px solid ${C.edge}`, fontSize: 15, outline: "none" }} />
        <button onClick={() => ask()} disabled={!q.trim()} style={{ padding: "0 20px", borderRadius: 12, border: "none", background: q.trim() ? C.red : C.line, color: q.trim() ? "#fff" : C.faint, fontSize: 15, fontWeight: 800, cursor: q.trim() ? "pointer" : "not-allowed" }}>Zapytaj</button>
      </div>

      <div style={{ padding: "10px 20px 16px", textAlign: "center", fontSize: 10, color: C.faint, fontFamily: C.mono, lineHeight: 1.5 }}>
        Odpowiedzi z wiedzy DriverOS. Pomoc do nauki — nie porada prawna. Brak odpowiedzi = trzymaj się oficjalnych źródeł.
      </div>
    </div>
  );
}

const wrap = (C) => ({ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" });
const card = (C) => ({ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 });
const smallBtn = (C) => ({ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1px solid ${C.line}`, background: "transparent", color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer" });
