// App.jsx — korzeń DriverOS jako SYSTEM OPERACYJNY kierowcy.
// Dashboard "Dzisiaj" jest ekranem głównym. Wszystko inne to apki uruchamiane z niego:
// Nauka (ADR Trainer), Zapytaj (Knowledge QA), Asysta incydentowa (kontrola/wypadek).
// Guardian Engine = mózg (silniki). DriverOS = interfejs. Apka = jedno z narzędzi.
import React, { useState } from "react";
import Dashboard from "./Dashboard.jsx";
import DriverOS, { TrustBadge } from "./DriverOS.jsx";
// ADR trainer is authored in a separate session — imported via a stable seam
// (same named surface) so the DriverOS shell builds and runs without it.
// Theme tokens now live in ./theme (extracted out of the trainer). See M5.0.
import AdrTrainer, { ALL, MODULES, countDueReviews } from "./adr-trainer.stub.jsx";
import { C } from "./theme.js";
import KnowledgeQA from "./KnowledgeQA.jsx";

export default function App() {
  const [route, setRoute] = useState({ screen: "dashboard" }); // dashboard | assist | training | qa
  const [dueReviews, setDueReviews] = useState(() => countDueReviews());
  const goDash = () => { setDueReviews(countDueReviews()); setRoute({ screen: "dashboard" }); };

  // mapowanie id apki -> ekran
  function openApp(appId) {
    if (appId === "trainer") return setRoute({ screen: "training", module: null });
    if (appId === "qa") return setRoute({ screen: "qa" });
    // apki "wkrótce" nie mają jeszcze ekranu — Dashboard je blokuje
  }

  if (route.screen === "training")
    return <AdrTrainer initialModule={route.module} onExit={goDash} />;

  if (route.screen === "qa")
    return (
      <KnowledgeQA ALL={ALL} MODULES={MODULES} C={C} TrustBadge={TrustBadge}
        onExit={goDash}
        onOpenModule={(id) => setRoute({ screen: "training", module: id })} />
    );

  if (route.screen === "assist")
    return <DriverOS onOpenTraining={() => setRoute({ screen: "training", module: null })}
                     onOpenQA={() => setRoute({ screen: "qa" })}
                     onExit={goDash} />;

  // KORZEŃ: Dashboard
  return (
    <Dashboard C={C} dueReviews={dueReviews}
      onOpenApp={openApp}
      onOpenAssist={() => setRoute({ screen: "assist" })} />
  );
}
