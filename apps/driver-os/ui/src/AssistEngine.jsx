// AssistEngine.jsx — the FIRST DriverOS screen driven by the real Guardian
// Engine core (M5.1), not by the prototype's in-JSX engines.
//
// It talks only to useWorkflow (→ composed IWorkflowPort). It contains zero
// business logic: it renders whatever StepExecutionResult the engine returns
// and sends the user's action back. This is the pattern the rest of the shell
// migrates onto in M5.2. The prototype's own DriverOS assist screen stays as-is
// alongside this until that migration; this proves the seam end to end.

import React from "react";
import { TrustBadge } from "./DriverOS.jsx";
import { C } from "./theme.js";
import { useRuntime, useWorkflow } from "./platform/useWorkflow.js";

// Engine TrustLevel enum values are "T1_VERIFIED" | "T2_VERIFIED_STALE" |
// "T3_AI_ASSISTED" | "T4_FALLBACK"; TrustBadge wants the short code T1..T4.
const shortTrust = (level) => (level ? String(level).split("_")[0] : null);

const wrap = { maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" };
const card = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 20 };
const btn = { width: "100%", padding: "16px 20px", fontSize: 16, fontWeight: 700, border: "none", borderRadius: 14, cursor: "pointer", letterSpacing: "-0.01em" };

export default function AssistEngine({ onExit }) {
  const { runtime, ready, error: rtError } = useRuntime();
  const wf = useWorkflow(runtime);

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${C.card}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onExit} style={{ background: "none", border: "none", color: C.text, fontSize: 20, cursor: "pointer", padding: 0 }}>‹</button>
        <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em" }}>
          Driver<span style={{ color: C.red }}>OS</span>
          <span style={{ color: C.dim, fontWeight: 600, fontSize: 13, marginLeft: 8 }}>Asysta · silnik</span>
        </div>
      </div>
      <span style={{ fontSize: 11, color: C.faint, fontFamily: C.mono }}>core</span>
    </div>
  );

  if (rtError) {
    return (
      <div style={wrap}>
        {header}
        <div style={{ padding: 20 }}>
          <div style={{ ...card, borderColor: C.danger }}>
            <div style={{ color: C.danger, fontWeight: 700, marginBottom: 6 }}>Silnik nie wystartował</div>
            <div style={{ color: C.dim, fontSize: 13 }}>{String(rtError.message)}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div style={wrap}>
        {header}
        <div style={{ padding: 20, color: C.dim }}>Uruchamianie silnika Guardian…</div>
      </div>
    );
  }

  // Catalog picker — no workflow started yet.
  if (!wf.instance) {
    return (
      <div style={wrap}>
        {header}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ color: C.dim, fontSize: 14 }}>Wybierz sytuację. Prowadzi silnik — Ty tylko potwierdzasz kolejny krok.</div>
          {runtime.catalog.map((w) => (
            <button
              key={String(w.id)}
              disabled={wf.busy}
              onClick={() => wf.start(w.id)}
              style={{ ...btn, background: C.card, color: C.text, border: `1px solid ${C.edge}`, textAlign: "left" }}
            >
              {w.label}
            </button>
          ))}
          {wf.error && <div style={{ color: C.danger, fontSize: 13 }}>{String(wf.error.message)}</div>}
        </div>
      </div>
    );
  }

  const r = wf.result;
  const trust = shortTrust(r?.uiPrompt?.trustLevel);

  return (
    <div style={wrap}>
      {header}
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
        {/* Current step result from the engine */}
        {r?.uiPrompt ? (
          <div style={card}>
            {trust && <div style={{ marginBottom: 12 }}><TrustBadge level={trust} /></div>}
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8, letterSpacing: "-0.01em" }}>{r.uiPrompt.title}</div>
            <div style={{ color: C.dim, fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{r.uiPrompt.content}</div>
            <div style={{ marginTop: 12, color: C.faint, fontSize: 11, fontFamily: C.mono }}>{r.kind}</div>
          </div>
        ) : (
          <div style={{ ...card, color: C.dim }}>Krok: {String(wf.instance.currentStepId)} — naciśnij „Dalej".</div>
        )}

        {wf.error && <div style={{ color: C.danger, fontSize: 13 }}>{String(wf.error.message)}</div>}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {!wf.done ? (
            <button
              disabled={wf.busy}
              onClick={() => wf.step({ photo: "base64-mock-photo" })}
              style={{ ...btn, background: C.red, color: "#fff" }}
            >
              {wf.busy ? "…" : "Dalej"}
            </button>
          ) : !wf.incident ? (
            <button
              disabled={wf.busy}
              onClick={() => wf.complete()}
              style={{ ...btn, background: C.green, color: "#fff" }}
            >
              {wf.busy ? "…" : "Zakończ i wygeneruj raport dowodowy"}
            </button>
          ) : (
            <div style={{ ...card, borderColor: C.green }}>
              <div style={{ color: C.greenLite, fontWeight: 700, marginBottom: 8 }}>Raport dowodowy utworzony</div>
              <div style={{ color: C.dim, fontSize: 13, fontFamily: C.mono, wordBreak: "break-all" }}>{String(wf.incident.id)}</div>
              <div style={{ color: C.dim, fontSize: 13, marginTop: 8 }}>
                Kraj: {String(wf.incident.country)} · źródła wiedzy: {wf.incident.knowledgeUsed?.length ?? 0}
              </div>
              <button onClick={onExit} style={{ ...btn, background: C.card, color: C.text, border: `1px solid ${C.edge}`, marginTop: 14 }}>
                Gotowe
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
