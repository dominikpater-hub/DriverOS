// AUTO-SPLIT z core/index.ports.ts — porty per kontekst (spec §8.3 / ADR fix).
import { CountryCode, LanguageCode, SituationContext } from "../../shared/types";
export type { SituationContext };

/**
 * Builds SituationContext on demand.
 * Context is ephemeral — not persisted, only snapshotted in Incidents
 */
export interface IContextPort {
  /**
   * Resolve country from GPS or user input
   * Falls back to user's declared homeCountry
   */
  resolveCountry(geoPoint?: { lat: number; lng: number }): Promise<CountryCode>;

  /**
   * Get user profile
   */
  getUserProfile(userId: string): Promise<UserProfileSnapshot | null>;

  /**
   * Get vehicle info
   */
  getVehicle(vehicleId: string): Promise<VehicleSnapshot | null>;

  /**
   * Build full context snapshot
   * Called at workflow start; snapshot frozen for entire incident
   */
  buildContext(input: ContextBuildInput): Promise<SituationContext>;
}

export interface ContextBuildInput {
  userId: string;
  location?: { latitude: number; longitude: number };
  language?: LanguageCode;
  vehicleId?: string;
}

export interface UserProfileSnapshot {
  id: string;
  type: "PRO_DRIVER" | "TRAVELER" | "FLEET_DRIVER" | "RIDER" | "CAMPER";
  languages: LanguageCode[];
  homeCountry: CountryCode;
}

export interface VehicleSnapshot {
  id: string;
  category: "TRUCK" | "VAN" | "CAR" | "MOTORCYCLE" | "CAMPER";
  adrClass?: string;
}
