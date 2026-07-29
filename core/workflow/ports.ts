// AUTO-SPLIT z core/index.ports.ts — porty per kontekst (spec §8.3 / ADR fix).
import { WorkflowDefId, StepId, InstanceId, IncidentId, CountryCode, LanguageCode, TrustLevel, VersionId, SituationContext } from "../../shared/types";

/**
 * Workflow orchestration.
 * Knows all ports (Knowledge, Context, Decision, AI).
 * Coordinates execution of steps.
 * Persists WorkflowInstance and Incident.
 */
export interface IWorkflowPort {
  /**
   * Start a new workflow
   */
  startWorkflow(input: StartWorkflowInput): Promise<WorkflowInstanceSnapshot>;

  /**
   * Execute next step
   */
  executeStep(
    instanceId: InstanceId,
    stepInput?: Record<string, unknown>
  ): Promise<StepExecutionResult>;

  /**
   * Get current workflow state
   */
  getWorkflowInstance(instanceId: InstanceId): Promise<WorkflowInstanceSnapshot | null>;

  /**
   * Complete workflow and generate incident report
   */
  completeWorkflow(
    instanceId: InstanceId,
    finalData?: Record<string, unknown>
  ): Promise<IncidentSnapshot>;
}

export interface StartWorkflowInput {
  userId: string;
  defId: WorkflowDefId;
  initialData?: Record<string, unknown>;
  location?: { latitude: number; longitude: number };
  language?: LanguageCode;
  vehicleId?: string;
}

export interface WorkflowInstanceSnapshot {
  id: InstanceId;
  defId: WorkflowDefId;
  state: "ACTIVE" | "SUSPENDED" | "COMPLETED" | "ABANDONED";
  currentStepId: StepId;
  contextSnapshot: SituationContext;
  createdAt: Date;
  updatedAt: Date;
}

export interface StepExecutionResult {
  stepId: StepId;
  kind: string; // SHOW_KNOWLEDGE | COLLECT_INPUT | AI_ASSIST | etc.
  
  /** What should UI render? */
  uiPrompt?: {
    title: string;
    content: string;
    trustLevel?: TrustLevel;
  };
  
  /** Next step or end */
  nextStepId?: StepId;
  
  /** Optional: attachment (photo, OCR result) */
  attachment?: {
    type: string;
    data: string; // base64
    metadata?: Record<string, unknown>;
  };
}

export interface IncidentSnapshot {
  id: IncidentId;
  instanceId: InstanceId;
  country: CountryCode;
  occurredAt: Date;
  
  /** Which knowledge versions were shown? (ADR-002 for legal evidence) */
  knowledgeUsed: Array<{
    versionId: VersionId;
    trustLevel: TrustLevel;
  }>;
  
  /** Report content */
  report?: string;
}

/**
 * UI renders only WorkflowInstance state.
 * Never depends on engines directly.
 * All information flows through Workflow.
 */
export interface UIState {
  workflowInstance: WorkflowInstanceSnapshot;
  currentStep: StepExecutionResult;
  trustLevel: TrustLevel;
}
