// AUTO-SPLIT z core/index.ports.ts — porty per kontekst (spec §8.3 / ADR fix).
import { CountryCode, TrustLevel, WorkflowDefId } from "../../shared/types";

/**
 * Deterministic rule engine.
 * Zero LLM. Zero probability.
 * Given identical input, always same output — 100% testable.
 */
export interface IDecisionPort {
  /**
   * Match rules and return outcome
   * Outcome typically points to WorkflowDefinition
   * or specifies a TrustLevel if no workflow applies
   */
  matchRules(input: DecisionInput): Promise<DecisionOutcome>;
}

export interface DecisionInput {
  country: CountryCode;
  userType?: string;
  vehicle?: {
    category: string;
    adrClass?: string;
  };
  eventType?: string; // e.g., "ROAD_INSPECTION", "ACCIDENT"
  context?: Record<string, unknown>;
}

export interface DecisionOutcome {
  /** Workflow to execute (e.g., "Inspection_DE") */
  workflowDefId?: WorkflowDefId;
  
  /** If no workflow, specify trust level for fallback */
  fallbackTrustLevel?: TrustLevel;
  
  /** Human-readable explanation for debugging */
  reasoning?: string;
}
