/**
 * WORKFLOW: Inspection_DE
 *
 * German Road Inspection — first real workflow for DriverOS.
 * Reference implementation matching Domain Model §9 (Road Inspection flow).
 *
 * Property under test (WorkflowEngine integration suite):
 *   AI appears zero times unless the driver explicitly asks a question.
 *   That is the correctness test for this workflow.
 */

import { StepKind, Capability, createWorkflowDefId, createStepId } from "../../../shared/types";
import { WorkflowDefinition } from "../../../core/workflow/WorkflowEngine";

export const InspectionDE: WorkflowDefinition = {
  id: createWorkflowDefId("Inspection_DE"),
  name: "Verkehrskontrolle — Deutschland",
  version: "1.0.0",
  offlineCapable: true,
  entryStepId: createStepId("step_emergency_card"),
  steps: [
    {
      id: createStepId("step_emergency_card"),
      kind: StepKind.EMERGENCY_CARD,
      title: "Deine Rechte",
      description: "Sofort verfügbare Karte mit Grundrechten — funktioniert offline (TIER_0).",
      requires: [],
      next: createStepId("step_show_rights")
    },
    {
      id: createStepId("step_show_rights"),
      kind: StepKind.SHOW_KNOWLEDGE,
      title: "Was du wissen musst",
      description: "Verifiziertes Wissen (T1) zu Rechten während einer Kontrolle.",
      requires: [],
      next: createStepId("step_translate")
    },
    {
      id: createStepId("step_translate"),
      kind: StepKind.TRANSLATE,
      title: "Dokumente übersetzen",
      description: "Übersetzung von Dokumenten für den Beamten, falls nötig.",
      requires: [Capability.NETWORK],
      // Offline First (Handbook): every network-requiring step MUST have
      // a fallback. Validated at build time by validateWorkflowDefinition().
      fallback: createStepId("step_capture_photo"),
      next: createStepId("step_capture_photo")
    },
    {
      id: createStepId("step_capture_photo"),
      kind: StepKind.CAPTURE_PHOTO,
      title: "Dokumente / Situation fotografieren",
      description: "Beweissicherung für den Bericht.",
      requires: [Capability.CAMERA],
      next: createStepId("step_generate_report")
    },
    {
      id: createStepId("step_generate_report"),
      kind: StepKind.GENERATE_REPORT,
      title: "Bericht erstellen",
      description: "Incident wird erzeugt, inkl. knowledgeUsed[] für rechtliche Nachweisbarkeit.",
      requires: [],
      next: undefined // end of workflow
    }
  ]
};

/**
 * Build-time validation: every step requiring NETWORK must declare a fallback.
 * This is "Offline First" turned into a compile-time rule (Domain Model §5).
 */
export function validateWorkflowDefinition(def: WorkflowDefinition): void {
  for (const step of def.steps) {
    if (step.requires.includes(Capability.NETWORK) && !step.fallback) {
      throw new Error(
        `[${def.id}] Step "${step.id}" requires NETWORK but has no fallback. ` +
        `This violates Offline First (Engineering Handbook).`
      );
    }
  }

  if (def.offlineCapable) {
    // Every step must be reachable without network, either directly
    // or through its fallback chain.
    const networkOnlySteps = def.steps.filter(
      s => s.requires.includes(Capability.NETWORK) && !s.fallback
    );
    if (networkOnlySteps.length > 0) {
      throw new Error(
        `[${def.id}] Marked offlineCapable=true but has steps with no offline path: ` +
        networkOnlySteps.map(s => s.id).join(", ")
      );
    }
  }
}

// Run validation at module load — fail the build immediately if broken
validateWorkflowDefinition(InspectionDE);
