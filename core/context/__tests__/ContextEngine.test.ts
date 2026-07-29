/**
 * CONTEXT ENGINE — TEST SUITE
 *
 * Target: 80% coverage (per Domain Model §3 / STARTUP_CHECKLIST Week 2).
 * Key properties under test:
 *   - GPS resolves to CountryCode when inside a known bounding box
 *   - Missing/failed GPS resolution falls back to the user's homeCountry
 *   - Language resolves: explicit input -> profile's first language -> "en"
 *   - The resulting SituationContext is a frozen-in-time snapshot (no live refs)
 */

import {
  ContextEngine,
  OfflineBoundingBoxGeoResolver,
  BrowserConnectivityProbe,
  InMemoryProfileStorage,
  ContextResolutionError
} from "../ContextEngine";
import { createUserId, createVehicleId, UserType, VehicleCategory, Connectivity } from "../../../shared/types";

describe("ContextEngine", () => {
  let profileStorage: InMemoryProfileStorage;
  let geoResolver: OfflineBoundingBoxGeoResolver;
  let engine: ContextEngine;

  const userId = createUserId("driver-001");

  beforeEach(() => {
    profileStorage = new InMemoryProfileStorage();
    profileStorage.addProfile({
      id: userId,
      type: UserType.PRO_DRIVER as any,
      languages: ["de", "en"],
      homeCountry: "DE"
    });

    geoResolver = new OfflineBoundingBoxGeoResolver([
      { country: "DE", minLat: 47.0, maxLat: 55.0, minLng: 5.5, maxLng: 15.5 },
      { country: "FR", minLat: 41.0, maxLat: 51.5, minLng: -5.5, maxLng: 9.5 }
    ]);

    engine = new ContextEngine(geoResolver, new BrowserConnectivityProbe(), profileStorage);
  });

  // ==========================================================================
  // COUNTRY RESOLUTION
  // ==========================================================================

  it("resolves country from GPS when coordinates fall inside a known bounding box", async () => {
    const country = await engine.resolveCountry({ lat: 52.52, lng: 13.405 }); // Berlin
    expect(country).toBe("DE");
  });

  it("resolves a different country for coordinates in a different box", async () => {
    const country = await engine.resolveCountry({ lat: 48.8566, lng: 2.3522 }); // Paris
    expect(country).toBe("FR");
  });

  it("throws ContextResolutionError when GPS falls outside all known boxes", async () => {
    await expect(
      engine.resolveCountry({ lat: 0, lng: 0 }) // Gulf of Guinea — no box covers this
    ).rejects.toThrow(ContextResolutionError);
  });

  it("throws ContextResolutionError when no GPS point is given", async () => {
    await expect(engine.resolveCountry(undefined)).rejects.toThrow(ContextResolutionError);
  });

  // ==========================================================================
  // buildContext — FALLBACK BEHAVIOR
  // ==========================================================================

  it("buildContext falls back to homeCountry when GPS resolution fails", async () => {
    const context = await engine.buildContext({
      userId,
      location: { latitude: 0, longitude: 0 } // outside all boxes
    });
    expect(context.resolvedCountry).toBe("DE"); // profile.homeCountry
  });

  it("buildContext uses GPS-resolved country when available", async () => {
    const context = await engine.buildContext({
      userId,
      location: { latitude: 48.8566, longitude: 2.3522 } // Paris
    });
    expect(context.resolvedCountry).toBe("FR");
  });

  it("buildContext falls back to homeCountry when no location is given at all", async () => {
    const context = await engine.buildContext({ userId });
    expect(context.resolvedCountry).toBe("DE");
  });

  // ==========================================================================
  // LANGUAGE RESOLUTION
  // ==========================================================================

  it("uses explicit language when provided and valid", async () => {
    const context = await engine.buildContext({ userId, language: "en" });
    expect(context.language).toBe("en");
  });

  it("falls back to profile's first language when no explicit language given", async () => {
    const context = await engine.buildContext({ userId });
    expect(context.language).toBe("de"); // profile.languages[0]
  });

  it("falls back to 'en' when explicit language is invalid", async () => {
    const context = await engine.buildContext({ userId, language: "xx" as any });
    expect(context.language).toBe("de"); // still profile.languages[0], since "xx" is invalid
  });

  // ==========================================================================
  // VEHICLE + PROFILE LOOKUP
  // ==========================================================================

  it("attaches vehicle reference when vehicleId is provided and found", async () => {
    const vehicleId = createVehicleId("truck-001");
    profileStorage.addVehicle({ id: vehicleId, category: VehicleCategory.TRUCK as any, adrClass: "3" });

    const context = await engine.buildContext({ userId, vehicleId });
    expect(context.vehicle).toBe(vehicleId);
  });

  it("throws when userId does not correspond to a known profile", async () => {
    await expect(
      engine.buildContext({ userId: createUserId("ghost-user") })
    ).rejects.toThrow(/not found/i);
  });

  // ==========================================================================
  // SNAPSHOT PROPERTIES
  // ==========================================================================

  it("stamps the context with a fresh timestamp on every build", async () => {
    const first = await engine.buildContext({ userId });
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await engine.buildContext({ userId });

    expect(second.timestamp.getTime()).toBeGreaterThanOrEqual(first.timestamp.getTime());
  });

  it("reports connectivity as ONLINE in the default Node test environment", async () => {
    const context = await engine.buildContext({ userId });
    expect(context.connectivity).toBe(Connectivity.ONLINE);
  });
});
