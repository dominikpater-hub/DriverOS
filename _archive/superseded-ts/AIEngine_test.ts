import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AIEngine } from "../AIEngine.js";
import { MockLLMProvider } from "../providers/MockLLMProvider.js";
import { AnthropicDirectProvider } from "../providers/AnthropicDirectProvider.js";
import {
  type AIRequest,
  type SituationContext,
  TrustLevel,
  Connectivity,
  StepKind,
  MODEL_IDS,
} from "../../../shared/types/ai.js";
import {
  anthropicTextResponse,
  anthropicMultiBlockResponse,
  anthropicErrorResponse,
} from "./fixtures/anthropic-responses.js";

// ---- helpers ---------------------------------------------------------------

function ctx(overrides: Partial<SituationContext> = {}): SituationContext {
  return {
    timestamp: new Date("2026-07-18T10:00:00Z"),
    resolvedCountry: "DE",
    language: "de",
    connectivity: Connectivity.ONLINE,
    ...overrides,
  };
}

function req(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    prompt: "Was soll ich bei der Kontrolle tun?",
    context: ctx(),
    stepKind: StepKind.AI_ASSIST,
    knowledgeContext: [
      {
        versionId: "v-de-rights-1",
        language: "de",
        summary: "Deine Rechte bei Verkehrskontrolle",
        details: "Bleib ruhig. Zeige Dokumente.",
        legalRefs: [{ type: "LAW_TEXT", reference: "StVO §63", retrievedAt: new Date() }],
      },
    ],
    ...overrides,
  };
}

// ---- AIEngine invariants (MockLLMProvider) --------------------------------

describe("AIEngine — invariants", () => {
  it("throws if no SituationContext (raw prompt forbidden)", async () => {
    const engine = new AIEngine(new MockLLMProvider());
    // @ts-expect-error deliberately violating the contract
    await expect(engine.assist({ ...req(), context: undefined })).rejects.toThrow(
      /raw prompt/i
    );
  });

  it("offline never calls the provider and returns T4 FALLBACK", async () => {
    const mock = new MockLLMProvider();
    const engine = new AIEngine(mock);
    const res = await engine.assist(req({ context: ctx({ connectivity: Connectivity.OFFLINE }) }));
    expect(res.trustLevel).toBe(TrustLevel.FALLBACK);
    expect(res.model).toBe("none");
    expect(mock.calls.length).toBe(0); // proof: zero network intent
  });

  it("online AI_ASSIST with empty knowledge degrades to T4, no model call", async () => {
    const mock = new MockLLMProvider();
    const engine = new AIEngine(mock);
    const res = await engine.assist(req({ knowledgeContext: [] }));
    expect(res.trustLevel).toBe(TrustLevel.FALLBACK);
    expect(mock.calls.length).toBe(0);
  });

  it("successful assist is always T3 AI_ASSISTED, never T1/T2", async () => {
    const engine = new AIEngine(new MockLLMProvider());
    const res = await engine.assist(req());
    expect(res.trustLevel).toBe(TrustLevel.AI_ASSISTED);
    // @ts-expect-error T1 is not assignable — compile-time guarantee, asserted at runtime too
    expect(res.trustLevel === TrustLevel.VERIFIED).toBe(false);
  });

  it("provider error mid-request degrades to fallback, never throws", async () => {
    const failing = new MockLLMProvider();
    vi.spyOn(failing, "generateText").mockRejectedValueOnce(new Error("boom"));
    const engine = new AIEngine(failing);
    const res = await engine.assist(req());
    expect(res.trustLevel).toBe(TrustLevel.FALLBACK);
  });

  it("carries verified legalRefs into sourcesUsed (audit trail)", async () => {
    const engine = new AIEngine(new MockLLMProvider());
    const res = await engine.assist(req());
    expect(res.sourcesUsed).toHaveLength(1);
    expect(res.sourcesUsed[0].reference).toBe("StVO §63");
  });
});

// ---- Model routing --------------------------------------------------------

