/**
 * Fundamental types for Guardian Engine
 * These types are used across all cores: Knowledge, Context, Decision, Workflow, AI
 * No business logic here — only type definitions and constructors for Value Objects
 */

// ============================================================================
// IDENTITY TYPES — Unique IDs for aggregates and entities
// ============================================================================

/**
 * Branded type for strong type safety.
 * Prevents mixing IDs of different types at compile time.
 */
type Branded<T, Brand extends string> = T & { readonly __brand: Brand };

export type KnowledgeId = Branded<string, "KnowledgeId">;
export type VersionId = Branded<string, "VersionId">;
export type CardId = Branded<string, "CardId">;
export type RuleId = Branded<string, "RuleId">;
export type WorkflowDefId = Branded<string, "WorkflowDefId">;
export type StepId = Branded<string, "StepId">;
export type InstanceId = Branded<string, "InstanceId">;
export type IncidentId = Branded<string, "IncidentId">;
export type UserId = Branded<string, "UserId">;
export type VehicleId = Branded<string, "VehicleId">;
export type ConsentId = Branded<string, "ConsentId">;

/**
 * Helper functions to create branded IDs safely
 */
export const createKnowledgeId = (value: string): KnowledgeId => value as KnowledgeId;
export const createVersionId = (value: string): VersionId => value as VersionId;
export const createCardId = (value: string): CardId => value as CardId;
export const createRuleId = (value: string): RuleId => value as RuleId;
export const createWorkflowDefId = (value: string): WorkflowDefId => value as WorkflowDefId;
export const createStepId = (value: string): StepId => value as StepId;
export const createInstanceId = (value: string): InstanceId => value as InstanceId;
export const createIncidentId = (value: string): IncidentId => value as IncidentId;
export const createUserId = (value: string): UserId => value as UserId;
export const createVehicleId = (value: string): VehicleId => value as VehicleId;
export const createConsentId = (value: string): ConsentId => value as ConsentId;

// ============================================================================
// COUNTRY CODES — ISO 3166-1
// ============================================================================

export type CountryCode =
  | "DE" | "FR" | "PL" | "IT" | "ES" | "GB" | "NL" | "BE" | "AT" | "CH"
  | "SE" | "NO" | "DK" | "FI" | "CZ" | "SK" | "HU" | "RO" | "HR" | "SI"
  | "LI" | "LU" | "IE" | "PT" | "GR" | "UA" | "BY" | "RU";

/**
 * Validates if a given string is a valid CountryCode
 */
export const isValidCountryCode = (value: unknown): value is CountryCode => {
  const valid: CountryCode[] = [
    "DE", "FR", "PL", "IT", "ES", "GB", "NL", "BE", "AT", "CH",
    "SE", "NO", "DK", "FI", "CZ", "SK", "HU", "RO", "HR", "SI",
    "LI", "LU", "IE", "PT", "GR", "UA", "BY", "RU"
  ];
  return typeof value === "string" && valid.includes(value as CountryCode);
};

// ============================================================================
// LANGUAGE CODES — ISO 639-1
// ============================================================================

export type LanguageCode = "de" | "en" | "fr" | "pl" | "it" | "es" | "nl" | "cs" | "pt" | "ro";

export const isValidLanguageCode = (value: unknown): value is LanguageCode => {
  const valid: LanguageCode[] = ["de", "en", "fr", "pl", "it", "es", "nl", "cs", "pt", "ro"];
  return typeof value === "string" && valid.includes(value as LanguageCode);
};

// ============================================================================
// TRUST LEVELS — ADR-003: Trust Ladder
// ============================================================================

export enum TrustLevel {
  /** Verified knowledge, current, no doubts */
  VERIFIED = "T1_VERIFIED",
  
  /** Verified knowledge but past review date — mark "requires verification" */
  VERIFIED_STALE = "T2_VERIFIED_STALE",
  
  /** AI-assisted answer, not legal knowledge, explicit disclaimer */
  AI_ASSISTED = "T3_AI_ASSISTED",
  
  /** Offline fallback: emergency contacts, universal rights, no specific law */
  FALLBACK = "T4_FALLBACK"
}

export const isTrustLevel = (value: unknown): value is TrustLevel => {
  return Object.values(TrustLevel).includes(value as TrustLevel);
};

// ============================================================================
// KNOWLEDGE DOMAIN — What type of knowledge?
// ============================================================================

export enum KnowledgeDomain {
  TRAFFIC_LAW = "TRAFFIC_LAW",
  CUSTOMS = "CUSTOMS",
  EMERGENCY = "EMERGENCY",
  ADR = "ADR",
  CABOTAGE = "CABOTAGE",
  HEALTH = "HEALTH",
  DOCUMENTATION = "DOCUMENTATION"
}

// ============================================================================
// SCOPE — Geographic/legal scope of knowledge
// ============================================================================

export enum KnowledgeScope {
  NATIONAL = "NATIONAL",     // Single country
  EU = "EU",                 // EU-wide
  REGIONAL = "REGIONAL"      // Multi-country region
}

// ============================================================================
// CONFIDENCE LEVELS — How verified is this knowledge?
// ============================================================================

export enum ConfidenceLevel {
  /** Official government source or law text */
  OFFICIAL = "OFFICIAL",
  
  /** Human-verified from trusted source */
  VERIFIED = "VERIFIED",
  
  /** Community-verified, flagged for expert review */
  COMMUNITY = "COMMUNITY"
}

