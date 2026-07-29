// apps/driver-os/manifest.ts
// ADR-009 (§7): a product IS configuration, not code. Engines never read this —
// only the package builder, the validator (W-07/W-09) and app bootstrap do.
// This is DriverOS declared as a manifest for the first time (Faza D, plan §9).

import type {
  ProductManifest,
} from "../../shared/platform/product";
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

export const driverOSManifest: ProductManifest = {
  productId: "driver-os" as ProductId,
  name: "DriverOS",
  version: "0.1.0" as SemVer,

  capabilities: {
    available: [
      Capability.GPS,
      Capability.CAMERA,
      Capability.NETWORK,
      Capability.OCR,
      Capability.TRANSLATION,
      Capability.AI,
      Capability.NOTIFICATIONS,
      Capability.OFFLINE_STORAGE,
    ],
    restricted: [Capability.MICROPHONE], // voice dictation — separate consent
  },

  modules: ["EMERGENCY", "ADVISOR", "RIGHTS", "INCIDENT"].map((m) => m as ModuleId),

  workflowPackages: [
    { id: "driver-os.workflows", version: "1.0.0" as SemVer, checksum: "sha256:wf-driveros" as Hash },
  ],
  knowledgePackages: [
    { id: "knowledge-de-traffic", version: "1.0.0" as SemVer, checksum: "sha256:kn-de" as Hash },
  ],

  branding: {
    appName: "DriverOS",
    theme: "theme.driver-os.dark" as ThemeRef,
    tone: "PROFESSIONAL",
  },

  featureFlags: {
    ["ai.assist.enabled" as FlagKey]: true,
    ["knowledge.feedbackLoop.optIn" as FlagKey]: true,
  },

  permissions: [
    PlatformPermission.READ_INCIDENTS,
    PlatformPermission.EXPORT_REPORTS,
    PlatformPermission.KNOWLEDGE_FEEDBACK_OPT_IN,
  ],

  offlinePackages: {
    tier0: { id: "tier0-de", version: "1.0.0" as SemVer, checksum: "sha256:t0-de" as Hash },
    tier1Countries: ["DE" as CountryCode],
    tier2Strategy: "NEIGHBORS",
  },

  regionSupport: {
    countries: ["DE" as CountryCode],
    languages: ["de" as LanguageCode, "pl" as LanguageCode, "en" as LanguageCode],
  },
};
