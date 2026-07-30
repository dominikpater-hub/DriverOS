/**
 * AI ENGINE
 *
 * Assists but never decides.
 * - Always receives context + verified knowledge
 * - Never receives raw user prompt
 * - Knows about model routing (Haiku for 80% of tasks, Sonnet for reasoning)
 * - Always marks response as T3_AI_ASSISTED or T4_FALLBACK
 *
 * This is NOT the source of truth — Knowledge Engine is.
 * This is a service, not a decision-maker.
 */

import {
  StepKind,
  TrustLevel,
  VersionId,
  Connectivity
} from "../../shared/types";

import {
  IAIPort,
  AIRequest,
  AIResponse,

} from "./ports";
import { KnowledgeVersionSnapshot } from "../../shared/snapshots";
import { ResponseValidator } from "./ResponseValidator";

// ============================================================================
// MODEL ROUTER — Cost optimization
// ============================================================================

/**
 * Route AI tasks to appropriate models
 * Haiku ($1/$5) for 80% of tasks
 * Sonnet ($3/$15) for complex reasoning
 * Opus ($5/$25) never in runtime (only offline for batch processing)
 */
interface ModelRoute {
  stepKind: StepKind;
  model: "haiku" | "sonnet" | "opus";
  estimatedTokens?: { input: number; output: number };
}

const MODEL_ROUTING: ModelRoute[] = [
  // Haiku for everything fast and simple
  { stepKind: StepKind.TRANSLATE, model: "haiku" },
  { stepKind: StepKind.OCR, model: "haiku" },
  
  // Sonnet for reasoning about legal context
  { stepKind: StepKind.AI_ASSIST, model: "sonnet" },
  
  // Decision Point is never AI-only
  // (Decision Engine handles it)
];

/**
 * AIRequest.stepKind is typed as `string` in the port (so callers can pass
 * ad-hoc step kinds), but routing only understands the known StepKind enum.
 * Unknown values fall through to the "haiku" default in routeModel().
 */
function asStepKind(value: string): StepKind | undefined {
  return (Object.values(StepKind) as string[]).includes(value) ? (value as StepKind) : undefined;
}

/**
 * Token estimate for budgeting
 */
const TOKEN_BUDGETS = {
  haiku: { input: 10000, output: 5000 },
  sonnet: { input: 50000, output: 15000 },
  opus: { input: 100000, output: 50000 }
};

/**
 * Cost per million tokens (July 2026 pricing)
 */
const PRICING = {
  haiku: { input: 1.0, output: 5.0 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 5.0, output: 25.0 }
};

// ============================================================================
// AI PROVIDER INTERFACE
// ============================================================================

/**
 * Abstraction for actual LLM calls
 * Implementations: Claude API, OpenAI, etc.
 */
export interface ILLMProvider {
  generateText(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
  }): Promise<{
    text: string;
    usage: { inputTokens: number; outputTokens: number };
  }>;
}

// ============================================================================
// AI ENGINE
// ============================================================================

export class AIEngine implements IAIPort {
  constructor(
    private llmProvider: ILLMProvider,
    // M4: every response passes this gate before it can be T3. Injectable for
    // tests; defaults to the standard validator.
    private validator: ResponseValidator = new ResponseValidator()
  ) {}