describe("AIEngine — model routing", () => {
  it("AI_ASSIST routes to sonnet", async () => {
    const mock = new MockLLMProvider();
    await new AIEngine(mock).assist(req({ stepKind: StepKind.AI_ASSIST }));
    expect(mock.calls[0].model).toBe(MODEL_IDS.sonnet);
  });

  it("TRANSLATE routes to haiku", async () => {
    const mock = new MockLLMProvider();
    await new AIEngine(mock).assist(
      req({ stepKind: StepKind.TRANSLATE, knowledgeContext: [] }) // translate doesn't require knowledge
    );
    expect(mock.calls[0].model).toBe(MODEL_IDS.haiku);
  });

  it("modelHint overrides routing", async () => {
    const mock = new MockLLMProvider();
    await new AIEngine(mock).assist(req({ modelHint: "opus" }));
    expect(mock.calls[0].model).toBe(MODEL_IDS.opus);
  });

  it("system prompt contains guardrail against inventing legal info", async () => {
    const mock = new MockLLMProvider();
    await new AIEngine(mock).assist(req());
    expect(mock.calls[0].system).toMatch(/do NOT invent legal information/i);
    // Knowledge summary+details are injected; raw legalRefs go to the audit trail, not the prompt.
    expect(mock.calls[0].system).toContain("Deine Rechte bei Verkehrskontrolle");
  });

  it("user prompt is wrapped as data, never top-level instruction", async () => {
    const mock = new MockLLMProvider();
    await new AIEngine(mock).assist(req());
    const userMsg = mock.calls[0].messages.find((m) => m.role === "user");
    expect(userMsg?.content).toMatch(/^User request/);
  });
});

// ---- AnthropicDirectProvider (fixture-driven, fetch mocked) ---------------

describe("AnthropicDirectProvider — fixture parsing", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("parses a single text block and usage", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => anthropicTextResponse,
    }) as unknown as typeof fetch;

    const p = new AnthropicDirectProvider({ apiKey: "sk-test" });
    const out = await p.generateText({
      model: "claude-haiku-4-5",
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
    });
    expect(out.text).toMatch(/Bleib ruhig/);
    expect(out.usage).toEqual({ inputTokens: 320, outputTokens: 41 });
  });

  it("concatenates multiple text blocks", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => anthropicMultiBlockResponse,
    }) as unknown as typeof fetch;

    const p = new AnthropicDirectProvider({ apiKey: "sk-test" });
    const out = await p.generateText({
      model: "claude-sonnet-5",
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
    });
    expect(out.text).toBe("First part.\nSecond part.");
  });

  it("throws on non-ok status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: anthropicErrorResponse.status,
      text: async () => JSON.stringify(anthropicErrorResponse.body),
    }) as unknown as typeof fetch;

    const p = new AnthropicDirectProvider({ apiKey: "sk-test" });
    await expect(
      p.generateText({ model: "m", system: "s", messages: [], maxTokens: 10 })
    ).rejects.toThrow(/429/);
  });

  it("sends system as top-level param, not a message", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => anthropicTextResponse });
    globalThis.fetch = spy as unknown as typeof fetch;

    const p = new AnthropicDirectProvider({ apiKey: "sk-test" });
    await p.generateText({
      model: "claude-haiku-4-5",
      system: "SYSTEM_HERE",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 100,
    });
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.system).toBe("SYSTEM_HERE");
    expect(body.messages.every((m: { role: string }) => m.role !== "system")).toBe(true);
  });

  it("requires an API key", () => {
    expect(() => new AnthropicDirectProvider({ apiKey: "" })).toThrow(/API key/);
  });
});

// ---- End-to-end via AnthropicDirectProvider + AIEngine --------------------

describe("AIEngine + AnthropicDirectProvider (fixture)", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => anthropicTextResponse,
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("full path: request -> provider -> T3 response with usage", async () => {
    const engine = new AIEngine(new AnthropicDirectProvider({ apiKey: "sk-test" }));
    const res = await engine.assist(req());
    expect(res.trustLevel).toBe(TrustLevel.AI_ASSISTED);
    expect(res.content).toMatch(/Bleib ruhig/);
    expect(res.usage.inputTokens).toBe(320);
  });
});
