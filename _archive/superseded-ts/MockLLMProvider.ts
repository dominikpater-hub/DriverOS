import type { ILLMProvider } from "../../../shared/types/ai.js";

/**
 * Deterministic in-memory provider for tests and local dev. Touches no network.
 *
 * Two modes:
 *  - default: echoes a stable, inspectable string derived from the input, so
 *    tests can assert routing/prompt-building without brittleness.
 *  - scripted: return a queued response per call (for fixture-driven tests).
 */
export class MockLLMProvider implements ILLMProvider {
  public calls: Array<{
    model: string;
    system: string;
    messages: Array<{ role: string; content: string }>;
    maxTokens: number;
  }> = [];

  private queue: Array<{ text: string; inputTokens: number; outputTokens: number }> = [];

  /** Queue a scripted response for the next call. */
  enqueue(text: string, usage?: { inputTokens: number; outputTokens: number }): this {
    this.queue.push({
      text,
      inputTokens: usage?.inputTokens ?? 10,
      outputTokens: usage?.outputTokens ?? 20,
    });
    return this;
  }

  async generateText(params: {
    model: string;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
  }): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    this.calls.push(params);

    const scripted = this.queue.shift();
    if (scripted) {
      return {
        text: scripted.text,
        usage: { inputTokens: scripted.inputTokens, outputTokens: scripted.outputTokens },
      };
    }

    const lastUser = [...params.messages].reverse().find((m) => m.role === "user");
    return {
      text: `MOCK[${params.model}] :: ${lastUser?.content ?? ""}`,
      usage: { inputTokens: 10, outputTokens: 20 },
    };
  }
}
