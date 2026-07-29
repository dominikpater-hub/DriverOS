// .dependency-cruiser.js
//
// §8.1 Z-01 (Artefakt #0003): "Workflow Engine built its own SituationContext"
// was a real bug, not a hypothetical — BUILD_STATUS documents it. That's a
// symptom of boundary rules living only in code review, not in the build.
// This file turns Domain Model §1 ("engines don't know each other; only
// Workflow knows all ports; apps only know Workflow + catalog; UI only
// knows WorkflowInstance state") into a CI-enforced rule set.
//
// Run: npx depcruise --config .dependency-cruiser.js core shared apps 2>/dev/null || true
// (apps/ doesn't exist yet in this Faza A pass — rule is pre-registered for
// when apps/driver-os lands, per ADR-009.)

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "engines-do-not-know-each-other",
      comment:
        "Domain Model §1 rule 1: Knowledge, Context, Decision, AI do not know " +
        "about each other. Only Workflow depends on their ports.",
      severity: "error",
      from: { path: "^core/(knowledge|context|decision|ai)" },
      to: { path: "^core/(knowledge|context|decision|ai)", pathNot: "^core/$1" },
    },
    {
      name: "only-workflow-knows-all-ports",
      comment:
        "Domain Model §1 rule 2: only Workflow Engine may import from more " +
        "than one of the four independent engines.",
      severity: "error",
      from: { path: "^core/(?!workflow)" },
      to: { path: "^core/index\\.ports" },
    },
    {
      name: "no-engine-imports-workflow",
      comment:
        "Domain Model §1 rule 1 (implied): 'no engine knows Workflow Engine'. " +
        "Workflow may depend on the other four; the dependency never reverses.",
      severity: "error",
      from: { path: "^core/(knowledge|context|decision|ai)" },
      to: { path: "^core/workflow" },
    },
    {
      name: "apps-only-import-workflow-and-shared",
      comment:
        "Domain Model §1 rule 3 + ADR-009 §7.3.1: products know only Workflow " +
        "Engine + the workflow catalog. They never import knowledge/context/" +
        "decision/ai directly, and never read ProductManifest logic beyond " +
        "their own bootstrap.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: "^core/(knowledge|context|decision|ai)" },
    },
    {
      name: "no-circular-dependencies",
      comment: "Engineering Handbook: avoid tight coupling; a cycle is the sharpest form of it.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)__tests__/" },
  },
};
