// core/workflow/validation/WorkflowValidator.ts
//
// Artefakt #0003 §1.4: a broken WorkflowVersion must fail at build time,
// never at runtime in front of a police officer. This validator is
// deterministic and pure — no I/O, no async, no engine dependencies beyond
// shared/types. That mirrors the Decision Engine's determinism guarantee
// and makes it trivially testable (§8.5 review point).
//
// Rules W-01 through W-11 are implemented as independent, named checks so
// that a failing build tells you exactly which rule and where — not just
// "workflow invalid".

import { Capability } from "../../../shared/platform/capability";
import type { StepId } from "../../../shared/platform/ids";
import type { StepDefinition, WorkflowVersion } from "../../../shared/platform/workflow";
import { OfflinePolicy, WorkflowDomain } from "../../../shared/platform/workflow";

export interface ValidationIssue {
  rule:
    | "W-01"
    | "W-02"
    | "W-03"
    | "W-04"
    | "W-05"
    | "W-06"
    | "W-07"
    | "W-08"
    | "W-09"
    | "W-10"
    | "W-11";
  message: string;
  stepId?: StepId;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** Cross-package context the validator needs for W-07 and W-09.
 *  Optional: a validator invoked without package context still runs the
 *  purely structural rules (W-01..W-06, W-08, W-10, W-11). */
export interface ValidationContext {
  /** Capabilities available to the target product (ProductManifest.capabilities.available). */
  productCapabilities?: Capability[];
  /** knowledgeRef values known to exist in the bundled knowledge package. */
  knownKnowledgeRefs?: Set<string>;
  /** WorkflowDomain lives on WorkflowDefinition, not WorkflowVersion (see
   *  shared/types/workflow.ts) — the caller, which already has the
   *  definition in hand, passes it through here for rule W-08. */
  domain?: WorkflowDomain;
}

export function validateWorkflowVersion(
  version: WorkflowVersion,
  ctx: ValidationContext = {}
): ValidationResult {
  const issues: ValidationIssue[] = [];

  const stepsById = new Map<StepId, StepDefinition>();
  for (const step of version.steps) {
    stepsById.set(step.id, step);
  }

  checkW01_UniqueIdsAndValidEntry(version, stepsById, issues);
  checkW02_AllStepsReachableAndTransitionsValid(version, stepsById, issues);
  checkW03_PathToEnd(version, stepsById, issues);
  checkW04_DeterministicTransitions(version, issues);
  checkW05_NetworkRequiresFallback(version, issues);
  checkW06_RollbackCompensationValid(version, stepsById, issues);
  checkW07_CapabilitiesWithinProduct(version, ctx, issues);
  checkW08_EmergencyDomainFullyOffline(version, ctx, issues);
  checkW09_KnowledgeRefsExist(version, ctx, issues);
  checkW10_AIAssistHasFallback(version, issues);
  checkW11_ChecksumPresentAndVersionFormat(version, issues);

  return { valid: issues.length === 0, issues };
}

// ── W-01 ───────────────────────────────────────────────────────────────
function checkW01_UniqueIdsAndValidEntry(
  version: WorkflowVersion,
  stepsById: Map<StepId, StepDefinition>,
  issues: ValidationIssue[]
): void {
  const seen = new Set<string>();
  for (const step of version.steps) {
    if (seen.has(step.id as unknown as string)) {
      issues.push({ rule: "W-01", message: `Duplicate StepId: ${step.id}`, stepId: step.id });
    }
    seen.add(step.id as unknown as string);
  }
  if (!stepsById.has(version.entryStepId)) {
    issues.push({
      rule: "W-01",
      message: `entryStepId "${version.entryStepId}" does not reference an existing step`,
    });
  }
}

// ── W-02 ───────────────────────────────────────────────────────────────
function checkW02_AllStepsReachableAndTransitionsValid(
  version: WorkflowVersion,
  stepsById: Map<StepId, StepDefinition>,
  issues: ValidationIssue[]
): void {
  // Transitions must point to real steps or "END".
  for (const step of version.steps) {
    for (const t of step.transitions) {
      if (t.to !== "END" && !stepsById.has(t.to)) {
        issues.push({
          rule: "W-02",
          message: `Step "${step.id}" transitions to unknown step "${t.to}"`,
          stepId: step.id,
        });
      }
    }
    // Fallback targets (offline / rollback) must also be real steps.
    if (step.offline.fallbackStepId && !stepsById.has(step.offline.fallbackStepId)) {
      issues.push({
        rule: "W-02",
        message: `Step "${step.id}" offline.fallbackStepId "${step.offline.fallbackStepId}" does not exist`,
        stepId: step.id,
      });
    }
  }

  if (!stepsById.has(version.entryStepId)) return; // already reported by W-01

  const reachable = new Set<StepId>();
  const queue: StepId[] = [version.entryStepId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const step = stepsById.get(current);
    if (!step) continue;
    for (const t of step.transitions) {
      if (t.to !== "END" && stepsById.has(t.to)) queue.push(t.to);
    }
  }

  for (const step of version.steps) {
    if (!reachable.has(step.id)) {
      issues.push({
        rule: "W-02",
        message: `Step "${step.id}" is unreachable from entry step "${version.entryStepId}"`,
        stepId: step.id,
      });
    }
  }
}

// ── W-03 ───────────────────────────────────────────────────────────────
function checkW03_PathToEnd(
  version: WorkflowVersion,
  stepsById: Map<StepId, StepDefinition>,
  issues: ValidationIssue[]
): void {
  if (!stepsById.has(version.entryStepId)) return;

  const visited = new Set<StepId>();
  const stack: StepId[] = [version.entryStepId];
  let foundEnd = false;

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === undefined) continue;
    const step = stepsById.get(current);
    if (!step) continue;
    if (step.transitions.length === 0) {
      // Terminal step with no transitions counts as reaching END.
      foundEnd = true;
      break;
    }
    for (const t of step.transitions) {
      if (t.to === "END") {
        foundEnd = true;
        break;
      }
      if (!visited.has(t.to)) {
        visited.add(t.to);
        stack.push(t.to);
      }
    }
    if (foundEnd) break;
  }

  if (!foundEnd) {
    issues.push({
      rule: "W-03",
      message: `No path from entry step "${version.entryStepId}" reaches END`,
    });
  }
}

