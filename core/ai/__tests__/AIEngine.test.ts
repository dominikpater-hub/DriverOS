/**
 * AI ENGINE — TEST SUITE
 *
 * Target: 80% coverage (STARTUP_CHECKLIST Week 3).
 * Key properties under test:
 *   - AI never receives a raw prompt alone — always context + knowledge (Domain Model §3 invariant)
 *   - Response is always marked T3_AI_ASSISTED or T4_FALLBACK, never T1/T2
 *   - Offline connectivity always short-circuits to fallback, no LLM call attempted
 *   - Online with zero knowledge context also falls back (guards against silent hallucination)
 *   - Model routing picks the right tier per step kind, respects explicit modelHint override
 *   - LLM provider failure degrades to fallback, never throws to the caller
 *   - Cost calculator produces the expected 5-25x spread between tiers
 */

import { AIEngine, ClaudeAPIProvider, ILLMProvider, ModelCostCalculator, BatchProcessor } from "../AIEngine";
import { StepKind, TrustLevel, Connectivity, createVersionId } from "../../../shared/types";
import { AIRequest, SituationContext, KnowledgeVersionSnapshot } from "../../index.ports";

function baseContext(connectivity: Connectivity = Connectivity.ONLINE): SituationContext {
  return {
    timestamp: new Date(),
    location: null,
    resolvedCountry: "DE",
    language: "de",
    connectivity,
    userProfile: "driver-001" as any
  };
}

function knowledgeSnapshot(summary: string): KnowledgeVersionSnapshot {
  return {
    id: createVersionId("v1"),
    entryId: "traffic-rights-de" as any,
    language: "de",
    content: { summary, actions: [], rights: [], warnings: [], details: "", legalRefs: [] },
    confidence: "OFFICIAL" as any,
    effectiveDate: new Date(),
    validUntil: null,
    verifiedAt: new Date(),
    nextReviewDue: new Date(Date.now() + 1000000),
    supersededBy: null,
    checksum: "sha256:abc"
  };
}

class MockLLMProvider implements ILLMProvider {
  public lastCall: Parameters<ILLMProvider["generateText"]>[0] | null = null;
  constructor(
    private response: { text: string; usage: { inputTokens: number; outputTokens: number } } = {
      text: "Mock response",
      usage: { inputTokens: 100, outputTokens: 20 }
    },
    private shouldThrow = false
  ) {}

  async generateText(params: Parameters<ILLMProvider["generateText"]>[0]) {
    this.lastCall = params;
    if (this.shouldThrow) throw new Error("provider unavailable");
    return this.response;
  }
}

