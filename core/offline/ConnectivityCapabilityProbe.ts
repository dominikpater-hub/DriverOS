// core/offline/ConnectivityCapabilityProbe.ts
//
// M3 / Offline First (the platform's flagship principle): a capability that
// depends on the network is UNAVAILABLE when the device is offline. Wiring this
// probe into the WorkflowEngine turns "Offline First" from a slogan into an
// enforced invariant — a step that needs NETWORK/AI/TRANSLATION/OCR/MAPS while
// offline is routed to its declared fallback (a phrase card, a photo, a T4
// message) instead of failing. Everything not network-bound (hardware sensors,
// on-device storage, the emergency card baked into TIER_0) stays available.

import type { CapabilityProbe } from "../workflow/WorkflowEngine";
import { Capability, Connectivity, SituationContext } from "../../shared/types";

/** Capabilities that cannot function without a live network connection. */
const NETWORK_BOUND: ReadonlySet<Capability> = new Set<Capability>([
  Capability.NETWORK,
  Capability.AI,
  Capability.TRANSLATION,
  Capability.OCR,
  Capability.MAPS
]);

export class ConnectivityCapabilityProbe implements CapabilityProbe {
  isAvailable(cap: Capability, ctx: SituationContext): boolean {
    if (NETWORK_BOUND.has(cap)) {
      return ctx.connectivity === Connectivity.ONLINE;
    }
    // Hardware, storage and offline guarantees are always available regardless
    // of connectivity (that is the whole point of TIER_0 offline packages).
    return true;
  }
}
