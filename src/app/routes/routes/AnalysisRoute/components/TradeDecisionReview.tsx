import type { TradeDecision } from '../../../../utils/tradeDecision';

const labels = { bear: 'Abwärtsszenario', base: 'Basisszenario', bull: 'Aufwärtsszenario' };

export default function TradeDecisionReview({ decision }: { decision: TradeDecision }) {
  return <section aria-label="Halten oder jetzt reduzieren" className="mt-3 rounded-lg border border-indigo-400/20 bg-indigo-500/5 p-3 text-xs text-gray-300 space-y-3">
    <h6 className="m-0 font-bold text-indigo-200">Halten oder jetzt reduzieren?</h6>
    <dl className="m-0 space-y-2">
      {([
        ['Für Halten', decision.holdCase], ['Für jetzt Reduzieren', decision.reduceNowCase],
        ['Kurs und Verkaufszeitpunkt', decision.timingAssessment], ['Passung zum Anlageprofil', decision.profileFit],
        ['Warum dieser Betrag?', decision.amountRationale],
      ] as const).map(([label, text]) => <div key={label}>
        <dt className="font-bold text-white">{label}</dt><dd className="m-0 whitespace-pre-wrap">{text}</dd>
      </div>)}
    </dl>
    <div className="space-y-2">
      {(['bear', 'base', 'bull'] as const).map(kind => {
        const scenario = decision.scenarios.find(s => s.kind === kind)!;
        return <div key={kind} className="rounded border border-white/10 p-2">
          <h6 className="m-0 font-bold text-white">{labels[kind]} · {scenario.horizon}</h6>
          <p className="my-1 text-gray-400">{scenario.basis === 'published-forecast'
            ? `Veröffentlichte Prognose · Stand: ${scenario.asOf}` : 'Bedingtes Szenario, keine veröffentlichte Kursprognose'}</p>
          <p className="my-1 whitespace-pre-wrap">{scenario.assumptions}</p>
          <p className="my-1 whitespace-pre-wrap">{scenario.implication}</p>
          <p className="m-0 text-indigo-300">Quellen: {scenario.sourceIndexes.map(index => `[${index}]`).join(', ')}</p>
        </div>;
      })}
    </div>
    <div><h6 className="m-0 font-bold text-amber-200">Unsicherheiten und Gründe für eine Neubewertung</h6>
      <p className="my-1 whitespace-pre-wrap">{decision.uncertainties}</p>
    </div>
  </section>;
}
