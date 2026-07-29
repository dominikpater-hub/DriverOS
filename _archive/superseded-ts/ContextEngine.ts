/**
 * CONTEXT ENGINE
 *
 * Builds SituationContext on demand.
 * - Never persisted — ephemeral, frozen as snapshot inside WorkflowInstance
 * - Resolves country from GPS with fallback to user's declared home country
 * - AI Engine never sees raw user input; it only ever receives a SituationContext
 */

import {
  CountryCode,
  LanguageCode,
  Connectivity,
  UserType,
  VehicleCategory,
  GeoPoint,
  isValidCountryCode,
  isValidLanguageCode
} from "../../shared/types";

import {
  IContextPort,
  ContextBuildInput,
  UserProfileSnapshot,
  VehicleSnapshot,
  SituationContext
} from "../index.ports";

// ============================================================================
// EXTERNAL LOOKUPS (interfaces — implementations injected)
// ============================================================================

/**
 * Reverse-geocoding: GPS coordinates -> CountryCode
 * Implementation: local offline geo-index (TIER_0) or online API
 */
interface IGeoResolver {
  resolveCountry(lat: number, lng: number): Promise<CountryCode | null>;
}

/**
 * Detects current connectivity state
 */
interface IConnectivityProbe {
  getConnectivity(): Promise<Connectivity>;
}

/**
 * User/vehicle lookups
 */
interface IProfileStorage {
  getUserProfile(userId: string): Promise<UserProfileSnapshot | null>;
  getVehicle(vehicleId: string): Promise<VehicleSnapshot | null>;
}

// ============================================================================
// CONTEXT ENGINE
// ============================================================================

export class ContextEngine implements IContextPort {
  constructor(
    private geoResolver: IGeoResolver,
    private connectivityProbe: IConnectivityProbe,
    private profileStorage: IProfileStorage
  ) {}

  /**
   * Resolve country: GPS first, fall back to home country if GPS unavailable
   * or geo-resolution fails (e.g., offline, no local geo-index match)
   */
  async resolveCountry(geoPoint?: { lat: number; lng: number }): Promise<CountryCode> {
    if (geoPoint) {
      const resolved = await this.geoResolver.resolveCountry(geoPoint.lat, geoPoint.lng);
      if (resolved && isValidCountryCode(resolved)) {
        return resolved;
      }
    }

    // No GPS or resolution failed — this is a Context Engine limitation,
    // caller (buildContext) applies the user's homeCountry fallback.
    throw new ContextResolutionError("Could not resolve country from GPS");
  }

  async getUserProfile(userId: string): Promise<UserProfileSnapshot | null> {
    return this.profileStorage.getUserProfile(userId);
  }

  async getVehicle(vehicleId: string): Promise<VehicleSnapshot | null> {
    return this.profileStorage.getVehicle(vehicleId);
  }

  /**
   * Build full SituationContext.
   * This is called exactly once at workflow start; the result is frozen
   * and stored as WorkflowInstance.contextSnapshot for the entire incident.
   */
  async buildContext(input: ContextBuildInput): Promise<SituationContext> {
    const profile = await this.profileStorage.getUserProfile(input.userId);
    if (!profile) {
      throw new Error(`UserProfile ${input.userId} not found`);
    }

    // Resolve country: GPS -> fallback to home country
    let resolvedCountry: CountryCode = profile.homeCountry;
    if (input.location) {
      try {
        resolvedCountry = await this.resolveCountry({
          lat: input.location.latitude,
          lng: input.location.longitude
        });
      } catch {
        // Fall back silently to homeCountry — this is expected offline behavior
        resolvedCountry = profile.homeCountry;
      }
    }

    // Resolve language: explicit input -> first of user's languages -> "en"
    const language: LanguageCode =
      (input.language && isValidLanguageCode(input.language) ? input.language : undefined) ||
      profile.languages[0] ||
      "en";

    const connectivity = await this.connectivityProbe.getConnectivity();

    const vehicle = input.vehicleId
      ? await this.profileStorage.getVehicle(input.vehicleId)
      : null;

    const geoPoint: GeoPoint | undefined = input.location
      ? {
          latitude: input.location.latitude,
          longitude: input.location.longitude,
          timestamp: new Date()
        }
      : undefined;

    return {
      timestamp: new Date(),
      location: geoPoint ?? null,
      resolvedCountry,
      language,
      connectivity,
      userProfile: profile.id as any, // UserProfileRef
      vehicle: vehicle ? (vehicle.id as any) : undefined,
      activeWorkflow: undefined,
      incidentState: undefined
    } as SituationContext;
  }
}

export class ContextResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContextResolutionError";
  }
}

// ============================================================================
// REFERENCE IMPLEMENTATIONS (offline-friendly)
// ============================================================================

/**
 * Offline geo-resolver: bounding-box lookup against a bundled country table.
 * No network required — this is what makes Context Engine work in TIER_0.
 */
export class OfflineBoundingBoxGeoResolver implements IGeoResolver {
  constructor(
    private boxes: Array<{ country: CountryCode; minLat: number; maxLat: number; minLng: number; maxLng: number }>
  ) {}

  async resolveCountry(lat: number, lng: number): Promise<CountryCode | null> {
    for (const box of this.boxes) {
      if (lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng) {
        return box.country;
      }
    }
    return null;
  }
}

/**
 * Simple connectivity probe based on navigator.onLine (client) or a ping (server)
 */
export class BrowserConnectivityProbe implements IConnectivityProbe {
  async getConnectivity(): Promise<Connectivity> {
    // Accessed via globalThis to avoid requiring the DOM lib in tsconfig —
    // this engine may run in Node (server) or browser (client) contexts.
    const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
    if (nav && typeof nav.onLine === "boolean") {
      return nav.onLine ? Connectivity.ONLINE : Connectivity.OFFLINE;
    }
    return Connectivity.ONLINE;
  }
}

/**
 * In-memory profile storage — for tests and local dev
 */
export class InMemoryProfileStorage implements IProfileStorage {
  private profiles = new Map<string, UserProfileSnapshot>();
  private vehicles = new Map<string, VehicleSnapshot>();

  addProfile(profile: UserProfileSnapshot): void {
    this.profiles.set(profile.id, profile);
  }

  addVehicle(vehicle: VehicleSnapshot): void {
    this.vehicles.set(vehicle.id, vehicle);
  }

  async getUserProfile(userId: string): Promise<UserProfileSnapshot | null> {
    return this.profiles.get(userId) ?? null;
  }

  async getVehicle(vehicleId: string): Promise<VehicleSnapshot | null> {
    return this.vehicles.get(vehicleId) ?? null;
  }
}
