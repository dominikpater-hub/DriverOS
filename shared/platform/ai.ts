// shared/types/ai.ts
// TASK 4 (Artefakt #0003 §4): contracts only. No provider implementation
// lives here. AIResponse.trustLevel is typed so that T1/T2 are simply not
// representable — the Trust Ladder invariant (ADR-003) is enforced by the
// compiler, not by convention.

import type { AIRequestId, JsonValue, ModelId, StepId, VersionId, WorkflowVersionId } from "./ids";
import type { SituationContext } from "./context";
import type { RetryPolicy } from "./workflow";

export enum AIPurpose {
  EXPLAIN = "EXPLAIN",
  TRANSLATE = "TRANSLATE",
  OCR = "OCR",
  SUMMARIZE = "SUMMARIZE",
  CLASSIFY = "CLASSIFY",
  DRAFT_REPORT = "DRAFT_REPORT",
}

// Re-declared narrowly here (rather than importing the full TrustLevel enum)
// so that AIResponse can ONLY ever carry these two values — a compile-time
// guarantee that AI can never self-assign T1 or T2.
export enum AITrustLevel {
  T3_AI_ASSISTED = "T3_AI_ASSISTED",
  T4_FALLBACK = "T4_FALLBACK",
}

export interface AIExchange {
  request: string;
  response: string;
  timestamp: string;
}

export interface PromptContext {
  situation: SituationContext; // never optional — Domain Model §3 invariant
  userInput: string | null;
  workflowState: Record<string, JsonValue>;
  history: AIExchange[];
}

export type AllowedKnowledgeMode = "STRICT" | "EXTEND";

export interface AllowedKnowledge {
  versionIds: VersionId[];
  mode: AllowedKnowledgeMode;
}

export interface TimeoutPolicy {
  softMs: number; // exceeded → try a cheaper/faster model
  hardMs: number; // exceeded → FallbackPolicy triggers
}

export interface CostBudget {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostEUR: number;
}

export type FallbackAction = "EMERGENCY_CARD" | "SKIP_STEP" | "STATIC_PHRASES";

export interface FallbackPolicy {
  onFailure: FallbackAction;
}

export interface AIRequest {
  id: AIRequestId;
  purpose: AIPurpose;
  promptContext: PromptContext;
  allowedKnowledge: AllowedKnowledge;
  policies: {
    retry: RetryPolicy;
    timeout: TimeoutPolicy;
    cost: CostBudget;
    fallback: FallbackPolicy;
  };
  createdBy: { workflowVersionId: WorkflowVersionId; stepId: StepId };
}

export interface AIReasoning {
  citedVersions: VersionId[];
  uncitedClaims: boolean;
  refused: boolean;
}

export interface AIUsage {
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  costEUR: number;
}

export interface ValidationIssue {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface AIResponse {
  requestId: AIRequestId;
  content: string;
  trustLevel: AITrustLevel;
  reasoning: AIReasoning;
  usage: AIUsage;
  validation: ValidationResult;
}

/**
 * Raw, unvalidated shape coming back from a provider SDK — deliberately
 * loose. ResponseValidator is the only thing allowed to turn this into a
 * trusted AIResponse.
 */
export interface RawProviderResponse {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ResponseValidator {
  validate(request: AIRequest, raw: RawProviderResponse): ValidationResult;
}

/**
 * §4.3 — enumerated so that "forbidden" is a checklist, not a paragraph of
 * prose someone has to remember to re-read.
 */
export enum ForbiddenBehaviour {
  SELF_ASSIGN_T1_OR_T2 = "SELF_ASSIGN_T1_OR_T2", // not representable in AITrustLevel anyway
  INVENT_LEGAL_CITATION = "INVENT_LEGAL_CITATION",
  DECIDE_WORKFLOW_TRANSITION = "DECIDE_WORKFLOW_TRANSITION",
  RECEIVE_INPUT_WITHOUT_CONTEXT = "RECEIVE_INPUT_WITHOUT_CONTEXT", // PromptContext.situation is required
  PUBLISH_OR_MODIFY_KNOWLEDGE = "PUBLISH_OR_MODIFY_KNOWLEDGE",
  PERSIST_PII = "PERSIST_PII",
  EXCEED_COST_BUDGET = "EXCEED_COST_BUDGET",
}
