/**
 * GUARDIAN ENGINE PORTS
 *
 * These interfaces define the contracts between engines.
 * Workflow Engine depends on these ports, never on implementations.
 * No engine knows about Workflow Engine (Dependency Inversion).
 *
 * Graph dependency (ADR-001):
 *   Knowledge ──┐
 *   Context   ──┼──> Workflow (orchestrator)
 *   Decision  ──┤      ↓
 *              └──>  AI (service)
 */

import {
  KnowledgeId,
  VersionId,
  CountryCode,
  LanguageCode,
  TrustLevel,
  SituationContext,
  WorkflowDefId,
  StepId,
  InstanceId,
  IncidentId,
  StructuredContent,
  SourceRef,
  ConfidenceLevel,
  CardId
} from "../shared/types";

export type { SituationContext };

// ============================================================================
// KNOWLEDGE ENGINE PORT
// ============================================================================

/**
 * Query interface for Knowledge Engine
 * Knowledge never generates content — it stores and retrieves verified information
 */
export interface IKnowledgePort {
  /**
   * Retrieve a knowledge entry by ID
   */
  getKnowledgeEntry(
    id: KnowledgeId,
    country: CountryCode,
    language: LanguageCode
  ): Promise<KnowledgeEntrySnapshot | null>;

  /**
   * Search knowledge by domain, country, tags
   * Returns current versions only
   */
  searchKnowledge(query: KnowledgeSearchQuery): Promise<KnowledgeEntrySnapshot[]>;

  /**
   * Get specific version (for audits, historical lookups)
   * Every incident must point to the exact version shown to user
   */
  getKnowledgeVersion(id: VersionId): Promise<KnowledgeVersionSnapshot | null>;

  /**
   * Get emergency card for country
   * MUST work offline (baked into TIER_0 package)
   */
  getEmergencyCard(country: CountryCode, language: LanguageCode): Promise<EmergencyCardSnapshot | null>;

  /**
   * List all versions of a knowledge entry
   * For rebuilding history of what changed when
   */
  listVersions(entryId: KnowledgeId): Promise<VersionMetadata[]>;
}

export interface KnowledgeSearchQuery {
  domain?: string;
  country?: CountryCode;
  tags?: string[];
  language: LanguageCode;
}

export interface KnowledgeEntrySnapshot {
  id: KnowledgeId;
  currentVersionId: VersionId;
  currentVersion: KnowledgeVersionSnapshot;
  country: CountryCode;
  domain: string;
}

export interface KnowledgeVersionSnapshot {
  id: VersionId;
  entryId: KnowledgeId;
  language: LanguageCode;
  content: StructuredContent;
  confidence: ConfidenceLevel;
  effectiveDate: Date;
  validUntil: Date | null;
  verifiedAt: Date;
  nextReviewDue: Date;
  supersededBy: VersionId | null;
  checksum: string; // For offline package integrity
}

export interface VersionMetadata {
  id: VersionId;
  verifiedAt: Date;
  supersededBy: VersionId | null;
}

export interface EmergencyCardSnapshot {
  id: CardId;
  country: CountryCode;
  type: string; // POLICE_STOP | ACCIDENT | MEDICAL | CONSULATE | RIGHTS
  content: StructuredContent;
  contacts: EmergencyContact[];
  tier: "TIER_0";
}

export interface EmergencyContact {
  type: "EMERGENCY" | "CONSULATE" | "LOCAL";
  name: string;
  number: string;
  language: LanguageCode;
}

// ============================================================================
// CONTEXT ENGINE PORT
// ============================================================================

/**
 * Builds SituationContext on demand.
 * Context is ephemeral — not persisted, only snapshotted in Incidents
 */
export interface IContextPort {
  /**
   * Resolve country from GPS or user input
   * Falls back to user's declared homeCountry
   */
  resolveCountry(geoPoint?: { lat: number; lng: number }): Promise<CountryCode>;

  /**
   * Get user profile
   */
  getUserProfile(userId: string): Promise<UserProfileSnapshot | null>;

  /**
   * Get vehicle info
   */
  getVehicle(vehicleId: string): Promise<VehicleSnapshot | null>;

  /**
   * Build full context snapshot
   * Called at workflow start; snapshot frozen for entire incident
   */
  buildContext(input: ContextBuildInput): Promise<SituationContext>;
}

export interface ContextBuildInput {
  userId: string;
  location?: { latitude: number; longitude: number };
  language?: LanguageCode;
  vehicleId?: string;
}

export interface UserProfileSnapshot {
  id: string;
  type: "PRO_DRIVER" | "TRAVELER" | "FLEET_DRIVER" | "RIDER" | "CAMPER";
  languages: LanguageCode[];
  homeCountry: CountryCode;
}

export interface VehicleSnapshot {
  id: string;
  category: "TRUCK" | "VAN" | "CAR" | "MOTORCYCLE" | "CAMPER";
  adrClass?: string;
}

// ============================================================================
// DECISION ENGINE PORT
// ============================================================================

/**
 * Deterministic rule engine.
 * Zero LLM. Zero probability.
 * Given identical input, always same output — 100% testable.
 */
export interface IDecisionPort {
  /**
   * Match rules and return outcome
   * Outcome typically points to WorkflowDefinition
   * or specifies a TrustLevel if no workflow applies
   */
  matchRules(input: DecisionInput): Promise<DecisionOutcome>;
}

export interface DecisionInput {
  country: CountryCode;
  userType?: string;
  vehicle?: {
    category: string;
    adrClass?: string;
  };
  eventType?: string; // e.g., "ROAD_INSPECTION", "ACCIDENT"
  context?: Record<string, unknown>;
}

export interface DecisionOutcome {
  /** Workflow to execute (e.g., "Inspection_DE") */
  workflowDefId?: WorkflowDefId;
  
  /** If no workflow, specify trust level for fallback */
  fallbackTrustLevel?: TrustLevel;
  
  /** Human-readable explanation for debugging */
  reasoning?: string;
}

// ============================================================================
// WORKFLOW ENGINE PORT
// ============================================================================

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

// ============================================================================
// AI ENGINE PORT
// ============================================================================

/**
 * AI assistance service.
 * AI is NOT a source of truth.
 * AI always receives context and verified knowledge.
 * Never receives raw user prompt alone.
 */
export interface IAIPort {
  /**
   * Assist with task
   * Always returns with trustLevel = T3_AI_ASSISTED or T4_FALLBACK
   */
  assist(request: AIRequest): Promise<AIResponse>;
}

export interface AIRequest {
  /** User prompt */
  prompt: string;
  
  /** Full situation context */
  context: SituationContext;
  
  /** Verified knowledge to base answer on */
  knowledgeContext: KnowledgeVersionSnapshot[];
  
  /** What workflow step are we in? */
  stepKind: string; // TRANSLATE | OCR | EXPLAIN | etc.
  
  /** Model routing hint */
  modelHint?: "haiku" | "sonnet" | "opus";
  
  /** Previous messages in conversation */
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export interface AIResponse {
  content: string;
  
  /** Always explicit — never claims to be verified knowledge */
  trustLevel: TrustLevel.AI_ASSISTED | TrustLevel.FALLBACK;
  
  /** Token usage for billing */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  
  /** Source knowledge used */
  sourcesUsed?: VersionId[];
}

// ============================================================================
// UI STATE PORT
// ============================================================================

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
