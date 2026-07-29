// shared/types/index.ts
// Re-export only. §8.4 review flagged shared/types/index.ts as a God-module
// risk — the fix is splitting by concern (this Faza A) and keeping this
// file as pure re-export, never a place new types get added directly.

export * from "./ids";
export * from "./predicate";
export * from "./capability";
export * from "./context";
export * from "./trust";
export * from "./workflow";
export * from "./ai";
export * from "./decision-record";
export * from "./product";
