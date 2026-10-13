import React from 'react';
import type { PortfolioAllocation } from '../../../../utils/portfolioAllocation';

const euros = (n: number | null) => n === null ? 'Ungeklärt' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const percent = (n: number | null) => n === null ? 'Ungeklärt' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n) + ' %';

export default function AllocationReview({ plan }: { plan?: PortfolioAllocation }) {
  if (!plan) return null;
  return <section aria-label="Berechnete Zielgewichtung" className="min-w-0 space-y-3 rounded-lg border border-indigo-400/20 p-4 text-sm text-gray-300">
    <h5 className="m-0 font-bold text-indigo-300">Berechnete Zielgewichtung</h5>
    <p className="m-0 text-xs">{plan.method === 'forecast-mean-variance-v1'
      ? 'Mathematische 12-Monats-Optimierung aus veröffentlichten Kurszielen und historischen Risikodaten. Deine bestätigten Bandbreiten begrenzen die Berechnung. Das Ergebnis gilt unter den angezeigten Annahmen.'
      : 'Profilbasierte Modellziele mit Vorrang für deine bestätigten Zielgewichte. Beträge sind lokal berechnet; sie garantieren keine optimale zukünftige Rendite.'}</p>
    {plan.optimization && <div aria-label="Prognosebasierte Optimierung" className="min-w-0 space-y-2 rounded border border-sky-400/20 bg-sky-500/5 p-3 text-xs text-sky-200">
      <p className="m-0 font-bold">12-Monats-Optimierung: {plan.status === 'blocked' ? 'Datengrundlage oder Berechnung ungeklärt' : 'numerisch berechnet'}</p>
      <p className="m-0">Erwartete Portfolio-Preisrendite nach Modellgebühren: {percent(plan.optimization.expectedReturnPercent)} · Erwarteter Preisgewinn: {euros(plan.optimization.expectedGainEUR)} · Risikoproxy: {percent(plan.optimization.riskProxyPercent)}</p>
      <p className="m-0">Risikoproxy mit angenommenem gemeinsamen Gleichlauf (+1), keine gemessenen Korrelationen. Dividenden, Zinsen, Steuern und Spreads sind nicht enthalten.</p>
      <details><summary className="cursor-pointer">Verwendete Prognose- und Risikodaten</summary>
        <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
          {plan.optimization.forecasts.map(f => <div key={f.key} className="min-w-0 space-y-1 break-words rounded border border-sky-300/10 p-2">
            <p className="m-0 font-bold">{plan.positions.find(p => p.key === f.key)?.name ?? f.key}</p>
            <p className="m-0">{f.publisher} · veröffentlicht {f.publishedAt.slice(0, 10)} · Zieltermin {f.targetDate.slice(0, 10)}</p>
            <p className="m-0">Kursziel: {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(f.targetPrice)} {f.currency} · Erwartete Kursrendite: {percent(plan.optimization!.inputs.find(i => i.key === f.key)?.expectedReturnPercent ?? null)}</p>
            <p className="m-0">Annualisierte historische Volatilität: {percent(f.annualVolatilityPercent)} · Stand {f.volatilityAsOf.slice(0, 10)} · Fenster {f.volatilityLookbackDays} Tage</p>
            <p className="m-0">{f.assumptions}</p>
            {[['Kursprognose', f.forecastSources], ['Risikodaten', f.volatilitySources]].map(([label, sources]) => <p key={label as string} className="m-0 break-all">
              {label as string}: {(sources as typeof f.forecastSources).map((s, i) => <React.Fragment key={s.url}>{i > 0 && ', '}<a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.title}</a></React.Fragment>)}
            </p>)}
          </div>)}
          {!plan.optimization.forecasts.length && <p className="m-0">Keine vollständigen belegten Zahlen vorhanden. Es wird kein optimierter Betrag ausgegeben.</p>}
        </div>
      </details>
    </div>}
    {plan.targetAssetId !== undefined && <p className="m-0 text-xs text-sky-200">Einzelanalyse: Die übrigen Empfehlungsszenarien bleiben unverändert. Dies ist keine neue Gesamtanalyse.</p>}
    <p className="m-0 text-xs">Erfasster Bewertungsbetrag: {euros(plan.totalValueEUR)} · Ziel-Cash: {plan.status === 'blocked' ? 'Ungeklärt' : percent(plan.cashTargetPercent)} · Modellgebühren: {euros(plan.feesEUR)}</p>
    <p className="m-0 text-xs text-gray-400">„Danach“ zeigt die Umsetzung aller berechneten Modelltrades bei unveränderten Kursen, einschließlich Gebühren. Die KI kann einzelne Trades begründet zurückstellen. Cash danach: {euros(plan.projectedCashEUR)}.</p>
    <div className="grid min-w-0 grid-cols-1 xl:grid-cols-2 gap-3">
      {plan.positions.map(p => <article key={p.key} aria-label={`Zielgewicht ${p.name}`} className="min-w-0 space-y-2 rounded border border-white/10 p-3 text-xs">
        <p className="m-0 break-words font-bold text-white">{p.name}</p>
        <p className="m-0 text-sky-200">{p.source === 'user-confirmed' ? 'Innerhalb eigener bestätigter Zielvorgaben' : p.source === 'cash-holding' ? 'Bestehender Cash-Equivalent-Bestand' : p.source === 'forecast-optimization' ? plan.status === 'blocked' ? 'Optimierung ungeklärt' : 'Aus Kurserwartung und Risiko optimiert' : 'Aus Anlageprofil abgeleitet'}</p>
        <dl className="m-0 grid grid-cols-2 gap-2">
          <div className="min-w-0"><dt>Vorher</dt><dd className="m-0 break-words">{percent(p.currentWeightPercent)}</dd></div>
          <div className="min-w-0"><dt>Ziel</dt><dd className="m-0 break-words">{percent(p.targetWeight?.percent ?? null)}</dd></div>
          <div className="min-w-0"><dt>Bandbreite</dt><dd className="m-0 break-words">{p.targetWeight ? `${percent(p.targetWeight.minPercent)} – ${percent(p.targetWeight.maxPercent)}` : 'Ungeklärt'}</dd></div>
          <div className="min-w-0"><dt>Danach</dt><dd className="m-0 break-words">{percent(p.projectedWeightPercent)}</dd></div>
        </dl>
        <p className="m-0 font-bold text-white">Modellaktion: {p.action}{p.amountEUR !== null ? ` · ${euros(p.amountEUR)}` : ''}</p>
        <p className="m-0 break-words">{p.reason}</p>
      </article>)}
    </div>
    <details className="text-xs text-sky-200"><summary className="cursor-pointer">Berechnung und Modellannahmen</summary>
      <ul className="mt-2 list-disc space-y-2 pl-4">{plan.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </details>
    {!!plan.warnings.length && <div aria-label="Warnungen zur Zielgewichtung" className="rounded border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
      <p className="m-0 font-bold">Warnungen</p><ul className="mt-2 list-disc space-y-1 pl-4">{plan.warnings.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>}
  </section>;
}
