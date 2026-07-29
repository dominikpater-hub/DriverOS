// core/workflow/__tests__/executorRegistry.test.ts
// §8.3 OCP: WorkflowEngine dispatches by an executor registry, not switch(kind).
// Adding a StepKind = registerExecutor(), never editing executeStep.

import { WorkflowEngine } from "../WorkflowEngine";
import { StepKind } from "../../../shared/types";

// The constructor only wires the default executors — it does not touch ports —
// so stub ports are enough to exercise the registry contract.
const stub: any = {};

describe("WorkflowEngine executor registry (OCP §8.3)", () => {
  test("registerExecutor throws when a kind is already registered", () => {
    const engine = new WorkflowEngine(stub, stub, stub, stub, stub);
    expect(() =>
      engine.registerExecutor(StepKind.SHOW_KNOWLEDGE, async () => ({} as any))
    ).toThrow(/already registered/i);
  });

  test("registerExecutor accepts a new, previously-unregistered kind", () => {
    const engine = new WorkflowEngine(stub, stub, stub, stub, stub);
    expect(() =>
      engine.registerExecutor(StepKind.WAIT, async (s) => ({ stepId: s.id, kind: s.kind }))
    ).not.toThrow();
  });
});
