/**
 * DECISION RULES: DriverOS
 *
 * Routes SituationContext + event into the correct WorkflowDefinition.
 * Zero LLM. Priorities resolve overlaps deterministically (Domain Model §4).
 */

import { RuleBuilder } from "../../../shared/rules";
import { createRuleId, createWorkflowDefId, TrustLevel } from "../../../shared/types";

export const DriverOSRules = [
  // Truck + ADR class in Germany during inspection → dedicated ADR workflow
  // Higher priority than plain inspection because it's a stricter superset.
  RuleBuilder.create(createRuleId("rule-inspection-de-adr-truck"))
    .priority(100)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .when("vehicle.category", "eq", "TRUCK")
    .when("vehicle.adrClass", "neq", undefined)
    .thenWorkflow(
      createWorkflowDefId("ADR_Check_DE"),
      "Truck carrying dangerous goods in Germany requires ADR-specific procedure"
    ),

  // Standard German road inspection (any vehicle)
  RuleBuilder.create(createRuleId("rule-inspection-de-standard"))
    .priority(90)
    .when("country", "eq", "DE")
    .when("eventType", "eq", "ROAD_INSPECTION")
    .thenWorkflow(
      createWorkflowDefId("Inspection_DE"),
      "Standard German road inspection procedure"
    ),

  // No country/event match → universal emergency fallback (T4)
  RuleBuilder.create(createRuleId("rule-fallback-default"))
    .priority(0)
    .when("country", "nin", ["__never_matches__"])
    .thenFallback(
      TrustLevel.T4_FALLBACK,
      "No specific rule matched — show universal emergency card"
    )
];
