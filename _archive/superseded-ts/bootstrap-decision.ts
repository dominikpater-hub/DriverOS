// ---------------------------------------------------------------------------
// scripts/bootstrap-decision.ts
//
// Proof-of-life: wires the real DecisionEngine up with rules matching the
// "Road Inspection" reference scenario (Artefakt #0002 §9) and runs a few
// realistic inputs through it. Run with: npm run demo
// ---------------------------------------------------------------------------

import { DecisionEngine } from "../core/decision/DecisionEngine";
import { RuleBuilder } from "../core/decision/RuleBuilder";
import { createRuleId, createWorkflowDefId, type Rule, type IRuleStorage } from "../shared/types";

class InMemoryRuleStorage implements IRuleStorage {
  constructor(private rules: Rule[]) {}
  async getAllRules(): Promise<Rule[]> {
    return this.rules;
  }
  async saveRule(rule: Rule): Promise<void> {
    this.rules.push(rule);
  }
}

const rules: Rule[] = [
  RuleBuilder.create(createRuleId("rule-inspection-de-truck"))
    .priority(100)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .when("vehicle.category", "eq", "TRUCK")
    .thenWorkflow(createWorkflowDefId("Inspection_DE_Truck"), "Truck-specific German inspection"),

  RuleBuilder.create(createRuleId("rule-inspection-de"))
    .priority(50)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .thenWorkflow(createWorkflowDefId("Inspection_DE"), "Standard German inspection"),

  RuleBuilder.create(createRuleId("rule-inspection-fr"))
    .priority(50)
    .when("country", "eq", "FR")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .thenWorkflow(createWorkflowDefId("Inspection_FR"), "Standard French inspection"),

  RuleBuilder.create(createRuleId("rule-fallback"))
    .priority(0)
    .when("eventType", "eq", "ROAD_INSPECTION")
    .thenWorkflow(createWorkflowDefId("Inspection_Generic"), "Unknown country fallback"),
];

async function main() {
  const engine = new DecisionEngine(new InMemoryRuleStorage(rules));
  await engine.initialize();
  console.log("✅ DecisionEngine initialized —", rules.length, "rules compiled\n");

  const scenarios = [
    { label: "Niemiecka ciężarówka na kontroli drogowej", input: { country: "DE", eventType: "ROAD_INSPECTION", vehicle: { category: "TRUCK" } } },
    { label: "Niemiecki samochód osobowy", input: { country: "DE", eventType: "ROAD_INSPECTION", vehicle: { category: "CAR" } } },
    { label: "Francuski samochód", input: { country: "FR", eventType: "ROAD_INSPECTION", vehicle: { category: "CAR" } } },
    { label: "Nieznany kraj (Polska — brak reguły dedykowanej)", input: { country: "PL", eventType: "ROAD_INSPECTION", vehicle: { category: "CAR" } } },
    { label: "Zdarzenie spoza domeny (kontrola celna)", input: { country: "DE", eventType: "CUSTOMS_CHECK" } },
  ];

  for (const s of scenarios) {
    const result = await engine.matchRules(s.input);
    console.log(`— ${s.label}`);
    console.log(`  wejście:  ${JSON.stringify(s.input)}`);
    if (result.matched) {
      console.log(`  wynik:    ✅ ${result.workflowDefId}  (reguła: ${result.ruleId}, priorytet: ${result.priority})`);
    } else {
      console.log(`  wynik:    ⚠️  brak dopasowania — Workflow Engine powinien pokazać T4 fallback`);
    }
    console.log("");
  }

  // Determinism proof, same as the unit test but visible here too.
  const input = { country: "DE", eventType: "ROAD_INSPECTION", vehicle: { category: "TRUCK" } };
  const first = await engine.matchRules(input);
  let stable = true;
  for (let i = 0; i < 1000; i++) {
    const r = await engine.matchRules(input);
    if (JSON.stringify(r) !== JSON.stringify(first)) stable = false;
  }
  console.log(stable ? "✅ Determinizm: 1000/1000 identycznych wyników" : "❌ Determinizm złamany!");
}

main();
