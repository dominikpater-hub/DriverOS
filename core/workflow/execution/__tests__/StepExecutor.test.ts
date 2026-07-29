// core/workflow/execution/__tests__/StepExecutor.test.ts
// §8.3 OCP fix: StepExecutorRegistry replaces switch(kind). Adding a StepKind
// means registering an executor, never editing WorkflowEngine.

import { StepKind } from "../../../../shared/platform/workflow";
import { buildDefaultRegistry, StepExecutorRegistry, waitExecutor } from "../StepExecutor";

describe("StepExecutorRegistry", () => {
  test("resolves a registered kind (WAIT)", () => {
    expect(buildDefaultRegistry().resolve(StepKind.WAIT)).toBe(waitExecutor);
  });

  test("has() reports true for registered kind", () => {
    expect(buildDefaultRegistry().has(StepKind.NOTIFY)).toBe(true);
  });

  test("has() reports false for unregistered kind", () => {
    expect(buildDefaultRegistry().has(StepKind.AI_ASSIST)).toBe(false);
  });

  test("resolve() throws (not silently no-ops) for unregistered kind", () => {
    expect(() => buildDefaultRegistry().resolve(StepKind.AI_ASSIST)).toThrow();
  });

  test("register() throws on duplicate registration", () => {
    const fresh = new StepExecutorRegistry();
    fresh.register(waitExecutor);
    expect(() => fresh.register(waitExecutor)).toThrow();
  });

  test("WAIT executor actually runs and returns COMPLETED", async () => {
    const result = await buildDefaultRegistry().resolve(StepKind.WAIT).execute({
      step: {} as any,
      context: {} as any,
      variables: {},
    });
    expect(result.status).toBe("COMPLETED");
  });
});
