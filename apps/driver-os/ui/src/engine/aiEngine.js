// engine/aiEngine.js — SZEW realnego AI. Konstytucja Guardian: AI NIGDY nie jest
// źródłem prawdy. AI dostaje TYLKO zweryfikowany fakt (grounding) + kontekst i go
// PRZEFORMUŁOWUJE. Bez sieci lub bez wpiętego providera => null (spadamy do faktu
// T1 albo do T4). To domyka GAP-1 (offline nic nie udaje) i TRUST-1 (T3 tylko dla AI).

let _provider = null;

/** Wpina providera AI (async ({question, grounding, context}) => string|null). */
export function setAIProvider(fn) { _provider = typeof fn === "function" ? fn : null; }
export function getAIProvider() { return _provider; }

/**
 * reformulate — jedyna ścieżka mogąca zwrócić T3. Network-gated i grounding-gated.
 * Zwraca null gdy: offline, brak providera, brak groundingu, błąd providera.
 */
export async function reformulate({ question, grounding, context, online = true } = {}) {
  if (!online || !_provider || !grounding) return null;
  try {
    const text = await _provider({ question, grounding, context });
    return text ? { trust: "T3", text: String(text), origin: "ai" } : null;
  } catch (_e) {
    return null; // błąd providera => cichy fallback do zweryfikowanego faktu
  }
}

/**
 * answerGrounded — pełna orkiestracja odpowiedzi.
 *  - brak groundingu            -> T4 (tryb awaryjny, bez zmyślania)
 *  - grounding + AI (online)     -> T3, przeformułowany, ze źródłem faktu
 *  - grounding bez AI (offline)  -> zweryfikowany fakt na jego trust (T1)
 */
export async function answerGrounded({ question, grounding, context, online = true, noFactText = "Brak zweryfikowanej wiedzy." } = {}) {
  if (!grounding) return { trust: "T4", text: noFactText, src: null, origin: "none" };
  const ai = await reformulate({ question, grounding, context, online });
  if (ai) return { trust: "T3", text: ai.text, src: grounding.src ?? null, origin: "ai", grounding: grounding.text };
  return { trust: grounding.trust ?? "T1", text: grounding.text, src: grounding.src ?? null, origin: "base" };
}

/**
 * createBackendProvider — provider oparty o backend proxy.
 * KLUCZ API NIGDY w apce — apka zna tylko URL proxy. Kontrakt:
 *   POST endpoint  {question, grounding, context}  ->  200 {text}
 * Backend (prompt) egzekwuje: model MA przeformułować grounding, nie dodawać faktów.
 */
export function createBackendProvider(endpoint, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  return async ({ question, grounding, context }) => {
    if (!f) return null;
    const res = await f(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, grounding, context }),
    });
    if (!res || !res.ok) return null;
    const data = await res.json();
    return data && data.text ? data.text : null;
  };
}
