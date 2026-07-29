// apps/travel-os/manifest.ts
// THE PLATFORM PROOF (ADR-009 definition of done): a second product is a
// manifest + packages + thin UI — with ZERO lines added to core/. TravelOS
// declares a narrower capability set than DriverOS (no OCR here) and the
// validator will simply refuse any workflow that needs something absent.

import type { ProductManifest } from "../../shared/platform/product";
import { PlatformPermission } from "../../shared/platform/product";
import { Capability } from "../../shared/platform/capability";
import type {
  ProductId,
  ModuleId,
  FlagKey,
  ThemeRef,
  Hash,
  SemVer,
  CountryCode,
  LanguageCode,
} from "../../shared/platform/ids";

export const travelOSManifest: ProductManifest = {
  productId: "travel-os" as ProductId,
  name: "TravelOS",
  version: "0.1.0" as SemVer,

  capabilities: {
    available: [
      Capability.GPS,
      Capability.NETWORK,
      Capability.TRANSLATION,
      Capability.AI,
      Capability.NOTIFICATIONS,
      Capability.OFFLINE_STORAGE,
      Capability.MAPS,
    ],
    restricted: [Capability.CAMERA],
  },

  modules: ["EMERGENCY", "RIGHTS", "BORDER"].map((m) => m as ModuleId),

  workflowPackages: [
    { id: "travel-os.workflows", version: "1.0.0" as SemVer, checksum: "sha256:wf-travelos" as Hash },
  ],
  knowledgePackages: [
    { id: "knowledge-eu-border", version: "1.0.0" as SemVer, checksum: "sha256:kn-border" as Hash },
  ],

  branding: {
    appName: "TravelOS",
    theme: "theme.travel-os.light" as ThemeRef,
    tone: "FRIENDLY",
  },

  featureFlags: {
    ["ai.assist.enabled" as FlagKey]: true,
    ["maps.offline.enabled" as FlagKey]: true,
  },

  permissions: [PlatformPermission.EXPORT_REPORTS],

  offlinePackages: {
    tier0: { id: "tier0-eu", version: "1.0.0" as SemVer, checksum: "sha256:t0-eu" as Hash },
    tier1Countries: ["AT" as CountryCode, "CH" as CountryCode, "IT" as CountryCode],
    tier2Strategy: "ROUTE",
  },

  regionSupport: {
    countries: ["AT" as CountryCode, "CH" as CountryCode, "IT" as CountryCode, "DE" as CountryCode],
    languages: ["en" as LanguageCode, "de" as LanguageCode, "it" as LanguageCode],
  },
};