// ============================================================================
// USER TYPES
// ============================================================================

export enum UserType {
  PRO_DRIVER = "PRO_DRIVER",           // Professional driver
  TRAVELER = "TRAVELER",               // Tourist/traveler
  FLEET_DRIVER = "FLEET_DRIVER",       // Fleet company driver
  RIDER = "RIDER",                     // Motorcycle
  CAMPER = "CAMPER"                    // RV/camper
}

// ============================================================================
// VEHICLE CATEGORIES
// ============================================================================

export enum VehicleCategory {
  TRUCK = "TRUCK",
  VAN = "VAN",
  CAR = "CAR",
  MOTORCYCLE = "MOTORCYCLE",
  CAMPER = "CAMPER"
}

// ============================================================================
// CONNECTIVITY STATE
// ============================================================================

export enum Connectivity {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
  DEGRADED = "DEGRADED"
}

// ============================================================================
// WORKFLOW STEP TYPES
// ============================================================================

export enum StepKind {
  /** Display verified knowledge to user */
  SHOW_KNOWLEDGE = "SHOW_KNOWLEDGE",
  
  /** Collect input from user (text, photos, choices) */
  COLLECT_INPUT = "COLLECT_INPUT",
  
  /** AI assistance (explanation, translation, OCR) */
  AI_ASSIST = "AI_ASSIST",
  
  /** OCR on document */
  OCR = "OCR",
  
  /** Translate text */
  TRANSLATE = "TRANSLATE",
  
  /** Capture photo or document */
  CAPTURE_PHOTO = "CAPTURE_PHOTO",
  
  /** Generate report from incident */
  GENERATE_REPORT = "GENERATE_REPORT",
  
  /** Show emergency card */
  EMERGENCY_CARD = "EMERGENCY_CARD",
  
  /** Decision point: rule-based routing */
  DECISION_POINT = "DECISION_POINT"
}

// ============================================================================
// CAPABILITIES — What does a step require?
// ============================================================================

export enum Capability {
  CAMERA = "CAMERA",
  MICROPHONE = "MICROPHONE",
  NETWORK = "NETWORK",
  GPS = "GPS",
  STORAGE = "STORAGE"
}

// ============================================================================
// WORKFLOW INSTANCE STATE
// ============================================================================

export enum WorkflowInstanceState {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  COMPLETED = "COMPLETED",
  ABANDONED = "ABANDONED"
}

// ============================================================================
// OFFLINE PACKAGE TIERS
// ============================================================================

export enum OfflinePackageTier {
  /** Emergency cards + contacts — ALWAYS bundled, never optional */
  TIER_0 = "TIER_0",
  
  /** Critical workflows + knowledge for user's country */
  TIER_1 = "TIER_1",
  
  /** Neighboring countries / planned route */
  TIER_2 = "TIER_2"
}

// ============================================================================
// GEO POINT — Location value object
// ============================================================================

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number; // meters
  timestamp: Date;
}

// ============================================================================
// SITUATION CONTEXT — §3 of Domain Model (efemeryczny, never persisted)
// ============================================================================

export interface SituationContext {
  timestamp: Date;
  location: GeoPoint | null;
  resolvedCountry: CountryCode;
  language: LanguageCode;
  connectivity: Connectivity;
  userProfile: UserId;
  vehicle?: VehicleId;
  activeWorkflow?: InstanceId;
  incidentState?: IncidentId;
}

/**
 * Region-level resolution (for anonymization §8)
 */
export interface RegionalGeoPoint {
  region: string; // e.g., "Bavaria", "Greater Paris"
  country: CountryCode;
}

// ============================================================================
// SEMANTIC VERSION
// ============================================================================

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export const semVerToString = (v: SemVer): string => `${v.major}.${v.minor}.${v.patch}`;

export const semVerFromString = (s: string): SemVer | null => {
  const match = s.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
};

// ============================================================================
// STRUCTURED CONTENT — Knowledge content format (§6 of Domain Model)
// ============================================================================

export interface ActionItem {
  order: number;
  text: string;
  critical?: boolean; // Must be followed
}

export interface StructuredContent {
  /** 1 sentence: what should user do? */
  summary: string;
  
  /** Action steps in order */
  actions: ActionItem[];
  
  /** User's rights (bullet points) */
  rights: string[];
  
  /** What NOT to do (warnings) */
  warnings: string[];
  
  /** Full text for later reading */
  details: string;
  
  /** Source references */
  legalRefs: SourceRef[];
}

export interface SourceRef {
  type: "LAW_TEXT" | "OFFICIAL_SITE" | "GOVERNMENT_API" | "EXPERT";
  reference: string; // e.g., "Dz.U.", "§123", URL
  retrievedAt: Date;
}

// ============================================================================
// HASH — For integrity checking (offline packages §7)
// ============================================================================

export type Hash = Branded<string, "Hash">;
export const createHash = (value: string): Hash => value as Hash;

// ============================================================================
// TIMESTAMP UTILITIES
// ============================================================================

export const now = (): Date => new Date();
export const dateToISO = (d: Date): string => d.toISOString();
export const isoToDate = (s: string): Date => new Date(s);

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates a date hasn't passed
 */
export const isDateInFuture = (d: Date): boolean => d > now();

/**
 * Validates a date is in the past
 */
export const isDateInPast = (d: Date): boolean => d < now();

/**
 * Checks if review is overdue
 */
export const isReviewOverdue = (nextReviewDue: Date): boolean => isDateInPast(nextReviewDue);
