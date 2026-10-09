import type { PortfolioAnalysisRequest } from './portfolioAnalysis';

export interface TradeDecision {
  holdCase: string;
  reduceNowCase: string;
  timingAssessment: string;
  profileFit: string;
  amountRationale: string;
  uncertainties: string;
  scenarios: {
    kind: 'bear' | 'base' | 'bull';
    basis: 'published-forecast' | 'conditional-scenario';
    horizon: string;
    asOf: string | null;
    assumptions: string;
    implication: string;
    sourceIndexes: number[];
  }[];
}

export const tradeDecisionResearchInstructions = ' Recherchiere je Asset zusätzlich aktuelle bewertungs- und kursrelevante Faktoren sowie belegte veröffentlichte Kursausblicke, sofern verfügbar. Bei Krypto insbesondere Nachfrage, Liquidität, Adoption, regulatorische Entwicklungen und relevante Marktrisiken; keine Aktienkennzahlen erzwingen. Bei veröffentlichten Prognosen nenne Urheber, Veröffentlichungsdatum, Zeithorizont, Originalwährung, Annahmen und Direktquelle; widersprechende Ausblicke ebenfalls berücksichtigen. Keine Kursziele, Wahrscheinlichkeiten oder Analystenkonsense erfinden. Wenn belastbare Prognosen fehlen, dies ausdrücklich sagen und belegte Faktoren für qualitative bedingte Abwärts-, Basis- und Aufwärtsszenarien liefern. Ein Bericht über die rechtliche Einordnung allein belegt weder die Bewertung noch den Verkaufszeitpunkt. Private Bestände, Beträge und Anlageprofile niemals als Suchbegriffe verwenden.';

export const tradeDecisionAnalysisInstructions = ' Ergänze für jede Verkaufsempfehlung zwingend tradeDecision; bei anderen Aktionen darf es null sein. Vergleiche explizit Halten mit jetzt teilweise Reduzieren: holdCase nennt das Potenzial und die Gründe für weiteres Halten, reduceNowCase die Gründe für eine sofortige Reduktion. timingAssessment beurteilt den aktuellen gespeicherten Kurs samt quoteAsOf, die belegten Marktfaktoren und die Kosten des vorgeschlagenen Teilbetrags; trenne Risikoreduktion von einer belegten Überbewertung oder Kursrückgangsthese. Fehlt ein belegter Timingvorteil, sage das ausdrücklich; Konzentration allein ist kein Beleg, dass der Kurs fallen wird. profileFit erklärt die Abwägung für das konkrete Ziel, Risiko und die Anlagedauer, insbesondere warum bei hohem Risiko und langem Horizont trotzdem reduziert werden soll. amountRationale erklärt den beispielhaften EUR-Betrag, seinen Anteil an der Position und die Gewichtung vor/nach dem Verkauf bei vorerst gehaltenem Cash, einschließlich verbleibendem Aufwärtspotenzial; keine optimale Zielquote oder optimalen Betrag behaupten. decisionContext liefert lokal berechnete Positionswerte und Gewichte: shareOfHoldingsPercent ohne Cash, shareIncludingCashPercent einschließlich Cash. Die Bezugsgröße ausdrücklich nennen; incompleteValuation bedeutet eine Teilsumme, keine vollständige Vermögensquote. tradeDecision.scenarios enthält genau bear, base und bull: jeweils expliziter Zeithorizont, Annahmen, Konsequenz für Halten gegenüber Reduzieren und sourceIndexes der belegten Grundlagen. Kennzeichne tatsächlich veröffentlichte Prognosen als published-forecast mit asOf als Veröffentlichungsdatum; eigene qualitative bedingte Szenarien als conditional-scenario und asOf null. Numerische Kursziele nur aus belegten veröffentlichten Prognosen mit Urheber, Originalwährung und Datum in assumptions; keine erfundenen Renditen oder Wahrscheinlichkeiten. Kurzfristige Szenarien sind keine Zehnjahresprognose. uncertainties benennt widersprüchliche Ausblicke, fehlende Daten und konkrete Umstände, unter denen Halten vorzuziehen wäre beziehungsweise die Empfehlung neu bewertet werden müsste. Alle Felder kompakt, je ein bis zwei Sätze. Die Entscheidung muss zu rationale, action und plannedAmountEUR passen. Fehlende Kursprognosen allein erzwingen kein Prüfen, wenn eine Risikoreduktion anders ausreichend belegt ist; fehlende Belege nicht durch Prognosen ersetzen.';

