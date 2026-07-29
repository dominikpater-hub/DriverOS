/**
 * WORKFLOW ENGINE
 *
 * Orchestrates all other engines (Knowledge, Context, Decision, AI).
 * - Workflow is the only entity that knows all ports
 * - Every incident is a workflow
 * - Steps are atomic (SHOW_KNOWLEDGE, COLLECT_INPUT, AI_ASSIST, etc.)
 * - Incident is generated at end of workflow
 *
 * This is where user journey logic lives.
 */

import {
  InstanceId,
  WorkflowDefId,
  StepId,
  IncidentId,
  VersionId,
  TrustLevel,
  StepKind,
  Capability,
  WorkflowInstanceState,
  SituationContext,
  CountryCode,
  Connectivity,
  createInstanceId,
  createIncidentId
} from "../../shared/types";

import {
  IWorkflowPort,
  IKnowledgePort,
  IContextPort,
  IDecisionPort,
  IAIPort,
  StartWorkflowInput,
  WorkflowInstanceSnapshot,
  StepExecutionResult,
  IncidentSnapshot,
  DecisionInput,
  AIRequest
} from "../index.ports";

// ============================================================================
// INTERNAL ENTITIES
// ============================================================================

/**
 * WorkflowDefinition — static, part of build
 * Defines workflow structure: steps, transitions, offline capabilities
 */
export interface WorkflowDefinition {
  id: WorkflowDefId;
  name: string;
  version: string;
  steps: StepDefinition[];
  entryStepId: StepId;
  offlineCapable: boolean;
}

/**
 * StepDefinition — single unit of work in workflow
 */
export interface StepDefinition {
  id: StepId;
  kind: StepKind;
  title: string;
  description?: string;
  requires: Capability[];
  fallback?: StepId;
  next?: StepId | StepId[]; // Linear or branching
  data?: Record<string, unknown>;
}

/**
 * WorkflowInstance — runtime state
 */
