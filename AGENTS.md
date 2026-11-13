# Ziel der Anwendung FinPal

Ziel ist es, FinPal zu einem umfassenden Tool zur Analyse der eigenen Finanzen auszubauen.
Es soll sich wie ein erfahrener Finanz- und Steuerberater verhalten, der dabei hilft, die eigenen Finanzen zu optimieren, und Analgetipps gibt, um das Vermögen der Familie zu erhalten und möglichst zu vergrößern. Dabei ist es das Ziel, so früh wie möglich nicht mehr auf das Geld aus angestellter Arbeit angewiesen zu sein.

# UI-Qualität

- Eingabefelder, Auswahlfelder und Buttons dürfen sich nicht überlappen oder über ihre Container hinausragen. Formulare an der verfügbaren Containerbreite ausrichten, auch neben der Navigation; lange Beschriftungen und Werte berücksichtigen.
- Formularänderungen im echten Renderer bei schmalen und breiten Fenstern sowie 125 Prozent Zoom prüfen. Jest/JSDOM prüft keine tatsächlichen Layoutabmessungen.
- Bei Änderungen an den Analyseformularen `npm run check:layout` ausführen. Die Prüfung verwendet echte Komponenten und Produktions-CSS mit isolierten Testdaten und prüft Feldgrenzen und Überlappungen.
- Screenshots in `.vite/layout-check/analysis-900.png` und `.vite/layout-check/asset-fields-900.png` visuell prüfen. Bei neuen Formularbereichen die Layoutprüfung passend erweitern.
- Achte darauf, dass eine einheitliche Farbpalette verwendet wird. Bei positiven Hervorherbungen bspw. für Text var(--color-emerald-300);
- Verwende für Text standardmäßig Deutsch, außer bei englischen Begriffen, die im Deutschen geläufig sind.

# Dokumentation des Analyseablaufs

- `README.md` bindet `docs/analysis-flow.svg` als verbindliche Übersicht des FinPal-Analyseablaufs ein.
- Bei Änderungen an Analysephasen, Recherche, Primärrisikoprüfung, `materialRisks`, `decisionReadiness`, Blockierungslogik, Portfoliomodell, Finanzierung, Teilplänen oder Ergebnisvalidierung muss das Flussdiagramm im selben Änderungssatz fachlich aktualisiert werden.
- Belegte Risiken im Diagramm als Entscheidungsfaktoren darstellen. Nur ein separat benannter konkreter Daten-, Strategie-, Finanzierungs- oder Ausführungsgrund ist ein Blocker.
