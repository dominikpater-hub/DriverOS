// Minimal reconstruction of the shared types the AI Engine depends on.
// In your repo these live in shared/types/* — do NOT copy this file over,
// it exists only so this module compiles in isolation. Match against your real types.

export enum TrustLevel {
  VERIFIED = "T1_VERIFIED",
  VERIFIED_STALE = "T2_VERIFIED_STALE",
  AI_ASSISTED = "T3_AI_ASSISTED",
  FALLBACK = "T4_FALLBACK",
}

export enum Connectivity {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  DEGRADED = "DEGRADED",
}

export enum StepKind {
  SHOW_KNOWLEDGE = "SHOW_KNOWLEDGE",
  COLLECT_INPUT = "COLLECT_INPUT",
  AI_ASSIST = "AI_ASSIST",
  OCR = "OCR",
  TRANSLATE = "TRANSLATE",
  CAPTURE_PHOTO = "CAPTURE_PHOTO",
  GENERATE_REPORT = "GENERATE_REPORT",
  EMERGENCY_CARD = "EMERGENCY_CARD",
  DECISION_POINT = "DECISION_POINT",
}

export type CountryCode = string; // ISO 3166-1 alpha-2
export type LanguageCode = string; // ISO 639-1

export interface Source {
  type: "LAW_TEXT" | "OFFICIAL_SITE" | "GOVERNMENT_API" | "EXPERT";
  reference: string;
  retrievedAt: Date;
}

/** Slice of a KnowledgeVersion the AI is allowed to see. Read-only. */
export interface KnowledgeContextItem {
  versionId: string;
  language: LanguageCode;
  summary: string;
  details: string;
  legalRefs: Source[];
}

export interface SituationContext {
  timestamp: Date;
  resolvedCountry: CountryCode;
  language: LanguageCode;
  connectivity: Connectivity;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** AI never receives a raw prompt — always wrapped with context + knowledge. */
export interface AIRequest {
  prompt: string;
  context: SituationContext;
  knowledgeContext: KnowledgeContextItem[];
  stepKind: StepKind;
  history?: ChatMessage[];
  modelHint?: ModelName;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIResponse {
  content: string;
  trustLevel: TrustLevel.AI_ASSISTED | TrustLevel.FALLBACK;
  sourcesUsed: Source[];
  usage: TokenUsage;
  model: ModelName | "none";
}

// Model identifiers. Verify these strings against docs.claude.com before shipping —
// model names change and stale ids fail at runtime.
export type ModelName = "haiku" | "sonnet" | "opus";

export const MODEL_IDS: Record<ModelName, string> = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5",
  opus: "claude-opus-4-8",
};

/** Output token ceiling per model tier. */
export const TOKEN_BUDGETS: Record<ModelName, { output: number }> = {
  haiku: { output: 1024 },
  sonnet: { output: 2048 },
  opus: { output: 4096 },
};

/** The port the AI Engine implements. Workflow Engine depends on THIS, never the class. */
export interface IAIPort {
  assist(request: AIRequest): Promise<AIResponse>;
}

/** The port every provider implements. AI Engine depends on THIS, never a concrete API. */
export interface ILLMProvider {
  generateText(params: {
    model: string;
    system: string;
    messages: ChatMessage[];
    maxTokens: number;
  }): Promise<{ text: string; usage: TokenUsage }>;
}