interface WorkflowInstance {
  id: InstanceId;
  defId: WorkflowDefId;
  state: WorkflowInstanceState;
  currentStepId: StepId;
  contextSnapshot: SituationContext;
  data: Record<string, unknown>;
  history: StepRecord[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * StepRecord — history entry
 */
interface StepRecord {
  stepId: StepId;
  kind: StepKind;
  result?: StepExecutionResult;
  knowledgeUsed?: Array<{ versionId: VersionId; trustLevel: TrustLevel }>;
  timestamp: Date;
}

/**
 * Incident — final report after workflow completion
 */
interface Incident {
  id: IncidentId;
  instanceId: InstanceId;
  country: CountryCode;
  occurredAt: Date;
  knowledgeUsed: Array<{ versionId: VersionId; trustLevel: TrustLevel }>;
  attachments: Array<{
    type: string;
    data: string;
    metadata?: Record<string, unknown>;
  }>;
  report?: string;
  anonymizedAt?: Date;
}

// ============================================================================
// STORAGE INTERFACE
// ============================================================================

interface IWorkflowStorage {
  getInstance(id: InstanceId): Promise<WorkflowInstance | null>;
  getDefinition(id: WorkflowDefId): Promise<WorkflowDefinition | null>;
  saveInstance(instance: WorkflowInstance): Promise<void>;
  saveIncident(incident: Incident): Promise<void>;
  getIncident(id: IncidentId): Promise<Incident | null>;
}

// ============================================================================
// WORKFLOW ENGINE
// ============================================================================

type StepExecutorFn = (
  stepDef: StepDefinition,
  instance: WorkflowInstance,
  knowledgeUsed: Array<{ versionId: VersionId; trustLevel: TrustLevel }>,
  stepInput?: Record<string, unknown>
) => Promise<StepExecutionResult>;

export class WorkflowEngine implements IWorkflowPort {
  // §8.3 OCP fix: dispatch by registry, not switch(kind). Adding a StepKind
  // means registering an executor (registerExecutor) — never editing executeStep.
  private readonly executors = new Map<StepKind, StepExecutorFn>();

  constructor(
    private storage: IWorkflowStorage,
    private knowledge: IKnowledgePort,
    private context: IContextPort,
    private decision: IDecisionPort,
    private ai: IAIPort
  ) {
    this.registerDefaultExecutors();
  }

  /** Register (or override) an executor for a StepKind. Throws on duplicate. */
  registerExecutor(kind: StepKind, fn: StepExecutorFn): void {
    if (this.executors.has(kind)) {
      throw new Error(`StepExecutor for kind "${kind}" is already registered`);
    }
    this.executors.set(kind, fn);
  }

  private registerDefaultExecutors(): void {
    this.executors.set(StepKind.SHOW_KNOWLEDGE, (s, i, k) => this.executeShowKnowledge(s, i, k));
    this.executors.set(StepKind.COLLECT_INPUT, (s, i, _k, inp) => this.executeCollectInput(s, i, inp));
    this.executors.set(StepKind.AI_ASSIST, (s, i, k, inp) => this.executeAIAssist(s, i, k, inp));
    this.executors.set(StepKind.EMERGENCY_CARD, (s, i, k) => this.executeEmergencyCard(s, i, k));
    this.executors.set(StepKind.CAPTURE_PHOTO, (s, i, _k, inp) => this.executeCapturePhoto(s, i, inp));
    this.executors.set(StepKind.TRANSLATE, (s, i, k, inp) => this.executeTranslate(s, i, k, inp));
    this.executors.set(StepKind.GENERATE_REPORT, (s, i) => this.executeGenerateReport(s, i));
  }

  /**
   * Start new workflow
   */
  async startWorkflow(input: StartWorkflowInput): Promise<WorkflowInstanceSnapshot> {
    // Build context (frozen for this workflow instance).
    // ContextEngine.buildContext() already falls back sensibly when these
    // are omitted (GPS -> homeCountry, language -> profile's first language),
    // so we only pass through what the caller actually gave us.
    const contextSnapshot = await this.context.buildContext({
      userId: input.userId,
      location: input.location,
      language: input.language,
      vehicleId: input.vehicleId
    });

    // Decide which workflow to run
    // (Could have been passed in, or we ask Decision Engine)
    const workflowDef = await this.storage.getDefinition(input.defId);
    if (!workflowDef) {
      throw new Error(`Workflow definition ${input.defId} not found`);
    }

    // Create instance
    const instance: WorkflowInstance = {
      id: createInstanceId(`WF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
      defId: workflowDef.id,
      state: WorkflowInstanceState.ACTIVE,
      currentStepId: workflowDef.entryStepId,
      contextSnapshot,
      data: input.initialData || {},
      history: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.storage.saveInstance(instance);

    return this.snapshotInstance(instance);
  }

  /**
   * Execute next step in workflow
   */
  async executeStep(
    instanceId: InstanceId,
    stepInput?: Record<string, unknown>
  ): Promise<StepExecutionResult> {
    const instance = await this.storage.getInstance(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    if (instance.state !== WorkflowInstanceState.ACTIVE) {
      throw new Error(`Instance ${instanceId} is not active`);
    }

    const workflowDef = await this.storage.getDefinition(instance.defId);
    if (!workflowDef) throw new Error(`Definition ${instance.defId} not found`);

    const stepDef = workflowDef.steps.find(s => s.id === instance.currentStepId);
    if (!stepDef) throw new Error(`Step ${instance.currentStepId} not found`);

    let result: StepExecutionResult;
    const knowledgeUsedInStep: Array<{ versionId: VersionId; trustLevel: TrustLevel }> = [];

    try {
      // §8.3 OCP: dispatch via the executor registry, not a switch(kind).
      const exec = this.executors.get(stepDef.kind);
      if (!exec) {
        throw new Error(
          `Step kind "${stepDef.kind}" has no executor registered. ` +
          `Register one via registerExecutor() — do not add a case here.`
        );
      }
      result = await exec(stepDef, instance, knowledgeUsedInStep, stepInput);
    } catch (error) {
      // Offline First (Handbook): if this step's executor fails — network
      // down, provider error, whatever — and a fallback is declared, take
      // it explicitly. nextStepId is set directly here rather than relying
      // on stepDef.next happening to equal stepDef.fallback; workflows are
      // not required to make those match.
      if (stepDef.fallback) {
        console.warn(
          `[WorkflowEngine] Step "${stepDef.id}" (${stepDef.kind}) failed, ` +
          `falling back to "${stepDef.fallback}": ${(error as Error).message}`
        );
        result = {
          stepId: stepDef.id,
          kind: stepDef.kind,
          nextStepId: stepDef.fallback
        };
      } else {
        throw error;
      }
    }

    // Record in history
    const record: StepRecord = {
      stepId: stepDef.id,
      kind: stepDef.kind,
      result,
      knowledgeUsed: knowledgeUsedInStep.length > 0 ? knowledgeUsedInStep : undefined,
      timestamp: new Date()
    };
    instance.history.push(record);

    // Move to next step
    if (result.nextStepId) {
      instance.currentStepId = result.nextStepId;
    } else if (stepDef.next) {
      instance.currentStepId = Array.isArray(stepDef.next) ? stepDef.next[0] : stepDef.next;
    } else {
      // No next step — workflow complete
      instance.state = WorkflowInstanceState.COMPLETED;
    }

    instance.updatedAt = new Date();
    await this.storage.saveInstance(instance);

    return result;
  }

  /**
   * Get current workflow state
   */
  async getWorkflowInstance(instanceId: InstanceId): Promise<WorkflowInstanceSnapshot | null> {
    const instance = await this.storage.getInstance(instanceId);
    return instance ? this.snapshotInstance(instance) : null;
  }

  /**
   * Complete workflow and generate incident
   */
  async completeWorkflow(
    instanceId: InstanceId,
    finalData?: Record<string, unknown>
  ): Promise<IncidentSnapshot> {
    const instance = await this.storage.getInstance(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    // Merge final data
    if (finalData) {
      instance.data = { ...instance.data, ...finalData };
    }

    // Create incident from workflow history
    const incident: Incident = {
      id: createIncidentId(`INC-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`),
      instanceId,
      country: instance.contextSnapshot.resolvedCountry,
      occurredAt: instance.createdAt,
      knowledgeUsed: this.collectKnowledgeFromHistory(instance.history),
      attachments: this.collectAttachmentsFromHistory(instance.history),
      report: instance.data.report as string | undefined
    };

    await this.storage.saveIncident(incident);

    instance.state = WorkflowInstanceState.COMPLETED;
    await this.storage.saveInstance(instance);

    return {
      id: incident.id,
      instanceId: incident.instanceId,
      country: incident.country,
      occurredAt: incident.occurredAt,
      knowledgeUsed: incident.knowledgeUsed
    };
  }

  // ========================================================================
  // STEP EXECUTORS
  // ========================================================================

  /**
   * Show knowledge from Knowledge Engine
   */
  private async executeShowKnowledge(
    stepDef: StepDefinition,
    instance: WorkflowInstance,
    knowledgeUsed: Array<{ versionId: VersionId; trustLevel: TrustLevel }>
  ): Promise<StepExecutionResult> {
    // Steps can narrow which knowledge they show via stepDef.data.knowledgeTags —
    // e.g. Inspection_DE's rights step vs. ADR_Check_DE's dangerous-goods step
    // both call SHOW_KNOWLEDGE but must not surface the same content.
    const tags = (stepDef.data?.knowledgeTags as string[] | undefined) ?? undefined;

    const knowledge = await this.knowledge.searchKnowledge({
      language: instance.contextSnapshot.language,
      country: instance.contextSnapshot.resolvedCountry,
      tags
    });

    if (knowledge.length === 0) {
      return {
        stepId: stepDef.id,
        kind: stepDef.kind,
        uiPrompt: {
          title: "No knowledge found",
          content: "We don't have verified information for your situation.",
          trustLevel: TrustLevel.T4_FALLBACK
        }
      };
    }

    const knowledgeEntry = knowledge[0];

    // Evidentiary requirement (Domain Model §5): every SHOW_KNOWLEDGE step
    // must record which exact version was shown, for the final Incident.
    knowledgeUsed.push({
      versionId: knowledgeEntry.currentVersionId,
      trustLevel: knowledgeEntry.trustLevel
    });

    return {
      stepId: stepDef.id,
      kind: stepDef.kind,
      uiPrompt: {
        title: knowledgeEntry.currentVersion.content.summary,
        content: knowledgeEntry.currentVersion.content.details,
        trustLevel: knowledgeEntry.trustLevel
      }
    };
  }

  /**
   * Collect input from user
   */
  private async executeCollectInput(
    stepDef: StepDefinition,
    instance: WorkflowInstance,
    stepInput?: Record<string, unknown>
  ): Promise<StepExecutionResult> {
    // Store input in instance data
    if (stepInput) {
      instance.data = { ...instance.data, ...stepInput };
    }

    return {
      stepId: stepDef.id,
      kind: stepDef.kind,
      uiPrompt: {
        title: stepDef.title,
        content: stepDef.description || ""
      }
    };
  }

  /**
   * AI assistance
   */
  private async executeAIAssist(
    stepDef: StepDefinition,
    instance: WorkflowInstance,
    knowledgeUsed: Array<{ versionId: VersionId; trustLevel: TrustLevel }>,
    stepInput?: Record<string, unknown>
  ): Promise<StepExecutionResult> {
    // Get context knowledge
    const knowledge = await this.knowledge.searchKnowledge({
      language: instance.contextSnapshot.language,
      country: instance.contextSnapshot.resolvedCountry
    });

    const aiRequest: AIRequest = {
      prompt: stepInput?.prompt as string || "",
      context: instance.contextSnapshot,
      knowledgeContext: knowledge.map(k => k.currentVersion),
      stepKind: stepDef.kind,
      modelHint: "haiku" // Default: start cheap
    };

    const aiResponse = await this.ai.assist(aiRequest);

    // Track knowledge used
    if (aiResponse.sourcesUsed) {
      for (const versionId of aiResponse.sourcesUsed) {
        knowledgeUsed.push({
          versionId,
          trustLevel: aiResponse.trustLevel
        });
      }
    }

    return {
      stepId: stepDef.id,
      kind: stepDef.kind,
      uiPrompt: {
        title: "AI Assistance",
        content: aiResponse.content,
        trustLevel: aiResponse.trustLevel
      }
    };
  }

  /**
   * Show emergency card
   */
  private async executeEmergencyCard(
    stepDef: StepDefinition,
    instance: WorkflowInstance,
    knowledgeUsed: Array<{ versionId: VersionId; trustLevel: TrustLevel }>
  ): Promise<StepExecutionResult> {
    const card = await this.knowledge.getEmergencyCard(
      instance.contextSnapshot.resolvedCountry,
      instance.contextSnapshot.language
    );

    if (!card) {
      return {
        stepId: stepDef.id,
        kind: stepDef.kind,
        uiPrompt: {
          title: "Emergency",
          content: "Call 112 or your local emergency number"
        }
      };
    }

    knowledgeUsed.push({
      versionId: card.id as any,
      trustLevel: TrustLevel.T1_VERIFIED
    });

    return {
      stepId: stepDef.id,
      kind: stepDef.kind,
      uiPrompt: {
        title: card.type,
        content: card.content.details
      }
    };
  }

  /**
   * Capture photo
   */
  private async executeCapturePhoto(
    stepDef: StepDefinition,
    instance: WorkflowInstance,
    stepInput?: Record<string, unknown>
  ): Promise<StepExecutionResult> {
    if (stepInput?.photo) {
      return {
        stepId: stepDef.id,
        kind: stepDef.kind,
        attachment: {
          type: "image/jpeg",
          data: stepInput.photo as string
        }
      };
    }

    return {
      stepId: stepDef.id,
      kind: stepDef.kind,
      uiPrompt: {
        title: "Capture Evidence",
        content: "Please take a photo"
      }
    };
  }

  /**
   * Translate documents/phrases for the officer.
   * Deliberately throws when offline so the fallback chain (phrase cards,
   * CAPTURE_PHOTO, etc.) is taken for a real reason — not as an accident
   * of an unimplemented step kind.
   */
  private async executeTranslate(
    stepDef: StepDefinition,
    instance: WorkflowInstance,
    knowledgeUsed: Array<{ versionId: VersionId; trustLevel: TrustLevel }>,
    stepInput?: Record<string, unknown>
  ): Promise<StepExecutionResult> {
    if (instance.contextSnapshot.connectivity === Connectivity.OFFLINE) {
      throw new Error("TRANSLATE requires network and connectivity is OFFLINE");
    }

    const textToTranslate = (stepInput?.text as string) || stepDef.description || "";

    const aiResponse = await this.ai.assist({
      prompt: `Translate the following for a local official: "${textToTranslate}"`,
      context: instance.contextSnapshot,
      knowledgeContext: [],
      stepKind: StepKind.TRANSLATE,
      modelHint: "haiku"
    });

    if (aiResponse.sourcesUsed) {
      for (const versionId of aiResponse.sourcesUsed) {
        knowledgeUsed.push({ versionId, trustLevel: aiResponse.trustLevel });
      }
    }

    return {
      stepId: stepDef.id,
      kind: stepDef.kind,
      uiPrompt: {
        title: "Übersetzung",
        content: aiResponse.content,
        trustLevel: aiResponse.trustLevel
      }
    };
  }

  /**
   * Generate report
   */
  private async executeGenerateReport(
    stepDef: StepDefinition,
    instance: WorkflowInstance
  ): Promise<StepExecutionResult> {
    const report = `Incident Report\n\nOccurred: ${instance.createdAt}\nLocation: ${instance.contextSnapshot.location}\n\nDetails: ${JSON.stringify(instance.data, null, 2)}`;

    instance.data.report = report;

    return {
      stepId: stepDef.id,
      kind: stepDef.kind,
      uiPrompt: {
        title: "Incident Report",
        content: report
      }
    };
  }

  // ========================================================================
  // INTERNAL HELPERS
  // ========================================================================

  private snapshotInstance(instance: WorkflowInstance): WorkflowInstanceSnapshot {
    return {
      id: instance.id,
      defId: instance.defId,
      state: instance.state,
      currentStepId: instance.currentStepId,
      contextSnapshot: instance.contextSnapshot,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt
    };
  }

  private collectKnowledgeFromHistory(
    history: StepRecord[]
  ): Array<{ versionId: VersionId; trustLevel: TrustLevel }> {
    const knowledge: Array<{ versionId: VersionId; trustLevel: TrustLevel }> = [];

    for (const record of history) {
      if (record.knowledgeUsed) {
        knowledge.push(...record.knowledgeUsed);
      }
    }

    return knowledge;
  }

  private collectAttachmentsFromHistory(history: StepRecord[]): Incident["attachments"] {
    const attachments: Incident["attachments"] = [];

    for (const record of history) {
      if (record.result?.attachment) {
        attachments.push(record.result.attachment);
      }
    }

    return attachments;
  }
}
