// core/workflow/validation/__tests__/fixtures.ts
// Builds a minimal, valid WorkflowVersion (shape mirrors Inspection_DE from
// STARTUP_CHECKLIST.md / apps/driver-os/workflows/InspectionDE.ts) that
// each test case then mutates to trigger exactly one rule violation.

import { Capability } from "../../../../shared/platform/capability";
import type { StepId, WorkflowVersionId, WorkflowDefId, Hash, SemVer, DateTime, PublisherId, LanguageCode } from "../../../../shared/platform/ids";
import type { StepDefinition, WorkflowVersion } from "../../../../shared/platform/workflow";
import { OfflinePolicy, StepKind, WorkflowDomain } from "../../../../shared/platform/workflow";

function id<T extends string>(v: string): T {
  return v as unknown as T;
}

function step(overrides: Partial<StepDefinition> & Pick<StepDefinition, "id" | "kind">): StepDefinition {
  return {
    title: { [id<LanguageCode>("de")]: overrides.id as unknown as string },
    requiredCapabilities: [],
    optionalCapabilities: [],
    preconditions: [],
    postconditions: [],
    transitions: [],
    retry: null,
    rollback: null,
    offline: { mode: "NATIVE", fallbackStepId: null },
    timeoutMs: null,
    ...overrides,
  };
}

/**
 * entry -> knowledge -> translate(NETWORK, fallback->photo) -> photo -> report -> END
 */
export function validInspectionDE(): WorkflowVersion {
  const s = {
    emergency: id<StepId>("step_emergency"),
    knowledge: id<StepId>("step_knowledge"),
    translate: id<StepId>("step_translate"),
    photo: id<StepId>("step_photo"),
    report: id<StepId>("step_report"),
  };

  const steps: StepDefinition[] = [
    step({
      id: s.emergency,
      kind: StepKind.EMERGENCY_CARD,
      transitions: [{ to: s.knowledge, guard: null, priority: 0 }],
    }),
    step({
      id: s.knowledge,
      kind: StepKind.SHOW_KNOWLEDGE,
      knowledgeRef: "traffic-rights-de",
      transitions: [{ to: s.translate, guard: null, priority: 0 }],
    }),
    step({
      id: s.translate,
      kind: StepKind.TRANSLATE,
      requiredCapabilities: [Capability.NETWORK],
      offline: { mode: "FALLBACK", fallbackStepId: s.photo },
      transitions: [{ to: s.photo, guard: null, priority: 0 }],
    }),
    step({
      id: s.photo,
      kind: StepKind.CAPTURE_PHOTO,
      requiredCapabilities: [Capability.CAMERA],
      transitions: [{ to: s.report, guard: null, priority: 0 }],
    }),
    step({
      id: s.report,
      kind: StepKind.GENERATE_REPORT,
      transitions: [{ to: "END", guard: null, priority: 0 }],
    }),
  ];

  return {
    id: id<WorkflowVersionId>("Inspection_DE@1.0.0#test"),
    definitionId: id<WorkflowDefId>("Inspection_DE"),
    version: id<SemVer>("1.0.0"),
    entryStepId: s.emergency,
    steps,
    requiredCapabilities: [Capability.NETWORK, Capability.CAMERA],
    optionalCapabilities: [],
    offlinePolicy: OfflinePolicy.FULL_OFFLINE,
    localization: [id<LanguageCode>("de")],
    publishedAt: id<DateTime>("2026-07-18T00:00:00Z"),
    publishedBy: id<PublisherId>("admin@guardian.de"),
    supersededBy: null,
    checksum: id<Hash>("sha256:abc123"),
  };
}

export { id, step };
export const stepIds = {
  emergency: id<StepId>("step_emergency"),
  knowledge: id<StepId>("step_knowledge"),
  translate: id<StepId>("step_translate"),
  photo: id<StepId>("step_photo"),
  report: id<StepId>("step_report"),
};
