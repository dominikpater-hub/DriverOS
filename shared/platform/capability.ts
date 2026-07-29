// shared/types/capability.ts
// TASK 3 / ADR-006 (Artefakt #0003 §3): capability is a build-time contract
// between WorkflowVersion and ProductManifest. Runtime only probes hardware —
// it never resolves "does this product support this workflow", because that
// question is answered at package-build time (validation rule W-07).

import { Capability } from "../types";
export { Capability };

export enum CapabilityStatus {
  AVAILABLE = "AVAILABLE",
  DENIED = "DENIED", // user declined consent — must be indistinguishable
  UNAVAILABLE = "UNAVAILABLE", // hardware/software absent
}

/**
 * Runtime probe. Implemented per-platform (web, iOS, Android). Workflow
 * Engine consults this before a step that declares requiredCapabilities;
 * it never consults ProductManifest directly (that's a build-time concern —
 * see ADR-009, §7.3 point 1).
 */
export interface CapabilityProbe {
  check(capability: Capability): Promise<CapabilityStatus>;
}

/**
 * §3.3 rule 3 (Privacy by Design): DENIED and UNAVAILABLE must both simply
 * mean "not available" to workflow logic. This helper enforces that at the
 * type level — callers can't branch on DENIED vs UNAVAILABLE without an
 * explicit, deliberate unwrap.
 */
export function isUsable(status: CapabilityStatus): boolean {
  return status === CapabilityStatus.AVAILABLE;
}
