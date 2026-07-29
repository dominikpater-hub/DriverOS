// apps/__tests__/product-readiness.test.ts
//
// The platform-readiness proof. Two products (DriverOS, TravelOS), each just
// a ProductManifest + a WorkflowVersion authored as DATA, both cleared by the
// SAME platform validator against their OWN declared capabilities. Nothing
// here touches core/ — that's the ADR-009 "definition of done" for the
// platform, exercised as an actual test rather than an aspiration.

import { validateWorkflowVersion } from "../../core/workflow/validation/WorkflowValidator";
import { WorkflowDomain } from "../../shared/platform/workflow";
import { Capability } from "../../shared/platform/capability";

import { driverOSManifest } from "../driver-os/manifest";
import { inspectionDEVersion } from "../driver-os/workflows/InspectionDE.version";
import { travelOSManifest } from "../travel-os/manifest";
import { borderCrossingVersion } from "../travel-os/workflows/BorderCrossing.version";

describe("Product readiness — DriverOS", () => {
  test("Inspection_DE validates against the DriverOS manifest capabilities", () => {
    const result = validateWorkflowVersion(inspectionDEVersion, {
      productCapabilities: driverOSManifest.capabilities.available,
      knownKnowledgeRefs: new Set(["rights"]),
      domain: WorkflowDomain.INSPECTION,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("W-07: rejected when the manifest lacks CAMERA (Inspection_DE needs CAPTURE_PHOTO)", () => {
    const result = validateWorkflowVersion(inspectionDEVersion, {
      productCapabilities: driverOSManifest.capabilities.available.filter((c) => c !== Capability.CAMERA),
      knownKnowledgeRefs: new Set(["rights"]),
      domain: WorkflowDomain.INSPECTION,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === "W-07")).toBe(true);
  });
});

describe("Product readiness — TravelOS (second product, zero lines in core/)", () => {
  test("Border_Crossing validates against the TravelOS manifest capabilities", () => {
    const result = validateWorkflowVersion(borderCrossingVersion, {
      productCapabilities: travelOSManifest.capabilities.available,
      knownKnowledgeRefs: new Set(["border-rights-eu"]),
      domain: WorkflowDomain.BORDER,
    });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test("W-07: rejected when the product lacks TRANSLATION (Border_Crossing needs TRANSLATE)", () => {
    const result = validateWorkflowVersion(borderCrossingVersion, {
      productCapabilities: travelOSManifest.capabilities.available.filter((c) => c !== Capability.TRANSLATION),
      knownKnowledgeRefs: new Set(["border-rights-eu"]),
      domain: WorkflowDomain.BORDER,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === "W-07")).toBe(true);
  });

  test("manifests differ meaningfully: DriverOS's camera workflow is NOT valid for TravelOS", () => {
    // TravelOS lists CAMERA only as `restricted`, not `available` — so a
    // camera-dependent DriverOS workflow cannot silently run on TravelOS.
    const result = validateWorkflowVersion(inspectionDEVersion, {
      productCapabilities: travelOSManifest.capabilities.available,
      knownKnowledgeRefs: new Set(["rights"]),
      domain: WorkflowDomain.INSPECTION,
    });
    expect(result.valid).toBe(false);
  });
});
