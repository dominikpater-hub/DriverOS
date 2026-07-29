import type { ILLMProvider } from "../../../shared/types/ai.js";

/**
 * Production/mobile provider — talks to YOUR backend proxy, not Anthropic directly.
 *
 * The proxy holds the API key, so the device never does.  [Privacy by Design]
 * The proxy is also the right place to enforce caching, batching, and a
 * server-side re-check that no raw prompt slips through without context.
 *
 * Contract with your backend (adjust to match what you build):
 *   POST {baseUrl}/ai/generate
 *   body: { model, system, messages, maxTokens }
 *   200:  { text, usage: { inputTokens, outputTokens } }
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
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
  }): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    const token = await this.getAuthToken();

    const res = await fetch(`${this.baseUrl}/ai/generate`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
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
