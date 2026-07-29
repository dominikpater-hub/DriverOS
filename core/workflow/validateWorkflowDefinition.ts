/**
 * WORKFLOW DEFINITION VALIDATION
 *
 * Build-time check: every step requiring NETWORK must declare a fallback.
 * This turns "Offline First" (Engineering Handbook) into a compile-time
 * rule instead of a runtime hope. Call this at module load for every
 * WorkflowDefinition — see apps/driver-os/workflows/*.ts for the pattern.
 */

import { Capability } from "../../shared/types";
import { WorkflowDefinition } from "./WorkflowEngine";

export function validateWorkflowDefinition(def: WorkflowDefinition): void {
  for (const step of def.steps) {
    if (step.requires.includes(Capability.NETWORK) && !step.fallback) {
      throw new Error(
        `[${def.id}] Step "${step.id}" requires NETWORK but has no fallback. ` +
        `This violates Offline First (Engineering Handbook).`
      );
    }
  }

  if (def.offlineCapable) {
    // Every step must be reachable without network, either directly
    // or through its fallback chain.
    const networkOnlySteps = def.steps.filter(
      s => s.requires.includes(Capability.NETWORK) && !s.fallback
    );
    if (networkOnlySteps.length > 0) {
      throw new Error(
        `[${def.id}] Marked offlineCapable=true but has steps with no offline path: ` +
        networkOnlySteps.map(s => s.id).join(", ")
      );
    }
  }

  // Structural check: entryStepId must exist among steps
  if (!def.steps.some(s => s.id === def.entryStepId)) {
    throw new Error(`[${def.id}] entryStepId "${def.entryStepId}" does not match any step.`);
  }

  // Structural check: every `next` and `fallback` must point to a real step id
  // (or arrays thereof), catching typos before they become runtime dead-ends.
  const knownIds = new Set(def.steps.map(s => s.id));
  for (const step of def.steps) {
    const nextIds = Array.isArray(step.next) ? step.next : step.next ? [step.next] : [];
    for (const id of nextIds) {
      if (!knownIds.has(id)) {
        throw new Error(`[${def.id}] Step "${step.id}" points to unknown next step "${id}".`);
      }
    }
    if (step.fallback && !knownIds.has(step.fallback)) {
      throw new Error(`[${def.id}] Step "${step.id}" points to unknown fallback step "${step.fallback}".`);
    }
  }
}
