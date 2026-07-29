/**
 * WorkflowUI
 *
 * Thin rendering of workflow state — per Engineering Handbook: "React must
 * never contain business logic." This component makes zero decisions: it
 * shows whatever `lastResult` says, renders a trust badge because the
 * Domain Model requires it, and forwards user actions back through
 * useWorkflow(). Any actual logic (which step comes next, whether a
 * fallback was taken, what content is verified vs AI-assisted) already
 * happened in WorkflowEngine before this component ever saw it.
 *
 * UX constraints from the Handbook this directly implements:
 *   - Max 2 taps, max 1 decision, max 5 seconds to critical information
 *     -> title + primary action button dominate the screen; everything
 *        else (warnings, details) is secondary and below the fold.
 */

import { useEffect, useState } from "react";
import { useWorkflow } from "../hooks/useWorkflow";
import { TrustLevelBadge } from "./TrustLevelBadge";
import type { TrustLevel } from "../../../../shared/types";

interface WorkflowUIProps {
  userId: string;
  defId: string;
  location?: { latitude: number; longitude: number };
  language?: string;
  onIncidentComplete?: (incident: unknown) => void;
}

export function WorkflowUI({ userId, defId, location, language, onIncidentComplete }: WorkflowUIProps) {
  const { instance, lastResult, loading, error, start, executeStep, complete } = useWorkflow();
  const [photoData, setPhotoData] = useState<string | null>(null);

  useEffect(() => {
    start({ userId, defId, location, language }).catch(() => {
      /* error already captured in hook state, surfaced below */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNext = async () => {
    if (!instance) return;

    if (instance.state !== "ACTIVE") {
      const incident = await complete();
      onIncidentComplete?.(incident);
      return;
    }

    const stepInput = photoData ? { photo: photoData } : undefined;
    await executeStep(stepInput);
    setPhotoData(null);
  };

  const handlePhotoSelected = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPhotoData(reader.result as string);
    reader.readAsDataURL(file);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-red-300 bg-red-50 p-6 text-red-800">
        <p className="font-semibold">Etwas ist schiefgelaufen.</p>
        <p className="mt-1 text-sm">{error}</p>
        <p className="mt-3 text-sm">Bei einem echten Notfall: 112 anrufen.</p>
      </div>
    );
  }

  if (loading && !instance) {
    return (
      <div className="mx-auto max-w-md p-6 text-center text-slate-500">
        Wird geladen…
      </div>
    );
  }

  if (!instance) return null;

  const step = lastResult;
  const isDone = instance.state === "COMPLETED";
  const needsPhoto = step?.kind === "CAPTURE_PHOTO";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold leading-tight text-slate-900">
          {step?.uiPrompt?.title ?? "Vorbereitung…"}
        </h1>
        {step?.uiPrompt?.trustLevel && (
          <TrustLevelBadge level={step.uiPrompt.trustLevel as TrustLevel} />
        )}
      </header>

      <main className="rounded-xl border border-slate-200 bg-white p-4">
        {step?.uiPrompt?.content ? (
          <p className="whitespace-pre-line text-slate-700">{step.uiPrompt.content}</p>
        ) : (
          <p className="text-slate-400">Kein zusätzlicher Text für diesen Schritt.</p>
        )}

        {needsPhoto && (
          <label className="mt-4 block cursor-pointer rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 hover:border-slate-400">
            {photoData ? "Foto ausgewählt ✓" : "Foto aufnehmen / hochladen"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handlePhotoSelected(file);
              }}
            />
          </label>
        )}
      </main>

      <footer>
        <button
          onClick={handleNext}
          disabled={loading || (needsPhoto && !photoData)}
          className="w-full rounded-xl bg-slate-900 py-3 text-base font-semibold text-white transition disabled:opacity-40"
        >
          {isDone ? "Bericht abschließen" : loading ? "…" : "Weiter"}
        </button>
      </footer>
    </div>
  );
}
