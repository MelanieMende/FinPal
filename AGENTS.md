# UI-Qualität

- Eingabefelder, Auswahlfelder und Buttons dürfen sich nicht überlappen oder über ihre Container hinausragen. Formulare an der verfügbaren Containerbreite ausrichten, auch neben der Navigation; lange Beschriftungen und Werte berücksichtigen.
- Formularänderungen im echten Renderer bei schmalen und breiten Fenstern sowie 125 Prozent Zoom prüfen. Jest/JSDOM prüft keine tatsächlichen Layoutabmessungen.
- Bei Änderungen an den Analyseformularen `npm run check:layout` ausführen. Die Prüfung verwendet echte Komponenten und Produktions-CSS mit isolierten Testdaten und prüft Feldgrenzen und Überlappungen.
- Screenshots in `.vite/layout-check/analysis-900.png` und `.vite/layout-check/asset-fields-900.png` visuell prüfen. Bei neuen Formularbereichen die Layoutprüfung passend erweitern.