describe("AIEngine", () => {
  // ==========================================================================
  // CORE INVARIANT: never a bare prompt, always context + knowledge
  // ==========================================================================

  it("throws if request has no SituationContext", async () => {
    const engine = new AIEngine(new MockLLMProvider());
    const request = {
      prompt: "What do I do?",
      context: undefined,
      knowledgeContext: [],
      stepKind: StepKind.TRANSLATE
    } as unknown as AIRequest;

    await expect(engine.assist(request)).rejects.toThrow(/SituationContext/i);
  });

  // ==========================================================================
  // OFFLINE / NO-KNOWLEDGE FALLBACK
  // ==========================================================================

  it("falls back to T4_FALLBACK when connectivity is OFFLINE, without calling the LLM", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    const response = await engine.assist({
      prompt: "Was soll ich tun?",
      context: baseContext(Connectivity.OFFLINE),
      knowledgeContext: [],
      stepKind: StepKind.TRANSLATE
    });

    expect(response.trustLevel).toBe(TrustLevel.T4_FALLBACK);
    expect(provider.lastCall).toBeNull();
  });

  it("falls back to T4_FALLBACK when online but no knowledge context is provided", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    const response = await engine.assist({
      prompt: "Was soll ich tun?",
      context: baseContext(Connectivity.ONLINE),
      knowledgeContext: [],
      stepKind: StepKind.TRANSLATE
    });

    expect(response.trustLevel).toBe(TrustLevel.T4_FALLBACK);
    expect(provider.lastCall).toBeNull();
  });

  // ==========================================================================
  // HAPPY PATH — always T3_AI_ASSISTED, never claims T1/T2
  // ==========================================================================

  it("returns T3_AI_ASSISTED when online with knowledge context and the LLM succeeds", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    const response = await engine.assist({
      prompt: "Was soll ich tun?",
      context: baseContext(Connectivity.ONLINE),
      knowledgeContext: [knowledgeSnapshot("Bleib ruhig")],
      stepKind: StepKind.TRANSLATE
    });

    expect(response.trustLevel).toBe(TrustLevel.T3_AI_ASSISTED);
    expect(response.content).toBe("Mock response");
    expect(provider.lastCall).not.toBeNull();
  });

  // ==========================================================================
  // M4 — ResponseValidator gate wired into the engine
  // ==========================================================================

  it("degrades a response with a FABRICATED legal signature to T4 (does not ship it as T3)", async () => {
    // Provider returns a §-reference that is NOT in the provided knowledge.
    const provider = new MockLLMProvider({
      text: "Laut §99 StVO darfst du sofort wegfahren.",
      usage: { inputTokens: 100, outputTokens: 20 }
    });
    const engine = new AIEngine(provider);

    const response = await engine.assist({
      prompt: "Darf ich wegfahren?",
      context: baseContext(Connectivity.ONLINE),
      knowledgeContext: [knowledgeSnapshot("Bleib ruhig")], // no §99 anywhere
      stepKind: StepKind.TRANSLATE
    });

    expect(response.trustLevel).toBe(TrustLevel.T4_FALLBACK);
    expect(response.content).not.toContain("§99");
  });

  it("keeps a validated response at T3 and attributes only allowed sources", async () => {
    // §36 IS present in the grounding, so the answer is legitimately T3.
    const provider = new MockLLMProvider({
      text: "Nach §36 zeigst du deine Papiere.",
      usage: { inputTokens: 100, outputTokens: 20 }
    });
    const engine = new AIEngine(provider);

    const kn = knowledgeSnapshot("Bleib ruhig");
    kn.content.legalRefs = [{ type: "LAW_TEXT", reference: "StVO §36", retrievedAt: new Date() } as any];

    const response = await engine.assist({
      prompt: "Was tun?",
      context: baseContext(Connectivity.ONLINE),
      knowledgeContext: [kn],
      stepKind: StepKind.TRANSLATE
    });

    expect(response.trustLevel).toBe(TrustLevel.T3_AI_ASSISTED);
    // sourcesUsed ⊆ allowed (the validated subset)
    expect(response.sourcesUsed?.every((s) => String(s) === String(kn.id))).toBe(true);
  });

  it("never returns T1_VERIFIED or T2_VERIFIED_STALE — those belong to Knowledge Engine only", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    const response = await engine.assist({
      prompt: "Was soll ich tun?",
      context: baseContext(Connectivity.ONLINE),
      knowledgeContext: [knowledgeSnapshot("Bleib ruhig")],
      stepKind: StepKind.TRANSLATE
    });

    expect(response.trustLevel).not.toBe(TrustLevel.T1_VERIFIED);
    expect(response.trustLevel).not.toBe(TrustLevel.T2_VERIFIED_STALE);
  });

  it("includes the verified knowledge summary in the system prompt sent to the LLM", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    await engine.assist({
      prompt: "Was soll ich tun?",
      context: baseContext(Connectivity.ONLINE),
      knowledgeContext: [knowledgeSnapshot("Bleib ruhig und zeige Papiere")],
      stepKind: StepKind.TRANSLATE
    });

    const systemMessage = provider.lastCall?.messages.find(m => m.role === "system");
    expect(systemMessage?.content).toContain("Bleib ruhig und zeige Papiere");
    expect(systemMessage?.content).toContain("AI-assisted");
  });

  // ==========================================================================
  // MODEL ROUTING
  // ==========================================================================

  it("routes TRANSLATE to haiku by default", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    await engine.assist({
      prompt: "x",
      context: baseContext(),
      knowledgeContext: [knowledgeSnapshot("x")],
      stepKind: StepKind.TRANSLATE
    });

    expect(provider.lastCall?.model).toBe("haiku");
  });

  it("routes AI_ASSIST to sonnet by default", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    await engine.assist({
      prompt: "x",
      context: baseContext(),
      knowledgeContext: [knowledgeSnapshot("x")],
      stepKind: StepKind.AI_ASSIST
    });

    expect(provider.lastCall?.model).toBe("sonnet");
  });

  it("respects an explicit modelHint even when it overrides the routing table", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    await engine.assist({
      prompt: "x",
      context: baseContext(),
      knowledgeContext: [knowledgeSnapshot("x")],
      stepKind: StepKind.TRANSLATE, // would normally route to haiku
      modelHint: "sonnet"
    });

    expect(provider.lastCall?.model).toBe("sonnet");
  });

  it("defaults to haiku for an unrecognized stepKind (fail cheap, not fail expensive)", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    await engine.assist({
      prompt: "x",
      context: baseContext(),
      knowledgeContext: [knowledgeSnapshot("x")],
      stepKind: "SOME_UNKNOWN_STEP" as any
    });

    expect(provider.lastCall?.model).toBe("haiku");
  });

  // ==========================================================================
  // PROVIDER FAILURE → GRACEFUL FALLBACK
  // ==========================================================================

  it("degrades to T4_FALLBACK if the LLM provider throws, never propagates the error", async () => {
    const provider = new MockLLMProvider(undefined, true);
    const engine = new AIEngine(provider);

    const response = await engine.assist({
      prompt: "x",
      context: baseContext(),
      knowledgeContext: [knowledgeSnapshot("x")],
      stepKind: StepKind.TRANSLATE
    });

    expect(response.trustLevel).toBe(TrustLevel.T4_FALLBACK);
  });

  // ==========================================================================
  // HISTORY THREADING
  // ==========================================================================

  it("forwards conversation history into the message list sent to the LLM", async () => {
    const provider = new MockLLMProvider();
    const engine = new AIEngine(provider);

    await engine.assist({
      prompt: "Und jetzt?",
      context: baseContext(),
      knowledgeContext: [knowledgeSnapshot("x")],
      stepKind: StepKind.TRANSLATE,
      history: [
        { role: "user", content: "Erste Frage" },
        { role: "assistant", content: "Erste Antwort" }
      ]
    });

    const roles = provider.lastCall?.messages.map(m => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "user"]);
  });
});

