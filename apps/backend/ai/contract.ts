// Contract + validation for the AI proxy. Framework-agnostic on purpose:
// the HTTP adapter (Express/Fastify/Lambda) stays thin, this holds the rules.

/** What GuardianBackendProvider POSTs to /ai/generate. */
export interface GenerateRequestBody {
  model: string;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
}

export interface GenerateResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Reasons the proxy rejects a request BEFORE spending a token. */
export type RejectReason =
  | "MALFORMED_BODY"
  | "MISSING_SYSTEM"
  | "NO_CONTEXT_IN_SYSTEM"
  | "EMPTY_MESSAGES"
  | "MODEL_NOT_ALLOWED"
  | "BUDGET_EXCEEDED";

export class ProxyRejection extends Error {
  constructor(public reason: RejectReason, message: string) {
    super(message);
    this.name = "ProxyRejection";
  }
}

// Server-side allow-list of models. The client cannot ask for anything else,
// so a compromised client can't route traffic to an expensive/unlisted model.
export const ALLOWED_MODELS = new Set<string>([
  "claude-haiku-4-5",
  "claude-sonnet-5",
  "claude-opus-4-8",
]);

export const MAX_OUTPUT_TOKENS = 4096;

// Markers the AIEngine's buildSystemPrompt() always injects. Their presence is
// how the proxy proves — independently of the client — that context was attached.
const CONTEXT_MARKERS = ["SITUATION:", "VERIFIED KNOWLEDGE:"] as const;

/**
 * Validate a proxy request. Throws ProxyRejection on the first violation.
 * This is the second enforcement of DM §3: "AI never receives a raw prompt."
 * The client (AIEngine) is the first; we do NOT trust it.
 */
export function validateGenerateRequest(body: unknown): GenerateRequestBody {
  if (typeof body !== "object" || body === null) {
    throw new ProxyRejection("MALFORMED_BODY", "Body must be a JSON object.");
  }

  const b = body as Record<string, unknown>;

  if (typeof b.model !== "string" || !ALLOWED_MODELS.has(b.model)) {
    throw new ProxyRejection(
      "MODEL_NOT_ALLOWED",
      `Model '${String(b.model)}' is not in the server allow-list.`
    );
  }

  if (typeof b.system !== "string" || b.system.trim().length === 0) {
    throw new ProxyRejection("MISSING_SYSTEM", "A non-empty system prompt is required.");
  }

  // The core guard: a raw user prompt would arrive with no context scaffolding.
  const hasContext = CONTEXT_MARKERS.every((m) => (b.system as string).includes(m));
  if (!hasContext) {
    throw new ProxyRejection(
      "NO_CONTEXT_IN_SYSTEM",
      "System prompt lacks required context markers. Raw prompts are forbidden."
    );
  }

  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    throw new ProxyRejection("EMPTY_MESSAGES", "At least one message is required.");
  }

  for (const m of b.messages) {
    const mm = m as Record<string, unknown>;
    if (
      (mm.role !== "user" && mm.role !== "assistant") ||
      typeof mm.content !== "string"
    ) {
      throw new ProxyRejection("MALFORMED_BODY", "Each message needs role and string content.");
    }
  }

  const maxTokens = b.maxTokens;
  if (typeof maxTokens !== "number" || maxTokens <= 0) {
    throw new ProxyRejection("BUDGET_EXCEEDED", "maxTokens must be a positive number.");
  }
  if (maxTokens > MAX_OUTPUT_TOKENS) {
    throw new ProxyRejection(
      "BUDGET_EXCEEDED",
      `maxTokens ${maxTokens} exceeds ceiling ${MAX_OUTPUT_TOKENS}.`
    );
  }

  return {
    model: b.model,
    system: b.system,
    messages: b.messages as GenerateRequestBody["messages"],
    maxTokens,
  };
}
