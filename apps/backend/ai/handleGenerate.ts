import {
  validateGenerateRequest,
  ProxyRejection,
  type GenerateResult,
} from "./contract";

/** Upstream caller — the ONLY place the real API key is used. */
export interface IUpstreamLLM {
  call(body: {
    model: string;
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    maxTokens: number;
  }): Promise<GenerateResult>;
}

export interface HandlerOutcome {
  status: number;
  body: GenerateResult | { error: string; reason?: string };
}

/**
 * Framework-agnostic proxy handler.
 *
 * Flow: validate (raw-prompt guard) -> call upstream -> shape response.
 * No Express/Fastify types here — the HTTP adapter maps this to a route.
 * Business logic never lives in the transport layer.  [Engineering Handbook]
 */
export async function handleGenerate(
  rawBody: unknown,
  upstream: IUpstreamLLM
): Promise<HandlerOutcome> {
  let validated;
  try {
    validated = validateGenerateRequest(rawBody);
  } catch (err) {
    if (err instanceof ProxyRejection) {
      // 422: the request was well-formed HTTP but violated a domain rule.
      return { status: 422, body: { error: err.message, reason: err.reason } };
    }
    return { status: 400, body: { error: "Bad request." } };
  }

  try {
    const result = await upstream.call(validated);
    return { status: 200, body: result };
  } catch (err) {
    // Never leak upstream internals to the device.  [Error Handling: no technical errors]
    console.error("[ai-proxy] upstream failure:", err);
    return { status: 502, body: { error: "AI service temporarily unavailable." } };
  }
}