  /**
   * Assist with task
   * Always returns T3_AI_ASSISTED or T4_FALLBACK
   */
  async assist(request: AIRequest): Promise<AIResponse> {
    // Validate: AI never receives raw prompt
    if (!request.context) {
      throw new Error("AI request must include SituationContext");
    }

    // Validate: if online, knowledge should be provided
    if (request.context.connectivity === Connectivity.ONLINE && !request.knowledgeContext.length) {
      console.warn("[AIEngine] Online but no knowledge provided — falling back");
      return this.fallbackResponse(request);
    }

    // Offline fallback
    if (request.context.connectivity === Connectivity.OFFLINE) {
      return this.fallbackResponse(request);
    }

    // Select model
    const knownStepKind = asStepKind(request.stepKind);
    const model = request.modelHint || (knownStepKind ? this.routeModel(knownStepKind) : "haiku");

    // Build prompt with context + knowledge
    const systemPrompt = this.buildSystemPrompt(request, model);
    const userPrompt = this.buildUserPrompt(request);

    try {
      const response = await this.llmProvider.generateText({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...request.history?.map(msg => ({
            role: msg.role,
            content: msg.content
          })) || [],
          { role: "user", content: userPrompt }
        ],
        maxTokens: TOKEN_BUDGETS[model as keyof typeof TOKEN_BUDGETS].output
      });

      // Extract sources that were referenced
      const sourcesUsed = this.extractReferencedSources(response.text, request.knowledgeContext);

      // M4 / TRUST-1: gate the answer. A response that cites sources outside the
      // provided grounding, or that invents a legal signature, must NOT ship as
      // T3 — it degrades to the safe T4 fallback. Only validated sources are
      // attributed.
      const verdict = this.validator.validate({
        responseText: response.text,
        allowedKnowledge: request.knowledgeContext,
        citedSources: sourcesUsed
      });

      if (!verdict.valid) {
        console.warn(
          `[AIEngine] Response failed validation, degrading to T4: ${verdict.reasons.join("; ")}`
        );
        return this.fallbackResponse(request);
      }

      return {
        content: response.text,
        trustLevel: TrustLevel.T3_AI_ASSISTED,
        usage: response.usage,
        sourcesUsed: verdict.validatedSources
      };
    } catch (error) {
      console.error("[AIEngine] LLM call failed:", error);
      return this.fallbackResponse(request);
    }
  }

  // ========================================================================
  // INTERNAL LOGIC
  // ========================================================================

  /**
   * Route step kind to model
   */
  private routeModel(stepKind: StepKind): "haiku" | "sonnet" | "opus" {
    const route = MODEL_ROUTING.find(r => r.stepKind === stepKind);
    return route?.model || "haiku"; // Default to cheap
  }

  /**
   * Build system prompt that guards against hallucination
   * Emphasizes: use verified knowledge, mark as AI assistance
   */
  private buildSystemPrompt(request: AIRequest, model: string): string {
    const knowledgeText = request.knowledgeContext
      .map(k => `- [${k.confidence}] ${k.content.summary}`)
      .join("\n");

    return `You are a helpful assistant for Guardian Engine.

CRITICAL RULES:
1. You are assisting, not deciding. Never make legal claims.
2. Base all answers on the verified knowledge provided below.
3. If verified knowledge doesn't cover the situation, say so explicitly.
4. Always mark your response as "AI-assisted" — not verified legal advice.
5. Reference the verified knowledge sources when applicable.
6. When uncertain, default to "I don't know" rather than guess.

VERIFIED KNOWLEDGE AVAILABLE:
${knowledgeText || "(No verified knowledge for this situation)"}

USER CONTEXT:
- Country: ${request.context.resolvedCountry}
- Language: ${request.context.language}
- Connectivity: ${request.context.connectivity}
- Step: ${request.stepKind}

Remember: You are a tool to explain verified knowledge, not a source of truth.`;
  }

  /**
   * Build user prompt from request
   */
  private buildUserPrompt(request: AIRequest): string {
    return `${request.prompt}\n\nPlease base your answer on the verified knowledge provided above, and mark this as AI-assisted rather than verified legal advice.`;
  }

  /**
   * Extract which sources were actually referenced
   */
  private extractReferencedSources(
    response: string,
    knowledgeContext: KnowledgeVersionSnapshot[]
  ): VersionId[] {
    // Naive implementation: check if response mentions any source references
    // In production: semantic similarity or explicit citation parsing
    return knowledgeContext.map(k => k.id);
  }

  /**
   * Fallback response (offline or error)
   */
  private fallbackResponse(request: AIRequest): AIResponse {
    return {
      content: "I'm unable to provide assistance at this moment. Please contact your local emergency services or consulate for help.",
      trustLevel: TrustLevel.T4_FALLBACK,
      sourcesUsed: []
    };
  }
}

// ============================================================================
// LLM PROVIDER — Claude API Implementation
// ============================================================================

/**
 * Real implementation using Claude API
 */
export class ClaudeAPIProvider implements ILLMProvider {
  constructor(
    private apiKey: string,
    private modelMap: Record<string, string> = {
      haiku: "claude-haiku-4-5-20250905",
      sonnet: "claude-sonnet-4-6",
      opus: "claude-opus-4-8"
    }
  ) {}

  async generateText(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
  }): Promise<{
    text: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    // In production: call real Claude API
    // For MVP: mock response
    const modelId = this.modelMap[params.model] || params.model;

    // Mock call
    console.log(`[ClaudeAPIProvider] Calling ${modelId} with ${params.messages.length} messages`);

    return {
      text: "This is a mock AI response. In production, this would call the actual Claude API.",
      usage: {
        inputTokens: 150,
        outputTokens: 50
      }
    };
  }
}

// ============================================================================
// MODEL COST CALCULATOR
// ============================================================================

export class ModelCostCalculator {
  /**
   * Estimate cost of an AI request
   */
  estimateCost(model: "haiku" | "sonnet" | "opus", tokens: { input: number; output: number }): number {
    const rates = PRICING[model];
    const inputCost = (tokens.input / 1_000_000) * rates.input;
    const outputCost = (tokens.output / 1_000_000) * rates.output;
    return inputCost + outputCost;
  }

  /**
   * Compare costs of different models for same task
   */
  compareModels(tokens: { input: number; output: number }): Record<string, number> {
    return {
      haiku: this.estimateCost("haiku", tokens),
      sonnet: this.estimateCost("sonnet", tokens),
      opus: this.estimateCost("opus", tokens)
    };
  }
}

// ============================================================================
// COST OPTIMIZATION — Prompt Caching & Batch Processing
// ============================================================================

/**
 * Prompt caching: freeze Knowledge Engine context
 * Cache hit reduces input cost by 90%
 */
export interface CacheConfig {
  enabled: boolean;
  ttlSeconds?: number;
  minPromptLength?: number; // Minimum length to cache
}

/**
 * Batch API: accumulate requests, process overnight at 50% discount
 */
export interface BatchRequest {
  requests: AIRequest[];
  scheduledFor?: Date;
  priority?: "low" | "normal" | "high";
}

export class BatchProcessor {
  /**
   * Accumulate AI requests for batch processing
   * Reduces cost by 50% for non-urgent tasks
   */
  static async queueForBatch(request: AIRequest, priority: "low" | "normal" | "high" = "normal"): Promise<void> {
    // In production: queue to database, process with batch API
    console.log(`[BatchProcessor] Queued request with priority ${priority}`);
  }

  /**
   * Calculate savings from batch vs standard
   */
  static calculateSavings(model: "haiku" | "sonnet" | "opus", tokens: { input: number; output: number }): {
    standardCost: number;
    batchCost: number;
    savingsPercent: number;
  } {
    const calc = new ModelCostCalculator();
    const standard = calc.estimateCost(model, tokens);
    const batch = standard * 0.5; // 50% discount

    return {
      standardCost: standard,
      batchCost: batch,
      savingsPercent: 50
    };
  }
}
