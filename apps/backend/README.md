# Guardian Engine — Backend (AI Proxy)

A thin server that sits between the Guardian client and Anthropic. It exists
for one architectural reason: **the API key must never live on a driver's
device**, and the "AI never gets a raw prompt without context" invariant
(Domain Model §3) must be enforced somewhere the client cannot bypass.

The client is untrusted. `AIEngine` enforces the context rule on the client
side, but this proxy re-checks it server-side — because it's the proxy that
holds the key and actually calls Anthropic.

## The contract

```
POST /ai/generate
Authorization: Bearer <session-token>
Content-Type: application/json

body: {
  model:     string                  // must be in the server allow-list
  system:    string                  // must carry SITUATION: + VERIFIED KNOWLEDGE:
  messages:  { role: "user" | "assistant"; content: string }[]
  maxTokens: number                  // capped server-side at MAX_OUTPUT_TOKENS
}

200 → { text: string, usage: { inputTokens, outputTokens } }
401 → unauthenticated
422 → ProxyRejection (see reasons below), upstream never called
502 → upstream failed (no internal detail leaked)
```

## Why a request gets rejected (422) — before a token is spent

Defined in `ai/contract.ts` as `RejectReason`:

| Reason | Meaning |
|---|---|
| `MALFORMED_BODY` | Body isn't the expected shape |
| `MISSING_SYSTEM` | No system prompt at all |
| `NO_CONTEXT_IN_SYSTEM` | System prompt lacks the `SITUATION:` / `VERIFIED KNOWLEDGE:` markers that `AIEngine.buildSystemPrompt()` always injects — i.e. someone tried to send a raw prompt |
| `EMPTY_MESSAGES` | No messages |
| `MODEL_NOT_ALLOWED` | Model isn't in the server-side `ALLOWED_MODELS` allow-list |
| `BUDGET_EXCEEDED` | `maxTokens` over the cap |

The `NO_CONTEXT_IN_SYSTEM` guard is the important one: it's the server-side
proof that context was attached, independent of whether the client behaved.
If you change the system-prompt wording in `core/ai/AIEngine.ts`, update
`CONTEXT_MARKERS` in `contract.ts` — otherwise the proxy will start rejecting
valid requests.

## Layers (each does one thing)

- **`contract.ts`** — request shape + validation rules + allow-list. Pure.
- **`handleGenerate.ts`** — framework-agnostic handler: validate → upstream → respond. Pure.
- **`AnthropicUpstream.ts`** — the only place holding the API key (`process.env.ANTHROPIC_API_KEY`). Server-only.
- **`expressAdapter.ts`** — thin transport: authenticate → handler → write. Zero business logic.

## Wiring it up

```ts
import express from "express";
import { makeGenerateRoute } from "./ai/expressAdapter";
import { AnthropicUpstream } from "./ai/AnthropicUpstream";

const upstream = new AnthropicUpstream();               // reads ANTHROPIC_API_KEY
const authenticate = async (req) => {
  // plug in your real session/JWT check; must return userId or throw.
  // The proxy needs an identity for rate-limiting and audit.
  return "user-id";
};

const app = express();
app.use(express.json());
app.post("/ai/generate", makeGenerateRoute(upstream, authenticate));
app.listen(3000);
```

The mobile/production client talks to this via
`core/ai/providers/GuardianBackendProvider.ts` — that provider implements the
`ILLMProvider` port, so `AIEngine` never knows whether it's calling Anthropic
directly or through this proxy. Swapping between them is a one-line change
(ADR-005: "swap the model in a day").

## Not done yet

- `authenticate` is a placeholder — wire your real session check.
- No rate-limiting or per-user cost caps yet (the proxy is the right place for
  both; it already has the `userId` from `authenticate`).
- No prompt caching / batch integration (the cost levers from the README).

## Tests

`apps/backend/ai/__tests__/handleGenerate.test.ts` — 11 tests, run via the
repo's normal `npm test` (Jest). They cover: happy path, each rejection reason,
the raw-prompt guard (proving upstream is never called), disallowed model, and
that an upstream failure returns 502 without leaking internal error detail.
