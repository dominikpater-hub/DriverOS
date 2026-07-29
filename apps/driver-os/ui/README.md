# DriverOS UI (Franek)

The user-facing DriverOS client — **Franek**, the face of the driver assistant.
Vite + React 19, buildable inside the Guardian Engine monorepo.

## Status (M5.0 — done)

The proven prototype is now a **monorepo workspace** (`@guardian-engine/driver-os-ui`)
with a real Vite build, sitting next to `core/`. This is milestone **M5.0**:
"pull the prototype in as a build". It does **not** yet consume `core/` — the
screens still use the prototype's own in-JSX engines. Rewiring the UI onto
`core/` through `IWorkflowPort` is **M5.1–M5.2** (next).

```
apps/driver-os/ui/
  index.html
  vite.config.js
  src/
    main.jsx            React entry
    App.jsx             OS router: Dashboard | Assist | Nauka | Zapytaj
    Dashboard.jsx       "Dzisiaj" launcher (OS home)
    DriverOS.jsx        Franek — roadside assist (kontrola / wypadek), TrustBadge
    KnowledgeQA.jsx     "Zapytaj" — grounded Q&A
    theme.js            UI tokens (extracted out of the ADR trainer)
    adr-trainer.stub.jsx  INTEGRATION SEAM (see below)
    engine/             prototype in-JSX engines — REPLACED BY core/ in M5.2
      aiEngine.js       grounding-gated reformulation (T3 only, else null)
      retrieval.js      deterministic token-overlap retrieval (no AI)
```

## The ADR trainer seam

The ADR trainer (MasterADR / MasterDriver) is authored in a **separate session**
and is out of scope for platform work. The prototype tangled it with the shell
(shared theme, a Leitner due-count on the Dashboard, an ADR corpus behind
"Zapytaj"). `adr-trainer.stub.jsx` exposes exactly the surface the shell imports
(`default`, `ALL`, `MODULES`, `countDueReviews`) so the shell builds and runs
without it. When the ADR session ships its trainer, **replace that one file**
with the real module (same named exports) — no other shell file changes.

## Build

```bash
npm install --workspace @guardian-engine/driver-os-ui
npm run build --workspace @guardian-engine/driver-os-ui   # -> dist/
npm run dev   --workspace @guardian-engine/driver-os-ui   # local dev server
```

## Architecture rule (enforced from M5.2)

Per Domain Model §1 rule 3, this app may import only the Workflow Engine +
`shared/`, never `core/{knowledge,context,decision,ai}` directly. Today it
imports neither (self-contained prototype engines); M5.2 points it at
`IWorkflowPort` and deletes `engine/`.
