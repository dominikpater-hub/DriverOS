import type { Request, Response, RequestHandler } from "express";
import { handleGenerate, type IUpstreamLLM } from "./handleGenerate";

/**
 * Thin Express adapter. Its only jobs: authenticate, hand the body to the
 * handler, write the outcome. Zero business logic.  [Handbook: thin transport]
 *
 * `authenticate` is injected so you can plug in your real session/JWT check.
 * It must return the userId (or throw) — the proxy needs an identity for
 * rate-limiting and audit, and to refuse anonymous traffic.
 */
export function makeGenerateRoute(
  upstream: IUpstreamLLM,
  authenticate: (req: Request) => Promise<string> | string
): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    // 1. Auth — no valid session, no AI. Key stays server-side regardless.
    try {
      await authenticate(req);
    } catch {
      res.status(401).json({ error: "Unauthorized." });
      return;
    }

    // 2. Delegate to the framework-agnostic handler.
    const outcome = await handleGenerate(req.body, upstream);

    // 3. Write it out.
    res.status(outcome.status).json(outcome.body);
  };
}
