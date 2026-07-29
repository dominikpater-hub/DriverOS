// core/workflow/validation/__tests__/WorkflowValidator.test.ts
//
// be run with a single `ts-node` invocation without pulling in jest for a
// first Faza A pass. Each case exercises exactly one rule violation,
// mirroring the "one broken thing per test" discipline from the Engineering
// Handbook's testing section.

import { Capability } from "../../../../shared/platform/capability";
import { OfflinePolicy, StepKind, WorkflowDomain } from "../../../../shared/platform/workflow";
import { validateWorkflowVersion, ValidationContext } from "../WorkflowValidator";
import { id, step, stepIds, validInspectionDE } from "./fixtures";


function check(name: string, cond: boolean, _detail?: string) {
  test(name, () => { expect(cond).toBe(true); });
}

function hasRule(issues: { rule: string }[], rule: string): boolean {
  return issues.some((i) => i.rule === rule);
}

console.log("WorkflowValidator");

// ── Baseline: the valid fixture must pass clean ─────────────────────────
{
  const result = validateWorkflowVersion(validInspectionDE());
  check("valid Inspection_DE-shaped workflow passes with zero issues", result.valid && result.issues.length === 0,
    JSON.stringify(result.issues));
}

// ── W-01: duplicate StepId ──────────────────────────────────────────────
{
  const wf = validInspectionDE();
  wf.steps.push(step({ id: stepIds.emergency, kind: StepKind.NOTIFY }));
  const result = validateWorkflowVersion(wf);
  check("W-01 catches duplicate StepId", !result.valid && hasRule(result.issues, "W-01"));
}

// ── W-01: invalid entryStepId ────────────────────────────────────────────
{
  const wf = validInspectionDE();
  wf.entryStepId = id("step_does_not_exist");
  const result = validateWorkflowVersion(wf);
  check("W-01 catches invalid entryStepId", !result.valid && hasRule(result.issues, "W-01"));
}

// ── W-02: transition to unknown step ────────────────────────────────────
{
  const wf = validInspectionDE();
  wf.steps[0].transitions = [{ to: id("ghost_step"), guard: null, priority: 0 }];
  const result = validateWorkflowVersion(wf);
  check("W-02 catches transition to unknown step", !result.valid && hasRule(result.issues, "W-02"));
}

// ── W-02: unreachable step ───────────────────────────────────────────────
{
  const wf = validInspectionDE();
  wf.steps.push(step({ id: id("orphan"), kind: StepKind.NOTIFY, transitions: [{ to: "END", guard: null, priority: 0 }] }));
  const result = validateWorkflowVersion(wf);
  check("W-02 catches unreachable step", !result.valid && hasRule(result.issues, "W-02"));
}

// ── W-03: no path to END ─────────────────────────────────────────────────
{
  const wf = validInspectionDE();
  // Make the last step loop back to itself instead of reaching END.
  const report = wf.steps.find((s) => s.id === stepIds.report)!;
  report.transitions = [{ to: stepIds.report, guard: null, priority: 0 }];
  const result = validateWorkflowVersion(wf);
  check("W-03 catches missing path to END", !result.valid && hasRule(result.issues, "W-03"));
}

// ── W-04: missing default transition ─────────────────────────────────────
{
  const wf = validInspectionDE();
  wf.steps[0].transitions = [
    { to: stepIds.knowledge, guard: { path: "input.x", operator: "eq", value: 1 }, priority: 0 },
  ];
  const result = validateWorkflowVersion(wf);
  check("W-04 catches missing default transition", !result.valid && hasRule(result.issues, "W-04"));
}

// ── W-04: duplicate priority ──────────────────────────────────────────────
{
  const wf = validInspectionDE();
  wf.steps[0].transitions = [
    { to: stepIds.knowledge, guard: null, priority: 0 },
    { to: stepIds.knowledge, guard: { path: "input.x", operator: "eq", value: 1 }, priority: 0 },
  ];
  const result = validateWorkflowVersion(wf);
  check("W-04 catches duplicate transition priority", !result.valid && hasRule(result.issues, "W-04"));
}

// ── W-05: NETWORK without fallback ───────────────────────────────────────
{
  const wf = validInspectionDE();
  const translate = wf.steps.find((s) => s.id === stepIds.translate)!;
  translate.offline = { mode: "NATIVE", fallbackStepId: null };
  const result = validateWorkflowVersion(wf);
  check("W-05 catches NETWORK step without FALLBACK", !result.valid && hasRule(result.issues, "W-05"));
}

