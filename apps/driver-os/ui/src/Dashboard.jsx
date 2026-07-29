// Dashboard.jsx — EKRAN GŁÓWNY DriverOS jako system operacyjny kierowcy.
// To NIE jest ekran nauki. To launcher: "Dzisiaj" + siatka apek + pasek AI.
// Nauka (ADR Trainer) to JEDNA z apek, nie korzeń — jak Kalkulator w telefonie.
//
// Czas jazdy = ATRAPA, jawnie oznaczona DEMO. Bez realnego źródła (tacho/ręczne)
// nie wolno jej ufać — dlatego badge "DEMO" i brak alarmów opartych na tej liczbie.

import React from "react";

/* ---------- ATRAPA DANYCH DNIA (jawnie demo) ----------
   W produkcji: z Profile Engine + tacho/ręczne wprowadzanie. Tu tylko kształt UI. */
const DEMO_DAY = {
  driveMinutes: 252,        // 4h 12min z 9h
  driveLimit: 540,          // 9h dzienny limit
  nextBreakIn: 18,          // min do obowiązkowej przerwy (po 4,5h)
  tasksToday: 2,
  adrDaysLeft: 47,          // do końca ważności ADR
  dueReviews: null,         // wstrzykiwane z realnego stanu nauki
};

const fmtHM = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}min`;

export default function Dashboard({ C, dueReviews, onOpenApp, onOpenAssist, onOpenAssistEngine }) {
  const d = { ...DEMO_DAY, dueReviews };
  const drivePct = Math.min(100, Math.round((d.driveMinutes / d.driveLimit) * 100));

  // Pasek AI — proaktywne podpowiedzi. Czas jazdy oznaczony jako DEMO,
  // podpowiedzi z realnych danych (powtórki, ADR) bez tego zastrzeżenia.
  const aiTips = [
    { demo: true, text: `Masz ${d.nextBreakIn} min do obowiązkowej przerwy`, icon: "⏸️" },
    d.dueReviews > 0 && { demo: false, text: `${d.dueReviews} ${plural(d.dueReviews, "powtórka", "powtórki", "powtórek")} czeka w nauce`, icon: "📚", app: "trainer" },
    { demo: true, text: `ADR ważny jeszcze ${d.adrDaysLeft} dni`, icon: "⚠️" },
  ].filter(Boolean);

  return (
    <div style={wrap(C)}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 8px" }}>
        <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>Driver<span style={{ color: C.red }}>OS</span></div>
        <div style={{ fontSize: 12, color: C.dim, fontFamily: C.mono }}>kierowca zawodowy</div>
      </div>

      <div style={{ flex: 1, padding: "8px 20px 20px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>

        {/* ── DZIŚ — karta czasu jazdy (DEMO) ── */}
        <div style={{ ...card(C) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: C.dim, fontFamily: C.mono, letterSpacing: "0.03em" }}>DZIŚ</div>
            <span style={{ fontSize: 10, fontWeight: 800, color: C.amber, border: `1px solid ${C.amber}66`, borderRadius: 6, padding: "2px 7px", fontFamily: C.mono }}>DEMO — dane przykładowe</span>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>{fmtHM(d.driveMinutes)}</div>
            <div style={{ fontSize: 14, color: C.dim }}>/ {fmtHM(d.driveLimit)} jazdy</div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: C.line, overflow: "hidden", marginTop: 10 }}>
            <div style={{ height: "100%", width: `${drivePct}%`, background: drivePct >= 90 ? C.red : drivePct >= 70 ? C.amber : C.green, transition: "width .4s" }} />
          </div>

          <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
            <MiniStat C={C} label="Do przerwy" value={`${d.nextBreakIn} min`} color={C.amber} />
            <MiniStat C={C} label="Zadania" value={d.tasksToday} color={C.text} />
            <MiniStat C={C} label="ADR ważny" value={`${d.adrDaysLeft} dni`} color={C.greenLite} />
          </div>
        </div>

        {/* ── PASEK AI ── */}
        <div style={{ ...card(C), background: "#12161D", borderColor: C.line }}>
          <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <span>✦</span> ASYSTENT
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aiTips.map((t, i) => (
              <button key={i} onClick={() => t.app && onOpenApp(t.app)} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, textAlign: "left", cursor: t.app ? "pointer" : "default", width: "100%" }}>
                <span style={{ fontSize: 16 }}>{t.icon}</span>
                <span style={{ fontSize: 14, color: C.text, flex: 1, lineHeight: 1.4 }}>{t.text}</span>
                {t.demo && <span style={{ fontSize: 9, color: C.amber, fontFamily: C.mono, opacity: 0.8 }}>DEMO</span>}
                {t.app && <span style={{ color: C.dim, fontSize: 14 }}>›</span>}
              </button>
            ))}
          </div>
        </div>

        {/* ── SIATKA APEK ── */}
        <div style={{ display: "flex", gap: 12 }}>
          <AppColumn C={C} title="KIEROWCA" apps={DRIVER_APPS} onOpenApp={onOpenApp} />
          <AppColumn C={C} title="NAUKA" apps={LEARN_APPS} onOpenApp={onOpenApp} dueReviews={d.dueReviews} />
        </div>

        {/* ── ASYSTA INCYDENTOWA (czerwony, zawsze pod ręką) ── */}
        <button onClick={onOpenAssist} style={{ ...bigBtn, background: C.red, color: "#fff", marginTop: 2 }}>
          🚨 Zdarzenie w trasie — kontrola / wypadek
        </button>

        {/* M5.1: ta sama asysta prowadzona przez REALNY silnik Guardian (core),
            obok prototypu. W M5.2 zastępuje wariant prototypowy. */}
        {onOpenAssistEngine && (
          <button onClick={onOpenAssistEngine} style={{ ...bigBtn, background: C.card, color: C.text, border: `1px solid ${C.edge}`, fontWeight: 700, padding: "14px 24px" }}>
            ⚙️ Asysta na silniku (core) — podgląd
          </button>
        )}
      </div>

      <div style={{ padding: "10px 20px 16px", textAlign: "center", fontSize: 10, color: C.faint, fontFamily: C.mono }}>
        DriverOS · prototyp · dane czasu jazdy są przykładowe (DEMO)
      </div>
    </div>
  );
}

/* ---------- APKI (rejestr) ---------- */
const DRIVER_APPS = [
  { id: "tachograf-app", icon: "🕐", label: "Tachograf", soon: true },
  { id: "czas-pracy-app", icon: "⏱️", label: "Czas pracy", soon: true },
  { id: "karty-app", icon: "💳", label: "Karty", soon: true },
  { id: "kontrole-app", icon: "🛃", label: "Kontrole", soon: true },
  { id: "checklisty-app", icon: "✓", label: "Checklisty", soon: true },
];
const LEARN_APPS = [
  { id: "trainer", icon: "🎓", label: "Nauka", badge: "dueReviews" },
  { id: "qa", icon: "💬", label: "Zapytaj" },
];

function AppColumn({ C, title, apps, onOpenApp, dueReviews }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, padding: "0 2px" }}>{title}</div>
      {apps.map((a) => {
        const badge = a.badge === "dueReviews" && dueReviews > 0 ? dueReviews : null;
        return (
          <button key={a.id} onClick={() => !a.soon && onOpenApp(a.id)} disabled={a.soon}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: a.soon ? C.faint : C.text, cursor: a.soon ? "default" : "pointer", position: "relative" }}>
            <span style={{ fontSize: 18, opacity: a.soon ? 0.5 : 1 }}>{a.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{a.label}</span>
            {a.soon && <span style={{ fontSize: 9, color: C.faint, fontFamily: C.mono }}>wkrótce</span>}
            {badge && <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: C.red, borderRadius: 10, minWidth: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px" }}>{badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MiniStat({ C, label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 800, color, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 10, color: C.dim, fontFamily: C.mono, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return few;
  return many;
}

const wrap = (C) => ({ maxWidth: 480, margin: "0 auto", minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column" });
const card = (C) => ({ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 18 });
const bigBtn = { width: "100%", padding: "18px 24px", fontSize: 16, fontWeight: 800, border: "none", borderRadius: 14, cursor: "pointer", letterSpacing: "-0.01em" };
