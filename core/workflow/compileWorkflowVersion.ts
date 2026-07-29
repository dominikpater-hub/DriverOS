// core/workflow/compileWorkflowVersion.ts
//
// Faza 1.3 (kompromis pod ryzyko): workflowy są AUTOROWANE wyłącznie jako
// platformowy `WorkflowVersion` (kanon, wersjonowany, checksum, walidowany
// przez WorkflowValidator W-01…11). Silnik wykonuje sprawdzoną formę runtime
// (WorkflowDefinition). Ten kompilator to jedyny most: rich authoring ->
// lean runtime. Dzięki temu nie ma dwóch RĘCZNIE pisanych kształtów workflow,
// a wnętrze prawnie-krytycznego orkiestratora zostaje nietknięte.
//
// Mapowanie: transitions[default].to -> next ("END" -> undefined);
// offline.mode=FALLBACK -> fallback; requiredCapabilities -> requires;
// knowledgeRef -> data.knowledgeTags (konwencja: knowledgeRef == tag);
// LocalizedText -> pierwszy dostępny string.

import type { WorkflowDefinition, StepDefinition as RuntimeStep } from "./WorkflowEngine";
import type { WorkflowVersion, StepDefinition as PlatformStep } from "../../shared/platform/workflow";
import type { StepId, WorkflowDefId } from "../../shared/types";
import { OfflinePolicy } from "../../shared/platform/workflow";

function resolveTitle(title: PlatformStep["title"]): string {
  const values = Object.values(title);
  return values.length > 0 ? values[0] : "";
}

/** Runtime jest liniowy: bierzemy przejście domyślne (guard === null), inaczej pierwsze. */
function defaultNext(step: PlatformStep): StepId | undefined {
  const chosen = step.transitions.find((t) => t.guard === null) ?? step.transitions[0];
  if (!chosen) return undefined;
  return chosen.to === "END" ? undefined : (chosen.to as unknown as StepId);
}

function compileStep(step: PlatformStep): RuntimeStep {
  const fallback =
    step.offline.mode === "FALLBACK" && step.offline.fallbackStepId
      ? (step.offline.fallbackStepId as unknown as StepId)
      : undefined;

  return {
    id: step.id as unknown as StepId,
    kind: step.kind,
    title: resolveTitle(step.title),
    requires: step.requiredCapabilities,
    fallback,
    next: defaultNext(step),
    // Carry guarded transitions to runtime (2.1) — linear steps have one
    // default (guard=null) transition, so behaviour is unchanged.
    transitions: step.transitions.map((t) => ({
      to: t.to === "END" ? ("END" as const) : (t.to as unknown as StepId),
      guard: t.guard,
      priority: t.priority,
    })),
    data: step.knowledgeRef ? { knowledgeTags: [step.knowledgeRef] } : undefined,
  };
}

export function compileWorkflowVersion(version: WorkflowVersion, name?: string): WorkflowDefinition {
  return {
    id: version.definitionId as unknown as WorkflowDefId,
    name: name ?? String(version.definitionId),
    version: String(version.version),
    entryStepId: version.entryStepId as unknown as StepId,
    offlineCapable: version.offlinePolicy !== OfflinePolicy.ONLINE_ONLY,
    steps: version.steps.map(compileStep),
  };
}
