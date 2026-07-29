// core/index.ports.ts — BARREL (re-export). Porty żyją per kontekst
// (core/<silnik>/ports.ts) — spec §8.3. Tylko Workflow + testy importują ten barrel.
export * from "./knowledge/ports";
export * from "./context/ports";
export * from "./decision/ports";
export * from "./ai/ports";
export * from "./workflow/ports";
export * from "../shared/snapshots";
