import { describe, it, expect, jest } from "@jest/globals";
import { handleGenerate, type IUpstreamLLM } from "../handleGenerate";
import { validateGenerateRequest, ProxyRejection } from "../contract";

// A valid system prompt carries the markers AIEngine always injects.
const goodSystem =
  "You are the assistance layer of Guardian Engine.\n" +
  "SITUATION: country=DE, language=de, connectivity=ONLINE, step=AI_ASSIST\n" +
  "VERIFIED KNOWLEDGE:\n[1] Deine Rechte";

function goodBody(overrides: Record<string, unknown> = {}) {
  return {
    model: "claude-sonnet-5",
    system: goodSystem,
    messages: [{ role: "user", content: "Was tun?" }],
    maxTokens: 1024,
    ...overrides,
  };
}

const okUpstream: IUpstreamLLM = {
  async call() {
    return { text: "Bleib ruhig.", usage: { inputTokens: 100, outputTokens: 20 } };
  },
};

describe("validateGenerateRequest", () => {
  it("accepts a well-formed request with context", () => {
    expect(() => validateGenerateRequest(goodBody())).not.toThrow();
  });

  it("rejects a raw prompt (system without context markers)", () => {
    try {
      validateGenerateRequest(goodBody({ system: "just answer this" }));
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyRejection);
      expect((e as ProxyRejection).reason).toBe("NO_CONTEXT_IN_SYSTEM");
    }
  });

  it("rejects a model outside the allow-list", () => {
    try {
      validateGenerateRequest(goodBody({ model: "gpt-4o" }));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ProxyRejection).reason).toBe("MODEL_NOT_ALLOWED");
    }
  });

  it("rejects maxTokens over the ceiling", () => {
    try {
      validateGenerateRequest(goodBody({ maxTokens: 99999 }));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ProxyRejection).reason).toBe("BUDGET_EXCEEDED");
    }
  });

  it("rejects empty messages", () => {
    try {
      validateGenerateRequest(goodBody({ messages: [] }));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ProxyRejection).reason).toBe("EMPTY_MESSAGES");
    }
  });

  it("rejects a message with a bad role", () => {
    try {
      validateGenerateRequest(goodBody({ messages: [{ role: "system", content: "x" }] }));
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as ProxyRejection).reason).toBe("MALFORMED_BODY");
    }
  });
});

describe("handleGenerate", () => {
  it("200 + result on the happy path", async () => {
    const out = await handleGenerate(goodBody(), okUpstream);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ text: "Bleib ruhig." });
  });

  it("422 with reason on a raw prompt — upstream never called", async () => {
    const spy = jest.fn();
    const spyUpstream: IUpstreamLLM = { call: spy as unknown as IUpstreamLLM["call"] };
    const out = await handleGenerate(goodBody({ system: "raw" }), spyUpstream);
    expect(out.status).toBe(422);
    expect((out.body as { reason?: string }).reason).toBe("NO_CONTEXT_IN_SYSTEM");
    expect(spy).not.toHaveBeenCalled(); // proof: no token spent
  });

  it("422 on a disallowed model — upstream never called", async () => {
    const spy = jest.fn();
    const spyUpstream: IUpstreamLLM = { call: spy as unknown as IUpstreamLLM["call"] };
    const out = await handleGenerate(goodBody({ model: "gpt-4o" }), spyUpstream);
    expect(out.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
  });

  it("502 and no internal leak when upstream throws", async () => {
    const failing: IUpstreamLLM = {
      async call() {
        throw new Error("x-api-key rotated, secret detail leaked here");
      },
    };
    const out = await handleGenerate(goodBody(), failing);
    expect(out.status).toBe(502);
    expect(JSON.stringify(out.body)).not.toMatch(/x-api-key|secret/i);
  });

  it("400 on a non-object body", async () => {
    const out = await handleGenerate("not json", okUpstream);
    expect(out.status).toBe(422); // MALFORMED_BODY is a ProxyRejection -> 422
  });
});
