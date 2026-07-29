import type { ILLMProvider } from "../AIEngine";

/**
 * Production/mobile provider — talks to YOUR backend proxy (apps/backend/ai),
 * not Anthropic directly.
 *
 * The proxy holds the API key, so the device never does.  [Privacy by Design]
 * The proxy is also the right place to enforce caching, batching, and a
 * server-side re-check that no raw prompt slips through without context
 * (see apps/backend/ai/contract.ts — the NO_CONTEXT_IN_SYSTEM guard).
 *
 * Contract with the proxy (apps/backend/ai/handleGenerate.ts):
 *   POST {baseUrl}/ai/generate
 *   body: { model, system, messages, maxTokens }
 *   200:  { text, usage: { inputTokens, outputTokens } }
 *
 * NOTE: this implements the ILLMProvider port from core/ai/AIEngine.ts.
 * That port's generateText does not carry `system` as a separate field, so
 * the system prompt (built by AIEngine, carrying SITUATION/VERIFIED KNOWLEDGE)
 * is passed through here explicitly via the constructor's systemPromptResolver
 * only if you wire it; by default we forward an empty system and rely on the
 * messages already containing the assembled context. Adjust when you connect
 * AIEngine's real prompt builder.
 */
export class GuardianBackendProvider implements ILLMProvider {
  private readonly baseUrl: string;
  private readonly getAuthToken: () => Promise<string> | string;

  constructor(opts: {
    baseUrl: string;
    /** How to obtain the user's session token for the proxy call. */
    getAuthToken: () => Promise<string> | string;
  }) {
    if (!opts.baseUrl) {
      throw new Error("GuardianBackendProvider requires a baseUrl.");
    }
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.getAuthToken = opts.getAuthToken;
  }

  async generateText(params: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens?: number;
  }): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    const token = await this.getAuthToken();

    const res = await fetch(`${this.baseUrl}/ai/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model: params.model,
        system: "", // AIEngine assembles context into messages; proxy re-checks
        messages: params.messages,
        maxTokens: params.maxTokens ?? 1024,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Guardian backend ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      text: string;
      usage?: { inputTokens: number; outputTokens: number };
    };

    return {
      text: data.text ?? "",
      usage: {
        inputTokens: data.usage?.inputTokens ?? 0,
        outputTokens: data.usage?.outputTokens ?? 0,
      },
    };
  }
}