// ── W-04 ───────────────────────────────────────────────────────────────
function checkW04_DeterministicTransitions(
  version: WorkflowVersion,
  issues: ValidationIssue[]
): void {
  for (const step of version.steps) {
    if (step.transitions.length === 0) continue; // terminal step, fine

    const defaults = step.transitions.filter((t) => t.guard === null);
    if (defaults.length !== 1) {
      issues.push({
        rule: "W-04",
        message: `Step "${step.id}" must have exactly one default transition (guard=null); found ${defaults.length}`,
        stepId: step.id,
      });
    }

    const priorities = new Set<number>();
    for (const t of step.transitions) {
      if (priorities.has(t.priority)) {
        issues.push({
          rule: "W-04",
          message: `Step "${step.id}" has duplicate transition priority ${t.priority}`,
          stepId: step.id,
        });
      }
      priorities.add(t.priority);
    }
  }
}

// ── W-05 ───────────────────────────────────────────────────────────────
function checkW05_NetworkRequiresFallback(
  version: WorkflowVersion,
  issues: ValidationIssue[]
): void {
  for (const step of version.steps) {
    const needsNetwork = step.requiredCapabilities.includes(Capability.NETWORK);
    if (needsNetwork && !(step.offline.mode === "FALLBACK" && step.offline.fallbackStepId)) {
      issues.push({
        rule: "W-05",
        message: `Step "${step.id}" requires NETWORK but does not declare offline.mode="FALLBACK" with a fallbackStepId`,
        stepId: step.id,
      });
    }
  }
}

// ── W-06 ───────────────────────────────────────────────────────────────
function checkW06_RollbackCompensationValid(
  version: WorkflowVersion,
  stepsById: Map<StepId, StepDefinition>,
  issues: ValidationIssue[]
): void {
  for (const step of version.steps) {
    if (!step.rollback) continue;
    if (step.rollback.mode === "COMPENSATE") {
      const compId = step.rollback.compensationStepId;
      if (!compId) {
        issues.push({
          rule: "W-06",
          message: `Step "${step.id}" has rollback.mode="COMPENSATE" but no compensationStepId`,
          stepId: step.id,
        });
        continue;
      }
      if (!stepsById.has(compId)) {
        issues.push({
          rule: "W-06",
          message: `Step "${step.id}" rollback.compensationStepId "${compId}" does not exist`,
          stepId: step.id,
        });
        continue;
      }
      // Simple cycle guard: a compensation step must not compensate back to
      // the step that triggered it (direct 2-cycle). Longer cycles are a
      // design smell this validator flags conservatively.
      const compStep = stepsById.get(compId)!;
      if (
        compStep.rollback?.mode === "COMPENSATE" &&
        compStep.rollback.compensationStepId === step.id
      ) {
        issues.push({
          rule: "W-06",
          message: `Compensation cycle detected between "${step.id}" and "${compId}"`,
          stepId: step.id,
        });
      }
    }
  }
}

