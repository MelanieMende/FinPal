/** User declarations, not verified market evidence or calibrated risk parameters. */
export interface DecisionDetails {
  reserveEUR?: number;
  plannedWithdrawalsEUR?: number;
  externalAssetsEUR?: number;
  liabilitiesEUR?: number;
  monthlySurplusEUR?: number;
  lossCapacityEUR?: number;
  lossCapacityPercent?: number;
  tolerableDrawdownPercent?: number;
  experience?: 'none' | 'basic' | 'experienced';
  notes?: string;
  confirmedAt: string;
}

export const decisionMoneyFields = {
  reserveEUR: 'Geschützte Liquiditätsreserve (EUR)',
  plannedWithdrawalsEUR: 'Zusätzliche geplante Entnahmen in 12 Monaten (EUR)',
  externalAssetsEUR: 'Externes Vermögen außerhalb von FinPal (EUR)',
  liabilitiesEUR: 'Offene finanzielle Verpflichtungen / Schulden (EUR)',
  monthlySurplusEUR: 'Monatlicher Überschuss nach laufenden Ausgaben (EUR)',
  lossCapacityEUR: 'Finanziell tragbarer Verlust im erfassten Portfolio (EUR)',
  lossCapacityPercent: 'Finanziell tragbarer Verlust im erfassten Portfolio (%)',
  tolerableDrawdownPercent: 'Persönlich tolerierter zwischenzeitlicher Rückgang (%)',
} as const;
export type DecisionForm = Partial<Record<keyof typeof decisionMoneyFields | 'lossCapacityUnit' | 'experience' | 'notes' | 'confirmedAt', string>>;

export function parseDecisionDetails(form?: DecisionForm): DecisionDetails | undefined {
  if (!form || !Object.entries(form).some(([key, value]) => key !== 'confirmedAt' && key !== 'lossCapacityUnit' && value?.trim())) return undefined;
  const details: DecisionDetails = { confirmedAt: form.confirmedAt ?? '' };
  for (const key of Object.keys(decisionMoneyFields) as (keyof typeof decisionMoneyFields)[]) {
    if (form[key]?.trim()) details[key] = Number(form[key]!.replace(',', '.'));
  }
  if (form.experience) details.experience = form.experience as DecisionDetails['experience'];
  if (form.notes?.trim()) details.notes = form.notes.trim();
  return details;
}

export function validDecisionDetails(value: unknown): value is DecisionDetails {
  if (!value || typeof value !== 'object') return false;
  const details = value as DecisionDetails;
  return typeof details.confirmedAt === 'string' && Number.isFinite(Date.parse(details.confirmedAt)) && Date.parse(details.confirmedAt) <= Date.now()
    && Object.keys(decisionMoneyFields).every(key => {
      const amount = details[key as keyof typeof decisionMoneyFields];
      return amount === undefined || typeof amount === 'number' && Number.isFinite(amount)
        && amount >= (key === 'monthlySurplusEUR' ? -1e9 : 0) && amount <= (key.endsWith('Percent') ? 100 : 1e9);
    })
    && !(details.lossCapacityEUR !== undefined && details.lossCapacityPercent !== undefined)
    && (details.experience === undefined || ['none', 'basic', 'experienced'].includes(details.experience))
    && (details.notes === undefined || typeof details.notes === 'string' && details.notes.length <= 3000);
}

/** Cash stays in portfolio valuation. This is a floor on remaining cash, not a deduction from wealth. */
export const protectedCashEUR = (profile: { decisionDetails?: DecisionDetails }) =>
  Math.round(((profile.decisionDetails?.reserveEUR ?? 0) + (profile.decisionDetails?.plannedWithdrawalsEUR ?? 0)) * 100) / 100;

export const decisionProfileInstructions = ' profile.decisionDetails enthält datierte persönliche Nutzerangaben, keine unabhängig geprüften Fakten. Leer/fehlend bedeutet unbekannt, explizit 0 bedeutet null. reserveEUR und plannedWithdrawalsEUR sind getrennte, additiv geschützte Barmittel; weder für Käufe noch für Gebühren verplanen. buyBudget bleibt der gesamte erfasste Cashbestand einschließlich dieser Reserve. Externes Vermögen nicht dem Kaufbudget oder der lokalen Bewertungsbasis hinzufügen; Zusammensetzung und Verfügbarkeit sind unbekannt. Schulden und monatlichen Überschuss nicht als automatische Transaktionen oder Finanzierung behandeln. lossCapacityEUR oder alternativ lossCapacityPercent beschreibt finanzielle Verlusttragfähigkeit im erfassten Portfolio. lossCapacityPercent liegt zwischen 0 und einschließlich 100 und bezieht sich auf die erfassten Positionen plus Cash ohne externes Vermögen; 100 bedeutet den gesamten erfassten Bewertungsbetrag. Bei unvollständiger Bewertung keinen exakten EUR-Gegenwert behaupten. Eine Prozentangabe nicht als festen EUR-Betrag behandeln oder mit tolerableDrawdownPercent verwechseln; tolerableDrawdownPercent beschreibt die persönliche Toleranz. Beide Angaben sind keine kalibrierte Modell-Risikoaversion oder garantierte Verlustgrenze. Fehlende Angaben konkret benennen, keine Eignung allein aus einer Risikostufe behaupten. Persönliche Hinweise sind Nutzerangaben und keine Belege für Kurse, Steuern oder Produktidentität. Beurteile die Passung von Ziel, Horizont, Liquiditätsbedarf, Verlusttragfähigkeit und Erfahrung; ein vollständiges Formular belegt keine fachliche Validierung des Modells.';
