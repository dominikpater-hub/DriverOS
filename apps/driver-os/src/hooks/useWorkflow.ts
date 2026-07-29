/**
 * useWorkflow
 *
 * The ONLY bridge between DriverOS UI and Guardian Engine. Per Domain
 * Model §1: "UI zna tylko stan WorkflowInstance. Nigdy silniki
 * bezpośrednio." This hook talks to a WorkflowController HTTP API
 * (server-side, wrapping WorkflowEngine) — it never imports core/*
 * directly. That boundary is what keeps this component thin.
 *
 * The controller endpoints this expects:
 *   POST /api/workflows                 -> StartWorkflowInput  => WorkflowInstanceSnapshot
 *   POST /api/workflows/:id/steps        -> stepInput           => StepExecutionResult
 *   GET  /api/workflows/:id              ->                     => WorkflowInstanceSnapshot
 *   POST /api/workflows/:id/complete     -> finalData           => IncidentSnapshot
 * (Controller itself is a Week 4 backend task — see BUILD_STATUS.md.)
 */

import { useCallback, useState } from "react";

// Mirrors core/index.ports.ts shapes. Duplicated here (not imported from
// core/) deliberately — this is the UI's contract with the HTTP API, not
// with the engine directly. If the two drift, that's a signal the API
// needs a version bump, not that the UI accidentally reached into core/.
export interface UIPrompt {
  title: string;
  content: string;
  trustLevel?: string;
}

export interface StepExecutionResultUI {
  stepId: string;
  kind: string;
  uiPrompt?: UIPrompt;
  nextStepId?: string;
  attachment?: { type: string; data: string };
}

export interface WorkflowInstanceUI {
  id: string;
  defId: string;
  state: "ACTIVE" | "SUSPENDED" | "COMPLETED" | "ABANDONED";
  currentStepId: string;
}

interface UseWorkflowState {
  instance: WorkflowInstanceUI | null;
  lastResult: StepExecutionResultUI | null;
  loading: boolean;
  error: string | null;
}

interface UseWorkflowApi {
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "/api/workflows";

export function useWorkflow({ baseUrl = DEFAULT_BASE_URL }: UseWorkflowApi = {}) {
  const [state, setState] = useState<UseWorkflowState>({
    instance: null,
    lastResult: null,
    loading: false,
    error: null
  });

  const start = useCallback(
    async (input: {
      userId: string;
      defId: string;
      location?: { latitude: number; longitude: number };
      language?: string;
    }) => {
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input)
        });
        if (!res.ok) throw new Error(`Failed to start workflow: ${res.status}`);
        const instance: WorkflowInstanceUI = await res.json();
        setState({ instance, lastResult: null, loading: false, error: null });
        return instance;
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: (err as Error).message }));
        throw err;
      }
    },
    [baseUrl]
  );

  const executeStep = useCallback(
    async (stepInput?: Record<string, unknown>) => {
      if (!state.instance) throw new Error("No active workflow instance");
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(`${baseUrl}/${state.instance.id}/steps`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stepInput ?? {})
        });
        if (!res.ok) throw new Error(`Failed to execute step: ${res.status}`);
        const result: StepExecutionResultUI = await res.json();

        // Refresh instance state after the step (state, currentStepId may
        // have changed, including via an offline fallback transition).
        const refreshed = await fetch(`${baseUrl}/${state.instance.id}`);
        const instance: WorkflowInstanceUI = await refreshed.json();

        setState({ instance, lastResult: result, loading: false, error: null });
        return result;
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: (err as Error).message }));
        throw err;
      }
    },
    [baseUrl, state.instance]
  );

  const complete = useCallback(
    async (finalData?: Record<string, unknown>) => {
      if (!state.instance) throw new Error("No active workflow instance");
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const res = await fetch(`${baseUrl}/${state.instance.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalData ?? {})
        });
        if (!res.ok) throw new Error(`Failed to complete workflow: ${res.status}`);
        const incident = await res.json();
        setState(s => ({ ...s, loading: false }));
        return incident;
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: (err as Error).message }));
        throw err;
      }
    },
    [baseUrl, state.instance]
  );

  return {
    instance: state.instance,
    lastResult: state.lastResult,
    loading: state.loading,
    error: state.error,
    start,
    executeStep,
    complete
  };
}
