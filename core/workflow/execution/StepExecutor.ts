// core/workflow/execution/StepExecutor.ts
//
// §8.3 (Artefakt #0003): "Every new StepKind is an edit to the engine" was
// flagged as an Open/Closed Principle violation (a `switch(kind)` inside
// WorkflowEngine.executeStep()). This file replaces that pattern with a
// registry: adding a new StepKind means registering a new executor, never
// touching WorkflowEngine itself.
//
// This module intentionally does NOT implement the real engines yet
// (Knowledge/Context/Decision/AI ports aren't wired here — that's Faza B/C
// work tracked in FAZA_A_STATUS.md). It defines the seam so the pattern is
// correct from day one, with a couple of illustrative executors that need
// no engine ports (EMERGENCY_CARD/NOTIFY/WAIT-shaped logic) to prove the
// registry actually dispatches and stays closed to modification.

import type { JsonValue } from "../../../shared/platform/ids";
import type { SituationContext } from "../../../shared/platform/context";
import type { StepDefinition } from "../../../shared/platform/workflow";
import { StepKind } from "../../../shared/platform/workflow";

export interface StepExecutionInput {
  step: StepDefinition;
  context: SituationContext;
  variables: Record<string, JsonValue>; // WorkflowInstance's accumulated state
}

export type StepExecutionStatus = "COMPLETED" | "FAILED" | "SKIPPED";

export interface StepExecutionResult {
  status: StepExecutionStatus;
  output: Record<string, JsonValue>;
  error?: string;
}

export interface StepExecutor {
  readonly kind: StepKind;
  execute(input: StepExecutionInput): Promise<StepExecutionResult>;
}

/**
 * Open registry. WorkflowEngine depends on THIS class, never on a
 * hardcoded switch — satisfying DIP (§8.3) at the same time as OCP.
 */
export class StepExecutorRegistry {
  private readonly executors = new Map<StepKind, StepExecutor>();

  register(executor: StepExecutor): void {
    if (this.executors.has(executor.kind)) {
      throw new Error(`StepExecutor for kind "${executor.kind}" is already registered`);
    }
    this.executors.set(executor.kind, executor);
  }

  resolve(kind: StepKind): StepExecutor {
    const executor = this.executors.get(kind);
    if (!executor) {
      throw new Error(
        `No StepExecutor registered for kind "${kind}". ` +
          `Register one via StepExecutorRegistry.register() — do not add a case to WorkflowEngine.`
      );
    }
    return executor;
  }

  has(kind: StepKind): boolean {
    return this.executors.has(kind);
  }
}

// ── Illustrative executors (no engine ports required) ───────────────────
// Real executors for SHOW_KNOWLEDGE / AI_ASSIST / OCR / TRANSLATE depend on
// IKnowledgePort / IAIPort and are Faza C work (they need those ports
// wired, which is out of scope for this validation-and-types pass).

export const waitExecutor: StepExecutor = {
  kind: StepKind.WAIT,
  async execute(): Promise<StepExecutionResult> {
    return { status: "COMPLETED", output: {} };
  },
};

export const notifyExecutor: StepExecutor = {
  kind: StepKind.NOTIFY,
  async execute(input: StepExecutionInput): Promise<StepExecutionResult> {
    // Real implementation would call a notification port; this illustrates
    // the seam only — the point of this file is the registry, not the I/O.
    return { status: "COMPLETED", output: { notified: true, stepId: input.step.id as unknown as string } };
  },
};

export function buildDefaultRegistry(): StepExecutorRegistry {
  const registry = new StepExecutorRegistry();
  registry.register(waitExecutor);
  registry.register(notifyExecutor);
  // SHOW_KNOWLEDGE, AI_ASSIST, OCR, TRANSLATE, CAPTURE_PHOTO,
  // GENERATE_REPORT, EMERGENCY_CARD, DECISION_POINT, COLLECT_INPUT:
  // registered by the app/engine wiring layer once the corresponding
  // ports (Knowledge/AI/Context/etc.) exist — see FAZA_A_STATUS.md "Still open".
  return registry;
}