// ── W-06: COMPENSATE without compensationStepId ─────────────────────────
{
  const wf = validInspectionDE();
  wf.steps[0].rollback = { mode: "COMPENSATE", compensationStepId: null };
  const result = validateWorkflowVersion(wf);
  check("W-06 catches COMPENSATE without compensationStepId", !result.valid && hasRule(result.issues, "W-06"));
}

// ── W-06: compensation cycle ─────────────────────────────────────────────
{
  const wf = validInspectionDE();
  const a = wf.steps.find((s) => s.id === stepIds.emergency)!;
  const b = wf.steps.find((s) => s.id === stepIds.knowledge)!;
  a.rollback = { mode: "COMPENSATE", compensationStepId: b.id };
  b.rollback = { mode: "COMPENSATE", compensationStepId: a.id };
  const result = validateWorkflowVersion(wf);
  check("W-06 catches direct compensation cycle", !result.valid && hasRule(result.issues, "W-06"));
}

// ── W-07: capability not in product ──────────────────────────────────────
{
  const wf = validInspectionDE();
  const ctx: ValidationContext = { productCapabilities: [Capability.NETWORK] }; // no CAMERA
  const result = validateWorkflowVersion(wf, ctx);
  check("W-07 catches capability missing from product", !result.valid && hasRule(result.issues, "W-07"));
}
{
  const wf = validInspectionDE();
  const ctx: ValidationContext = { productCapabilities: [Capability.NETWORK, Capability.CAMERA] };
  const result = validateWorkflowVersion(wf, ctx);
  check("W-07 passes when product has all required capabilities", result.valid);
}

// ── W-08: EMERGENCY domain must be FULL_OFFLINE ─────────────────────────
{
  const wf = validInspectionDE();
  wf.offlinePolicy = OfflinePolicy.DEGRADED_OFFLINE;
  const result = validateWorkflowVersion(wf, { domain: WorkflowDomain.EMERGENCY });
  check("W-08 catches non-FULL_OFFLINE for EMERGENCY domain", !result.valid && hasRule(result.issues, "W-08"));
}
{
  const wf = validInspectionDE(); // INSPECTION domain assumed via ctx.domain omission below
  const result = validateWorkflowVersion(wf, { domain: WorkflowDomain.INSPECTION });
  check("W-08 does not fire for non-EMERGENCY domain", result.valid);
}

// ── W-09: SHOW_KNOWLEDGE ref not in package ─────────────────────────────
{
  const wf = validInspectionDE();
  const ctx: ValidationContext = { knownKnowledgeRefs: new Set(["some-other-ref"]) };
  const result = validateWorkflowVersion(wf, ctx);
  check("W-09 catches unknown knowledgeRef", !result.valid && hasRule(result.issues, "W-09"));
}
{
  const wf = validInspectionDE();
  const ctx: ValidationContext = { knownKnowledgeRefs: new Set(["traffic-rights-de"]) };
  const result = validateWorkflowVersion(wf, ctx);
  check("W-09 passes when knowledgeRef is in package", result.valid);
}

// ── W-10: AI_ASSIST with offline BLOCK ────────────────────────────────────
{
  const wf = validInspectionDE();
  wf.steps.push(
    step({
      id: id("step_ai"),
      kind: StepKind.AI_ASSIST,
      offline: { mode: "BLOCK", fallbackStepId: null },
      transitions: [{ to: "END", guard: null, priority: 0 }],
    })
  );
  // wire it in so W-02/W-03 don't also fire and muddy the assertion
  const report = wf.steps.find((s) => s.id === stepIds.report)!;
  report.transitions = [{ to: id("step_ai"), guard: null, priority: 0 }];
  const result = validateWorkflowVersion(wf);
  check("W-10 catches AI_ASSIST with offline.mode=BLOCK", !result.valid && hasRule(result.issues, "W-10"));
}

// ── W-11: missing checksum / bad version format ──────────────────────────
{
  const wf = validInspectionDE();
  wf.checksum = id("");
  const result = validateWorkflowVersion(wf);
  check("W-11 catches missing checksum", !result.valid && hasRule(result.issues, "W-11"));
}
{
  const wf = validInspectionDE();
  wf.version = id("1.0"); // not x.y.z
  const result = validateWorkflowVersion(wf);
  check("W-11 catches malformed SemVer", !result.valid && hasRule(result.issues, "W-11"));
}

