// shared/platform/__tests__/predicate.test.ts
// D-03: one predicate evaluator used by both Decision Engine conditions
// and Workflow guards. This test just proves the operator semantics are
// correct in isolation — no engine involved.

import { evaluatePredicate, PredicateExpression } from "../predicate";

function check(name: string, cond: boolean, _detail?: string) {
  test(name, () => { expect(cond).toBe(true); });
}

console.log("evaluatePredicate");

const subject = {
  country: "DE",
  vehicle: { category: "TRUCK", adrClass: 3 },
  context: { connectivity: "OFFLINE" },
};

const p = (path: string, operator: PredicateExpression["operator"], value?: unknown): PredicateExpression =>
  ({ path, operator, value: value as any });

check("eq matches", evaluatePredicate(p("country", "eq", "DE"), subject) === true);
check("eq mismatches", evaluatePredicate(p("country", "eq", "FR"), subject) === false);
check("neq", evaluatePredicate(p("country", "neq", "FR"), subject) === true);
check("nested path", evaluatePredicate(p("vehicle.category", "eq", "TRUCK"), subject) === true);
check("in", evaluatePredicate(p("country", "in", ["DE", "AT", "CH"]), subject) === true);
check("nin", evaluatePredicate(p("country", "nin", ["FR", "IT"]), subject) === true);
check("gt", evaluatePredicate(p("vehicle.adrClass", "gt", 2), subject) === true);
check("gte boundary", evaluatePredicate(p("vehicle.adrClass", "gte", 3), subject) === true);
check("lt false at boundary", evaluatePredicate(p("vehicle.adrClass", "lt", 3), subject) === false);
check("exists true", evaluatePredicate(p("vehicle.adrClass", "exists"), subject) === true);
check("exists false on missing path", evaluatePredicate(p("vehicle.missingField", "exists"), subject) === false);
check("missing path returns false for eq", evaluatePredicate(p("vehicle.missingField", "eq", "x"), subject) === false);

