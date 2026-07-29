import type { IUpstreamLLM } from "./handleGenerate";
import type { GenerateResult } from "./contract";

/**
 * The one place the real Anthropic key lives. Reads from env, never from the request.
 * This is server-only code — it must never be bundled into the mobile app.
 */
export class AnthropicUpstream implements IUpstreamLLM {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string; apiVersion?: string }) {
    const key = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    if (!key) {
      throw new Error("ANTHROPIC_API_KEY is not set. The proxy cannot start.");
    }
    this.apiKey = key;
    this.baseUrl = opts?.baseUrl ?? "https://api.anthropic.com";
    this.apiVersion = opts?.apiVersion ?? "2023-06-01";
  }

  async call(body: {
    model: string;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
  }): Promise<GenerateResult> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": this.apiVersion,
      },
      body: JSON.stringify({
        model: body.model,
        max_tokens: body.maxTokens,
        system: body.system,
        messages: body.messages,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    return {
      text: data.content
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text as string)
        .join("\n"),
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }
}
