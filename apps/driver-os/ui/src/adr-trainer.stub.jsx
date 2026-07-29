// adr-trainer.stub.jsx — INTEGRATION SEAM, not the real trainer.
//
// The ADR trainer (MasterADR / MasterDriver) is authored in a SEPARATE session
// and is deliberately OUT OF SCOPE for the platform work. The Franek prototype
// tangled the trainer with the DriverOS shell (shared theme, a Leitner
// due-count on the Dashboard, an ADR corpus behind "Zapytaj"). M5.0 keeps the
// shell buildable and honest by exposing exactly the surface the shell imports
// — and nothing more — so the real trainer can drop in later by replacing this
// one file.
//
// Surface the DriverOS shell depends on:
//   default            — the trainer screen (here: a "coming from its own
//                         session" placeholder)
//   ALL                — flat fact corpus (empty until the trainer lands)
//   MODULES            — module catalogue (empty until the trainer lands)
//   countDueReviews()  — Leitner due-count for the Dashboard badge (0 for now)
//
// When the ADR session ships its trainer, replace this module with the real
// one (same named exports) — no other shell file needs to change.

import React from "react";
import { C } from "./theme.js";

/** Flat fact corpus consumed by KnowledgeQA retrieval. Empty seam. */
export const ALL = [];

/** Module catalogue (id + title) referenced by KnowledgeQA. Empty seam. */
export const MODULES = [];

/** Leitner due-review count shown on the Dashboard. Nothing due until the
 *  real trainer (with its spaced-repetition state) is wired in. */
export function countDueReviews() {
  return 0;
}

/** Placeholder trainer screen. The real ADR trainer replaces this default. */
export default function AdrTrainer({ onExit }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        color: C.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em", marginBottom: 8 }}>
        Driver<span style={{ color: C.red }}>OS</span>{" "}
        <span style={{ color: C.dim, fontWeight: 600, fontSize: 15 }}>Nauka (ADR)</span>
      </div>
      <p style={{ color: C.dim, maxWidth: 380, lineHeight: 1.5, fontSize: 14 }}>
        Trener ADR jest budowany w osobnym module i zostanie tu wpięty bez zmian
        w powłoce DriverOS. To miejsce (seam) czeka na jego wersję produkcyjną.
      </p>
      <button
        onClick={onExit}
        style={{
          marginTop: 20,
          background: C.card,
          border: `1px solid ${C.edge}`,
          color: C.text,
          borderRadius: 10,
          padding: "10px 18px",
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        ‹ Wróć do Dzisiaj
      </button>
    </div>
  );
}
