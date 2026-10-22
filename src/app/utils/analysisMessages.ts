// Only migrate known descriptive notes; additional actionable statements
// deliberately prevent a match so real warnings remain visible.
export function isDescriptiveRiskInfo(message: string): boolean {
  const text = message.trim();
  return /^.+ stellt \d+(?:[.,]\d+)?\s*% der Anlagen beziehungsweise \d+(?:[.,]\d+)?\s*% einschließlich Cash und damit die größte Einzelrisikokonzentration dar; das lokale Modell weist \d+(?:[.,]\d+)?\s*% annualisierte Volatilität und ein sehr breites historisches Bootstrap-Band aus(?:\s*\[\d+\])*\.?$/iu.test(text)
    || /^Die exakte wirtschaftliche Währungsrisiko-Allokation des Portfolios ist nicht quantifizierbar\. Handels-, Fonds- und Berichtswährungen sind keine exakten Nettoexpositionen; für die Anleihe ist jedoch ein direktes [A-Z]{3}-Nominalrisiko bestätigt(?:\s*\[\d+\])*\.?$/iu.test(text)
    || /^Spreads und tatsächliche Ausführungskurse müssen unmittelbar vor jeder Order geprüft werden\. Die gespeicherte 1(?:[,.]00)?[ -]EUR-Pauschale ist kein aktuelles Geld-\/Brief-Angebot(?:\s*\[\d+\])*\.?$/iu.test(text)
    || /^QDVE ist ein konzentrierter US-Technologie-Sektor-ETF und kein breiter S&P-500-Fonds; Halbleiter, Hardware und Software dominieren, bei hohem Bewertungsniveau(?:\s*\[\d+\])*\.?$/iu.test(text);
}

export function separateAnalysisMessages(infos: readonly string[] = [], warnings: readonly string[] = []) {
  return {
    infos: [...new Set([...infos, ...warnings.filter(isDescriptiveRiskInfo)])],
    warnings: warnings.filter(message => !isDescriptiveRiskInfo(message)),
  };
}

export const riskMessageInstructions = ' Reine Beschreibungen von Positionsgewicht, größter Einzelposition oder Einzelrisikokonzentration, annualisierter Volatilität und historischen Bootstrap-Bändern gehören in infos, solange keine konkret belegte Grenzverletzung, Unvereinbarkeit mit dem angegebenen Risikoprofil oder daraus begründeter Handlungsbedarf genannt wird. Hohe Kennzahlen oder breite Ergebnisspannen allein sind keine warnings. Konkrete Grenzverletzungen und begründeten Handlungsbedarf weiterhin in warnings nennen.'
  + ' Die fehlende Quantifizierbarkeit der exakten wirtschaftlichen Währungsrisiko-Allokation und die Abgrenzung von Handels-, Fonds- und Berichtswährungen gegenüber Nettoexpositionen gehören in infos. Ein dabei bestätigtes direktes USD-Nominalrisiko einer Anleihe ist ebenfalls eine beschreibende Info, solange keine konkret belegte Grenzverletzung oder daraus begründeter Handlungsbedarf vorliegt. Fehlende entscheidungsrelevante FX-Kurse und konkret begründete Währungsrisiko-Warnungen bleiben warnings.'
  + ' Allgemeine Erinnerungen, Spreads und tatsächliche Ausführungskurse unmittelbar vor jeder Order zu prüfen, gehören in infos. Auch die Erläuterung, dass eine gespeicherte 1-EUR-Gebührenpauschale kein aktuelles Geld-/Brief-Angebot ist, gehört in infos. Fehlende notwendige Ausführungsdaten für eine konkrete Order und tatsächlich festgestellte auffällige Spreads bleiben warnings.'
  + ' Beschreibungen der Produktausrichtung, Branchenkonzentration und Bewertung eines Sektor-ETF gehören in infos. Beispielsweise ist die Einordnung von QDVE als konzentrierter US-Technologie-Sektor-ETF mit Schwerpunkt Halbleiter, Hardware und Software statt als breiter S&P-500-Fonds ein beschreibender Hinweis. Eine konkret festgestellte falsche Einplanung als breiter Portfolio-Baustein, eine überschrittene Sektorgrenze oder daraus begründeter Handlungsbedarf bleiben warnings.';
