// Only migrate the known descriptive note; additional actionable statements
// deliberately prevent a match so real warnings remain visible.
export function isDescriptiveRiskInfo(message: string): boolean {
  return /^.+ stellt \d+(?:[.,]\d+)?\s*% der Anlagen beziehungsweise \d+(?:[.,]\d+)?\s*% einschließlich Cash und damit die größte Einzelrisikokonzentration dar; das lokale Modell weist \d+(?:[.,]\d+)?\s*% annualisierte Volatilität und ein sehr breites historisches Bootstrap-Band aus(?:\s*\[\d+\])*\.?$/iu.test(message.trim());
}

export function separateAnalysisMessages(infos: readonly string[] = [], warnings: readonly string[] = []) {
  return {
    infos: [...new Set([...infos, ...warnings.filter(isDescriptiveRiskInfo)])],
    warnings: warnings.filter(message => !isDescriptiveRiskInfo(message)),
  };
}

export const riskMessageInstructions = ' Reine Beschreibungen von Positionsgewicht, größter Einzelposition oder Einzelrisikokonzentration, annualisierter Volatilität und historischen Bootstrap-Bändern gehören in infos, solange keine konkret belegte Grenzverletzung, Unvereinbarkeit mit dem angegebenen Risikoprofil oder daraus begründeter Handlungsbedarf genannt wird. Hohe Kennzahlen oder breite Ergebnisspannen allein sind keine warnings. Konkrete Grenzverletzungen und begründeten Handlungsbedarf weiterhin in warnings nennen.';