// ── W-07 ───────────────────────────────────────────────────────────────
function checkW07_CapabilitiesWithinProduct(
  version: WorkflowVersion,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  if (!ctx.productCapabilities) return; // structural-only run; skip cross-package check
  const available = new Set(ctx.productCapabilities);
  const required = new Set<Capability>(version.requiredCapabilities);
  for (const step of version.steps) {
    for (const cap of step.requiredCapabilities) required.add(cap);
  }
  for (const cap of required) {
    if (!available.has(cap)) {
      issues.push({
        rule: "W-07",
        message: `Workflow requires capability "${cap}" not available in target product`,
      });
    }
  }
}

// ── W-08 ───────────────────────────────────────────────────────────────
function checkW08_EmergencyDomainFullyOffline(
  version: WorkflowVersion,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  if (ctx.domain === undefined) return; // caller didn't supply domain; skip
  if (ctx.domain !== WorkflowDomain.EMERGENCY) return;
  if (version.offlinePolicy !== OfflinePolicy.FULL_OFFLINE) {
    issues.push({
      rule: "W-08",
      message: `domain=EMERGENCY requires offlinePolicy=FULL_OFFLINE (found "${version.offlinePolicy}")`,
    });
  }
  for (const step of version.steps) {
    if (step.offline.mode !== "NATIVE" && step.offline.mode !== "FALLBACK") {
      issues.push({
        rule: "W-08",
        message: `domain=EMERGENCY step "${step.id}" has offline.mode="${step.offline.mode}"; only NATIVE or FALLBACK are allowed`,
        stepId: step.id,
      });
    }
  }
}

// ── W-09 ───────────────────────────────────────────────────────────────
function checkW09_KnowledgeRefsExist(
  version: WorkflowVersion,
  ctx: ValidationContext,
  issues: ValidationIssue[]
): void {
  if (!ctx.knownKnowledgeRefs) return; // structural-only run; skip cross-package check
  for (const step of version.steps) {
    if (step.kind !== "SHOW_KNOWLEDGE") continue;
    if (!step.knowledgeRef) {
      issues.push({
        rule: "W-09",
        message: `SHOW_KNOWLEDGE step "${step.id}" has no knowledgeRef`,
        stepId: step.id,
      });
      continue;
    }
    if (!ctx.knownKnowledgeRefs.has(step.knowledgeRef)) {
      issues.push({
        rule: "W-09",
        message: `SHOW_KNOWLEDGE step "${step.id}" references knowledgeRef "${step.knowledgeRef}" not present in the bundled knowledge package`,
        stepId: step.id,
      });
    }
  }
}

// ── W-10 ───────────────────────────────────────────────────────────────
function checkW10_AIAssistHasFallback(version: WorkflowVersion, issues: ValidationIssue[]): void {
  for (const step of version.steps) {
    if (step.kind !== "AI_ASSIST") continue;
    if (step.offline.mode === "BLOCK") {
      issues.push({
        rule: "W-10",
        message: `AI_ASSIST step "${step.id}" has offline.mode="BLOCK" — offline must never leave the user without a response`,
        stepId: step.id,
      });
    }
  }
}

// ── W-11 ───────────────────────────────────────────────────────────────
function checkW11_ChecksumPresentAndVersionFormat(
  version: WorkflowVersion,
  issues: ValidationIssue[]
): void {
  if (!version.checksum || (version.checksum as unknown as string).length === 0) {
    issues.push({ rule: "W-11", message: "WorkflowVersion is missing a checksum" });
  }
  if (!/^\d+\.\d+\.\d+$/.test(version.version as unknown as string)) {
    issues.push({
      rule: "W-11",
      message: `Version "${version.version}" is not valid SemVer (expected x.y.z)`,
    });
  }
}