export function tradeDecisionSchema(sourceCount: number) {
  return { type: ['object', 'null'], additionalProperties: false, properties: {
    holdCase: { type: 'string' }, reduceNowCase: { type: 'string' }, timingAssessment: { type: 'string' },
    profileFit: { type: 'string' }, amountRationale: { type: 'string' }, uncertainties: { type: 'string' },
    scenarios: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['bear', 'base', 'bull'] },
        basis: { type: 'string', enum: ['published-forecast', 'conditional-scenario'] },
        horizon: { type: 'string' }, asOf: { type: ['string', 'null'] }, assumptions: { type: 'string' }, implication: { type: 'string' },
        sourceIndexes: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 0, maximum: sourceCount - 1 } },
      }, required: ['kind', 'basis', 'horizon', 'asOf', 'assumptions', 'implication', 'sourceIndexes'],
    } },
  }, required: ['holdCase', 'reduceNowCase', 'timingAssessment', 'profileFit', 'amountRationale', 'uncertainties', 'scenarios'] };
}

export function validTradeDecision(value: TradeDecision, sourceCount: number): boolean {
  const text = (s: unknown) => typeof s === 'string' && s.trim().length > 0 && s.length <= 10000;
  return !!value && [value.holdCase, value.reduceNowCase, value.timingAssessment, value.profileFit, value.amountRationale, value.uncertainties].every(text)
    && Array.isArray(value.scenarios) && value.scenarios.length === 3
    && new Set(value.scenarios.map(s => s?.kind)).size === 3
    && value.scenarios.every(s => s && ['bear', 'base', 'bull'].includes(s.kind)
      && ['published-forecast', 'conditional-scenario'].includes(s.basis)
      && [s.horizon, s.assumptions, s.implication].every(text)
      && (s.asOf === null || (typeof s.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.asOf) && Number.isFinite(Date.parse(s.asOf))
        && new Date(s.asOf).toISOString().slice(0, 10) === s.asOf))
      && (s.basis !== 'published-forecast' || s.asOf !== null)
      && (s.basis !== 'conditional-scenario' || s.asOf === null)
      && Array.isArray(s.sourceIndexes) && s.sourceIndexes.length > 0
      && s.sourceIndexes.every(i => Number.isInteger(i) && i >= 0 && i < sourceCount));
}

export function buildTradeDecisionContext(request: PortfolioAnalysisRequest) {
  const positions = request.positions.map(p => ({ assetId: p.id,
    valueEUR: p.currency === 'EUR' && p.price !== null ? p.price * p.shares : null,
  }));
  const heldValueEUR = positions.reduce((sum, p) => sum + (p.valueEUR ?? 0), 0);
  const totalValueEUR = heldValueEUR + request.profile.buyBudget;
  return { cashEUR: request.profile.buyBudget, heldValueEUR, totalValueEUR,
    incompleteValuation: positions.some(p => p.valueEUR === null),
    positions: positions.map(p => ({ ...p,
      shareOfHoldingsPercent: p.valueEUR !== null && heldValueEUR > 0 ? 100 * p.valueEUR / heldValueEUR : null,
      shareIncludingCashPercent: p.valueEUR !== null && totalValueEUR > 0 ? 100 * p.valueEUR / totalValueEUR : null,
    })),
  };
}
