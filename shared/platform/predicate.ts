// shared/types/predicate.ts
//
// D-03 (Artefakt #0003, §8.2): Decision Engine's `Condition` and Workflow's
// `Guard` had identical semantics living in two contexts. That's not
// reusable logic being shared across engines (which would violate "engines
// don't know each other") — it's a *value shape* being shared, exactly like
// CountryCode. One type here, two engines evaluate it independently against
// their own inputs (RuleContext vs WorkflowVariables + SituationContext).
//
// This keeps Decision Engine deterministic and dependency-free, and keeps
// Workflow guards expressible with the same operator set — no future
// divergence where "gt" means something subtly different in each place.

export type PredicateOperator =
  | "eq"
  | "neq"
  | "in"
  | "nin"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "exists";

import type { JsonValue } from "./ids";

export interface PredicateExpression {
  /** Dot path into whatever object this predicate is evaluated against
   *  (RuleContext for Decision Engine; WorkflowVariables + SituationContext
   *  for Workflow guards). e.g. "country", "vehicle.category", "context.connectivity" */
  path: string;
  operator: PredicateOperator;
  /** Not required for "exists" (existence is checked against `path` alone). */
  value?: JsonValue;
}

/**
 * Pure, dependency-free evaluator. Both Decision Engine and Workflow Engine
 * import THIS function rather than re-implementing operator semantics.
 * This is a shared value-level utility, not a cross-engine call — it takes
 * a plain object and a predicate, nothing more.
 */
export function evaluatePredicate(
  predicate: PredicateExpression,
  subject: Record<string, JsonValue>
): boolean {
  const actual = readPath(subject, predicate.path);

  if (predicate.operator === "exists") {
    return actual !== undefined && actual !== null;
  }

  const expected = predicate.value;

  switch (predicate.operator) {
    case "eq":
      return jsonEquals(actual, expected);
    case "neq":
      return !jsonEquals(actual, expected);
    case "in":
      return Array.isArray(expected) && expected.some((v) => jsonEquals(actual, v));
    case "nin":
      return Array.isArray(expected) && !expected.some((v) => jsonEquals(actual, v));
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    default: {
      // Exhaustiveness guard: if a new operator is added to the union
      // without updating this switch, this is a compile error, not a
      // silent runtime "always false".
      const _exhaustive: never = predicate.operator;
      return _exhaustive;
    }
  }
}

function readPath(obj: Record<string, JsonValue>, path: string): JsonValue | undefined {
  const parts = path.split(".");
  let current: JsonValue | undefined = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, JsonValue>)[part];
  }
  return current;
}

function jsonEquals(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
