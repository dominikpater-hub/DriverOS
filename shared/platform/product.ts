// shared/types/product.ts
// TASK 7 / ADR-009 (Artefakt #0003 §7): a product is configuration, not
// code. Engines never import or read ProductManifest — only the package
// builder, the validator, and the app bootstrap layer do (§7.3 rule 1).

import type {
  CountryCode,
  FlagKey,
  Hash,
  LanguageCode,
  ModuleId,
  ProductId,
  SemVer,
  ThemeRef,
} from "./ids";
import type { Capability } from "./capability";

export enum OfflineTier {
  TIER_0 = "TIER_0",
  TIER_1 = "TIER_1",
  TIER_2 = "TIER_2",
}

export enum PlatformPermission {
  READ_INCIDENTS = "READ_INCIDENTS",
  EXPORT_REPORTS = "EXPORT_REPORTS",
  FLEET_AGGREGATION = "FLEET_AGGREGATION",
  KNOWLEDGE_FEEDBACK_OPT_IN = "KNOWLEDGE_FEEDBACK_OPT_IN",
}

export interface PackageRef {
  id: string;
  version: SemVer;
  checksum: Hash;
}

export interface ProductCapabilities {
  available: Capability[];
  restricted: Capability[]; // available, but require separate user consent
}

export interface ProductManifest {
  productId: ProductId;
  name: string;
  version: SemVer;

  capabilities: ProductCapabilities;
  modules: ModuleId[];

  workflowPackages: PackageRef[];
  knowledgePackages: PackageRef[];

  branding: {
    appName: string;
    theme: ThemeRef;
    tone: "PROFESSIONAL" | "FRIENDLY";
  };

  featureFlags: Record<FlagKey, boolean>;
  permissions: PlatformPermission[];

  offlinePackages: {
    tier0: PackageRef;
    tier1Countries: CountryCode[];
    tier2Strategy: "NEIGHBORS" | "ROUTE" | "NONE";
  };

  regionSupport: {
    countries: CountryCode[];
    languages: LanguageCode[];
  };
}
