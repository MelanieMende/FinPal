import type { TradeDecision } from '../../app/utils/tradeDecision';

export const tradeDecisionFixture: TradeDecision = {
  holdCase: 'Halten erhält das langfristige Aufwärtspotenzial [0].',
  reduceNowCase: 'Reduzieren begrenzt das Konzentrationsrisiko [0].',
  timingAssessment: 'Kein belegter Timingvorteil am gespeicherten Kurs; die Reduktion dient dem Risikoausgleich.',
  profileFit: 'Bei hohem Risiko und zehn Jahren Anlagedauer spricht der lange Horizont auch für Halten.',
  amountRationale: '100 EUR reduzieren die Position teilweise; die verbleibenden Anteile partizipieren weiter.',
  uncertainties: 'Fehlende belastbare Kursziele; bei geringerer Konzentration wäre Halten neu abzuwägen.',
  scenarios: [
    { kind: 'bear', basis: 'conditional-scenario', horizon: '12 Monate', asOf: null,
      assumptions: 'Schwächere Nachfrage [0].', implication: 'Reduzieren begrenzt mögliche Verluste.', sourceIndexes: [0] },
    { kind: 'base', basis: 'conditional-scenario', horizon: '12 Monate', asOf: null,
      assumptions: 'Unveränderte Nachfrage [0].', implication: 'Halten vermeidet zusätzliche Gebühren.', sourceIndexes: [0] },
    { kind: 'bull', basis: 'published-forecast', horizon: '12 Monate', asOf: '2026-10-09',
      assumptions: 'Veröffentlichter positiver Ausblick [0].', implication: 'Halten erhält mehr Aufwärtspotenzial [0].', sourceIndexes: [0] },
  ],
};
