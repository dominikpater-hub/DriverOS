import {
  type IAIPort,
  type ILLMProvider,
  type AIRequest,
  type AIResponse,
  type Source,
  type ModelName,
  TrustLevel,
  Connectivity,
  StepKind,
  MODEL_IDS,
  TOKEN_BUDGETS,
} from "../../shared/types/ai.js";

/**
 * AI Engine — assists, never decides.
 *
 * Constitution / Domain Model invariants enforced here:
 *  - AI never receives a raw user prompt (must carry SituationContext).       [DM §3]
 *  - AI is never the source of truth: every response is T3 or T4, never T1/T2.[ADR-003]
 *  - Offline => deterministic fallback, no network touched.                   [Offline First]
 *  - The Engine depends on ILLMProvider (a port), never on a concrete API.    [ADR-005]
 */
export class AIEngine implements IAIPort {
  constructor(private readonly provider: ILLMProvider) {}

  async assist(request: AIRequest): Promise<AIResponse> {
    // Invariant 1: no context => this is a raw prompt => forbidden.
    if (!request.context) {
      throw new Error(
        "[AIEngine] AIRequest must include SituationContext. AI never receives a raw prompt."
      );
    }

    // Invariant 2: offline never reaches the network. Deterministic fallback.
    if (request.context.connectivity === Connectivity.OFFLINE) {
      return this.fallbackResponse(request);
    }

    // Invariant 3: online but empty knowledge is a soft failure — degrade to T4
    // rather than let the model improvise legal content unanchored.
    if (
      this.requiresKnowledge(request.stepKind) &&
      request.knowledgeContext.length === 0
    ) {
      return this.fallbackResponse(request);
    }

    const model = request.modelHint ?? this.routeModel(request.stepKind);
    const system = this.buildSystemPrompt(request);
    const userContent = this.buildUserPrompt(request);

    try {
      const result = await this.provider.generateText({
        model: MODEL_IDS[model],
        system,
        messages: [...(request.history ?? []), { role: "user", content: userContent }],
        maxTokens: TOKEN_BUDGETS[model].output,
      });

      return {
        content: result.text,
        trustLevel: TrustLevel.AI_ASSISTED, // never T1/T2 — AI cannot self-certify as verified
        sourcesUsed: this.extractReferencedSources(request),
        usage: result.usage,
        model,
      };
    } catch (err) {
      // Provider/network error mid-request => degrade, never throw at the user.
      console.warn("[AIEngine] provider error, degrading to fallback:", err);
      return this.fallbackResponse(request);
    }
  }

  /** Steps whose whole point is anchoring to verified knowledge. */
  private requiresKnowledge(kind: StepKind): boolean {
    return kind === StepKind.AI_ASSIST || kind === StepKind.SHOW_KNOWLEDGE;
  }

  /** Deterministic routing — cost optimization from README (Haiku 80%, Sonnet reasoning). */
  private routeModel(kind: StepKind): ModelName {
    switch (kind) {
      case StepKind.AI_ASSIST:
      case StepKind.DECISION_POINT:
        return "sonnet"; // legal-context reasoning
      case StepKind.TRANSLATE:
      case StepKind.OCR:
      default:
        return "haiku"; // bulk, cheap, fast
    }
  }

  private buildSystemPrompt(request: AIRequest): string {
    const { context } = request;
    const knowledgeBlock =
      request.knowledgeContext.length > 0
        ? request.knowledgeContext
            .map(
              (k, i) =>
                `[${i + 1}] (${k.language}, ver ${k.versionId})\n${k.summary}\n${k.details}`
            )
            .join("\n\n")
        : "(no verified knowledge supplied)";

    // Guardrails: this is where we stop the model becoming a source of truth.
    return [
      "You are the assistance layer of Guardian Engine.",
      "You explain and translate. You do NOT invent legal information.",
      "Only use the VERIFIED KNOWLEDGE below. If it does not cover the question,",
      "say so plainly and tell the user this is guidance, not legal advice.",
      "Never present yourself as an authoritative legal source.",
      "",
      `SITUATION: country=${context.resolvedCountry}, language=${context.language}, ` +
        `connectivity=${context.connectivity}, step=${request.stepKind}`,
      "",
      "VERIFIED KNOWLEDGE:",
      knowledgeBlock,
    ].join("\n");
  }

  private buildUserPrompt(request: AIRequest): string {
    // The user's text is data, wrapped — never the top-level instruction.
    return `User request (${request.context.language}):\n${request.prompt}`;
  }

  /** Which verified sources were available to this answer (for the Incident audit trail). */
  private extractReferencedSources(request: AIRequest): Source[] {
    return request.knowledgeContext.flatMap((k) => k.legalRefs);
  }

  private fallbackResponse(request: AIRequest): AIResponse {
    return {
      content:
        request.context.connectivity === Connectivity.OFFLINE
          ? "Offline. Follow the emergency card and your rights shown above. Contact 112 or your consulate if in doubt."
          : "No verified information is available for this exact situation. Follow the emergency card and rights shown. This is guidance, not legal advice.",
      trustLevel: TrustLevel.FALLBACK,
      sourcesUsed: this.extractReferencedSources(request),
      usage: { inputTokens: 0, outputTokens: 0 },
      model: "none",
    };
  }
}
