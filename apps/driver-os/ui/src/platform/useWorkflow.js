// platform/useWorkflow.js — the controller seam (M5.1).
//
// This hook is the ONLY thing the DriverOS screens use to talk to the engine.
// It drives a composed IWorkflowPort (from @guardian-engine/driver-os-runtime)
// and exposes plain renderable state — Domain Model §10: "apps only render
// WorkflowInstance state; no business logic in the UI". The engine decides
// what happens next; the screen just draws the StepExecutionResult it returns.

import { useCallback, useEffect, useRef, useState } from "react";
import { createDriverOSRuntime } from "@guardian-engine/driver-os-runtime";

/**
 * Lazily build (once) and share the DriverOS runtime. The composition root is
 * async (knowledge publish + decision init), so callers await readiness via the
 * `ready` flag before starting a workflow.
 */
export function useRuntime() {
  const [runtime, setRuntime] = useState(null);
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    createDriverOSRuntime()
      .then(setRuntime)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);

  return { runtime, ready: !!runtime, error };
}

/**
 * Drive a single workflow instance.
 *
 * @param {object} runtime  result of createDriverOSRuntime()
 * @returns {{
 *   instance: object|null,      // WorkflowInstanceSnapshot
 *   result: object|null,        // last StepExecutionResult (title/content/trustLevel)
 *   incident: object|null,      // IncidentSnapshot after completion
 *   busy: boolean,
 *   error: Error|null,
 *   done: boolean,              // instance state === COMPLETED
 *   start: (defId, opts?) => Promise<void>,
 *   step:  (stepInput?) => Promise<void>,
 *   complete: (finalData?) => Promise<void>,
 * }}
 */
export function useWorkflow(runtime) {
  const [instance, setInstance] = useState(null);
  const [result, setResult] = useState(null);
  const [incident, setIncident] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = useCallback(async (fn) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback(
    (defId, opts = {}) =>
      run(async () => {
        if (!runtime) throw new Error("Runtime not ready");
        setResult(null);
        setIncident(null);
        const snap = await runtime.workflow.startWorkflow({
          userId: runtime.userId,
          defId,
          location: opts.location ?? { latitude: 52.52, longitude: 13.405 },
          language: opts.language ?? "de",
          initialData: opts.initialData,
        });
        setInstance(snap);
      }),
    [runtime, run]
  );

  const step = useCallback(
    (stepInput) =>
      run(async () => {
        if (!runtime || !instance) throw new Error("No active workflow");
        const r = await runtime.workflow.executeStep(instance.id, stepInput);
        setResult(r);
        const snap = await runtime.workflow.getWorkflowInstance(instance.id);
        setInstance(snap);
      }),
    [runtime, instance, run]
  );

  const complete = useCallback(
    (finalData) =>
      run(async () => {
        if (!runtime || !instance) throw new Error("No active workflow");
        const inc = await runtime.workflow.completeWorkflow(instance.id, finalData);
        setIncident(inc);
        const snap = await runtime.workflow.getWorkflowInstance(instance.id);
        setInstance(snap);
      }),
    [runtime, instance, run]
  );

  return {
    instance,
    result,
    incident,
    busy,
    error,
    done: instance?.state === "COMPLETED",
    start,
    step,
    complete,
  };
}