describe("ClaudeAPIProvider", () => {
  it("returns a well-formed response shape (mock implementation, pending real API wiring)", async () => {
    const provider = new ClaudeAPIProvider("test-key");
    const result = await provider.generateText({
      model: "haiku",
      messages: [{ role: "user", content: "hi" }]
    });

    expect(typeof result.text).toBe("string");
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });
});

describe("ModelCostCalculator", () => {
  const calc = new ModelCostCalculator();

  it("computes cost proportional to tokens for a single model", () => {
    const small = calc.estimateCost("haiku", { input: 1000, output: 100 });
    const large = calc.estimateCost("haiku", { input: 2000, output: 200 });
    expect(large).toBeCloseTo(small * 2, 10);
  });

  it("produces the expected 5x output/input ratio consistent with July 2026 pricing", () => {
    const cost = calc.estimateCost("sonnet", { input: 1_000_000, output: 0 });
    const outputCost = calc.estimateCost("sonnet", { input: 0, output: 1_000_000 });
    expect(outputCost / cost).toBeCloseTo(5, 5);
  });

  it("shows a meaningful spread between haiku and opus for identical token counts", () => {
    const tokens = { input: 1_000_000, output: 1_000_000 };
    const comparison = calc.compareModels(tokens);
    expect(comparison.opus).toBeGreaterThan(comparison.sonnet);
    expect(comparison.sonnet).toBeGreaterThan(comparison.haiku);
    // Opus should be roughly 5x more expensive than Haiku at these rates
    expect(comparison.opus / comparison.haiku).toBeCloseTo(5, 1);
  });
});

describe("BatchProcessor", () => {
  it("calculates exactly 50% savings for batch vs standard pricing", () => {
    const savings = BatchProcessor.calculateSavings("haiku", { input: 1_000_000, output: 1_000_000 });
    expect(savings.batchCost).toBeCloseTo(savings.standardCost * 0.5, 10);
    expect(savings.savingsPercent).toBe(50);
  });

  it("queueForBatch resolves without throwing (integration point for future queue backend)", async () => {
    await expect(
      BatchProcessor.queueForBatch({
        prompt: "x",
        context: baseContext(),
        knowledgeContext: [],
        stepKind: StepKind.TRANSLATE
      })
    ).resolves.toBeUndefined();
  });
});
