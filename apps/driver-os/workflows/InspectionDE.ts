/**
 * WORKFLOW: Inspection_DE — compiled from the authored WorkflowVersion.
 *
 * Single authored shape (Faza 1.3): the workflow lives in InspectionDE.version.ts
 * as a platform `WorkflowVersion` (canonical, versioned, validated by
 * WorkflowValidator). Here we compile it to the runtime WorkflowDefinition the
 * engine executes, and keep `InspectionDE` as the module's export so bootstrap
 * + integration tests stay unchanged.
 *
 * Property (WorkflowEngine integration suite): AI appears zero times unless the
 * driver explicitly asks a question — the correctness test for this workflow.
 */

import { inspectionDEVersion } from "./InspectionDE.version";
import { compileWorkflowVersion } from "../../../core/workflow/compileWorkflowVersion";
import { validateWorkflowDefinition } from "../../../core/workflow/validateWorkflowDefinition";

export const InspectionDE = compileWorkflowVersion(inspectionDEVersion, "Verkehrskontrolle — Deutschland");

// Run validation at module load — fail the build immediately if broken.
validateWorkflowDefinition(InspectionDE);
