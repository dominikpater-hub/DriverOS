// core/workflow/__tests__/compileWorkflowVersion.test.ts
// Locks the WorkflowVersion -> runtime mapping (Faza 1.3): transitions -> next,
// offline FALLBACK -> fallback, requiredCapabilities -> requires,
// knowledgeRef -> data.knowledgeTags, LocalizedText -> string.

import { compileWorkflowVersion } from "../compileWorkflowVersion";
import { adrCheckDEVersion } from "../../../apps/driver-os/workflows/ADRCheckDE";
import { Capability } from "../../../shared/platform/capability";

describe("compileWorkflowVersion", () => {
  const def = compileWorkflowVersion(adrCheckDEVersion);

  test("carries id, entry and step count from the version", () => {
    expect(def.id).toBe("ADR_Check_DE");
    expect(def.entryStepId).toBe("adr_step_emergency_card");
    expect(def.steps).toHaveLength(adrCheckDEVersion.steps.length);
  });

  test("default transition compiles to next; END compiles to undefined", () => {
    const emergency = def.steps.find((s) => s.id === "adr_step_emergency_card")!;
    expect(emergency.next).toBe("adr_step_show_rights");
    const report = def.steps.find((s) => s.kind && s.id === "adr_step_generate_report")!;
    expect(report.next).toBeUndefined();
  });

  test("offline FALLBACK compiles to the runtime fallback step", () => {
    const translate = def.steps.find((s) => s.id === "adr_step_translate")!;
    expect(translate.fallback).toBe("adr_step_capture_photo");
    expect(translate.requires).toContain(Capability.NETWORK);
  });

  test("knowledgeRef compiles to data.knowledgeTags", () => {
    const rights = def.steps.find((s) => s.id === "adr_step_show_rights")!;
    const adr = def.steps.find((s) => s.id === "adr_step_show_adr")!;
    expect(rights.data?.knowledgeTags).toEqual(["rights"]);
    expect(adr.data?.knowledgeTags).toEqual(["adr"]);
  });

  test("LocalizedText title resolves to a string", () => {
    const emergency = def.steps.find((s) => s.id === "adr_step_emergency_card")!;
    expect(typeof emergency.title).toBe("string");
    expect(emergency.title.length).toBeGreaterThan(0);
  });
});
