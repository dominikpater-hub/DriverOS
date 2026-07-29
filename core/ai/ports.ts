// AUTO-SPLIT z core/index.ports.ts — porty per kontekst (spec §8.3 / ADR fix).
import { SituationContext, TrustLevel, VersionId } from "../../shared/types";
import { KnowledgeVersionSnapshot } from "../../shared/snapshots";

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
  trustLevel: TrustLevel.T3_AI_ASSISTED | TrustLevel.T4_FALLBACK;
  
  /** Token usage for billing */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  
  /** Source knowledge used */
  sourcesUsed?: VersionId[];
}
