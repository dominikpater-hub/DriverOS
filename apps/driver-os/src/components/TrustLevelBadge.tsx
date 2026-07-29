/**
 * TrustLevelBadge
 *
 * Renders ADR-003's Trust Ladder (T1-T4) as a visible badge. This is not
 * a decorative detail — the Domain Model requires that "UI ma obowiązek
 * go renderować" (the UI has an obligation to render it). A driver must
 * always be able to tell, at a glance, whether what's on screen is
 * verified law, stale law, an AI explanation, or an offline fallback.
 *
 * Pure presentational component — no business logic, no data fetching.
 * Colors and labels are intentionally blunt, not subtle: under stress
 * (Handbook: "max 5 seconds to critical information"), ambiguity here
 * is the failure mode that matters most.
 */

import type { TrustLevel } from "../../../../shared/types";

interface TrustLevelBadgeProps {
  level: TrustLevel;
}

const BADGE_CONFIG: Record<
  TrustLevel,
  { label: string; description: string; bg: string; text: string; border: string }
> = {
  T1_VERIFIED: {
    label: "Geprüft",
    description: "Verifiziertes Recht — ohne Einschränkung",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-300"
  },
  T2_VERIFIED_STALE: {
    label: "Zu prüfen",
    description: "Verifiziert, aber Überprüfung überfällig",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300"
  },
  T3_AI_ASSISTED: {
    label: "KI-Hinweis",
    description: "KI-Erklärung — keine Rechtsberatung",
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-300"
  },
  T4_FALLBACK: {
    label: "Notfall-Info",
    description: "Offline-Basisinformation — Kontakte, universelle Rechte",
    bg: "bg-slate-100",
    text: "text-slate-800",
    border: "border-slate-300"
  }
} as any; // Keyed by the TrustLevel enum's string values (see shared/types)

export function TrustLevelBadge({ level }: TrustLevelBadgeProps) {
  const config = BADGE_CONFIG[level] ?? BADGE_CONFIG.T4_FALLBACK;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${config.bg} ${config.text} ${config.border}`}
      title={config.description}
      role="status"
      aria-label={`Vertrauensstufe: ${config.label} — ${config.description}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {config.label}
    </span>
  );
}
