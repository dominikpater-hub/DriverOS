import type { ILLMProvider } from "../../../shared/types/ai.js";

/**
 * Direct provider — talks straight to api.anthropic.com.
 *
 * USE ONLY server-side or in dev. NEVER ship this in the mobile app:
 * it needs the API key in-process, which on a device is an immediate leak.
 * For mobile/production use GuardianBackendProvider (proxy) instead.  [Privacy by Design]
 */
export class AnthropicDirectProvider implements ILLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(opts: { apiKey: string; baseUrl?: string; apiVersion?: string }) {
    if (!opts.apiKey) {
      throw new Error("AnthropicDirectProvider requires an API key.");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl ?? "https://api.anthropic.com";
    this.apiVersion = opts.apiVersion ?? "2023-06-01";
  }

  async generateText(params: {
    model: string;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
  }): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.system, // system is a top-level param, NOT a message role
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    // Response content is a list of blocks; concatenate text blocks only.
    const text = data.content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n");

    return {
      text,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }
}
