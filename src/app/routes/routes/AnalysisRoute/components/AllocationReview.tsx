import React from 'react';
import type { PortfolioAllocation } from '../../../../utils/portfolioAllocation';

const euros = (n: number | null) => n === null ? 'Ungeklärt' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const percent = (n: number | null) => n === null ? 'Ungeklärt' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n) + ' %';

type AssetOptimizationDetailsProps = {
  plan?: PortfolioAllocation;
  allocationKey: string;
  onOpenSource?: (event: React.MouseEvent<HTMLAnchorElement>, url: string) => void;
};

export function AssetOptimizationDetails({ plan, allocationKey, onOpenSource }: AssetOptimizationDetailsProps) {
  const position = plan?.positions.find(p => p.key === allocationKey);
  if (!position) return null;
  const forecast = plan?.optimization?.forecasts.find(f => f.key === allocationKey);
  const input = plan?.optimization?.inputs.find(i => i.key === allocationKey);
  const sourceLabel = position.source === 'user-confirmed' ? 'Innerhalb eigener bestätigter Zielvorgaben'
    : position.source === 'cash-holding' ? 'Bestehender Cash-Equivalent-Bestand'
      : position.source === 'forecast-optimization' ? plan?.status === 'blocked' ? 'Optimierung ungeklärt'
        : position.action === 'Prüfen' ? 'Unverändert: Prognosedaten fehlen' : 'Aus Kurserwartung und Risiko optimiert'
        : 'Aus Anlageprofil abgeleitet';

  return <section aria-label={`Prognose und Zielgewichtung ${position.name}`} className="my-3 min-w-0 space-y-2 rounded border border-sky-400/20 bg-sky-500/5 p-3 text-xs text-gray-300">
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
      <p className="m-0 font-bold text-sky-200">{forecast ? 'Prognose und Zielgewichtung' : 'Zielgewichtung'}</p>
      <p className="m-0 text-sky-200">{sourceLabel}</p>
    </div>
    {forecast && <div className="min-w-0 space-y-1 break-words">
      <p className="m-0">{forecast.publisher} · Datenstand {forecast.publishedAt.slice(0, 10)} · Zieltermin {forecast.targetDate.slice(0, 10)}</p>
      {forecast.dataStatus && <p className={`m-0 ${forecast.dataStatus === 'stale-fallback' ? 'text-amber-300' : 'text-gray-400'}`}>
        {forecast.dataStatus === 'live' ? 'Datenquelle: aktuell abgerufen' : forecast.dataStatus === 'fresh-cache'
          ? `Datenquelle: gültiger lokaler Cache · ${forecast.dataAgeHours?.toFixed(1) ?? '0,0'} Stunden alt`
          : `Datenquelle: letzter gültiger Cache nach Abruffehler · ${forecast.dataAgeHours?.toFixed(1) ?? '0,0'} Stunden alt`}
      </p>}
      <p className="m-0">Kursziel: {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(forecast.targetPrice)} {forecast.currency} · Erwartete Kursrendite: {percent(input?.expectedReturnPercent ?? null)}</p>
      <p className="m-0">Annualisierte historische Volatilität: {percent(forecast.annualVolatilityPercent)} · Stand {forecast.volatilityAsOf.slice(0, 10)} · Fenster {forecast.volatilityLookbackDays} Tage</p>
      <details><summary className="cursor-pointer text-gray-400">Quellen und Prognoseannahmen</summary>
        <div className="mt-2 min-w-0 space-y-1 break-words">
          <p className="m-0">{forecast.assumptions}</p>
          {[['Kursprognose', forecast.forecastSources], ['Risikodaten', forecast.volatilitySources]].map(([label, sources]) => <p key={label as string} className="m-0 break-all">
            {label as string}: {(sources as typeof forecast.forecastSources).map((source, index) => <React.Fragment key={`${source.url}-${index}`}>{index > 0 && ', '}<a href={source.url} onClick={event => onOpenSource?.(event, source.url)} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a></React.Fragment>)}
          </p>)}
        </div>
      </details>
    </div>}
    {!forecast && plan?.method === 'forecast-mean-variance-v1' && <p className="m-0 text-amber-200">Keine vollständige belegte 12-Monats-Prognose und Volatilität vorhanden.</p>}
    <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="min-w-0"><dt>Vorher</dt><dd className="m-0 break-words">{percent(position.currentWeightPercent)}</dd></div>
      <div className="min-w-0"><dt>Ziel</dt><dd className="m-0 break-words">{percent(position.targetWeight?.percent ?? null)}</dd></div>
      <div className="min-w-0"><dt>Bandbreite</dt><dd className="m-0 break-words">{position.targetWeight ? `${percent(position.targetWeight.minPercent)} – ${percent(position.targetWeight.maxPercent)}` : 'Ungeklärt'}</dd></div>
      <div className="min-w-0"><dt>Danach</dt><dd className="m-0 break-words">{percent(position.projectedWeightPercent)}</dd></div>
    </dl>
    <p className="m-0 font-bold text-white">Modellaktion: {position.action}{position.amountEUR !== null ? ` · ${euros(position.amountEUR)}` : ''}</p>
    <p className="m-0 break-words">{position.reason}</p>
  </section>;
}

export default function AllocationReview({ plan }: { plan?: PortfolioAllocation }) {
  if (!plan) return null;
  const partial = plan.status === 'calculated' && !!plan.optimization?.unresolvedKeys?.length;
  const unresolvedCount = plan.optimization?.unresolvedKeys?.length ?? 0;
  return <section aria-label="Berechnete Zielgewichtung" className="min-w-0 space-y-3 rounded-lg border border-indigo-400/20 p-4 text-sm text-gray-300">
    <h5 className="m-0 font-bold text-indigo-300">Berechnete Zielgewichtung</h5>
    <p className="m-0 text-xs">{plan.method === 'forecast-mean-variance-v1'
      ? 'Mathematische 12-Monats-Optimierung aus veröffentlichten Kurszielen und historischen Risikodaten. Deine bestätigten Bandbreiten begrenzen die Berechnung. Das Ergebnis gilt unter den angezeigten Annahmen.'
      : 'Profilbasierte Modellziele mit Vorrang für deine bestätigten Zielgewichte. Beträge sind lokal berechnet; sie garantieren keine optimale zukünftige Rendite.'}</p>
    {plan.optimization && <div aria-label="Prognosebasierte Optimierung" className="min-w-0 space-y-2 rounded border border-sky-400/20 bg-sky-500/5 p-3 text-xs text-sky-200">
      <p className="m-0 font-bold">{partial ? 'Strenge Teilportfolio-Optimierung' : '12-Monats-Optimierung'}: {plan.status === 'blocked' ? 'Datengrundlage oder Berechnung ungeklärt' : 'numerisch berechnet'}</p>
      <p className="m-0">{partial ? 'Erwarteter Renditebeitrag des modellierten Teils zum Gesamtportfolio' : 'Erwartete Portfolio-Preisrendite'} nach Modellgebühren: {percent(plan.optimization.expectedReturnPercent)} · Erwarteter Preisgewinn: {euros(plan.optimization.expectedGainEUR)} · Risikoproxy: {percent(plan.optimization.riskProxyPercent)}</p>
      {partial && <p className="m-0 font-bold text-amber-200">Modellabdeckung: {percent(plan.optimization.modeledValuePercent ?? null)} · {unresolvedCount} {unresolvedCount === 1 ? 'Position' : 'Positionen'} ohne vollständige Daten unverändert eingefroren.</p>}
      <p className="m-0">Risikoproxy mit angenommenem gemeinsamen Gleichlauf (+1), keine gemessenen Korrelationen. Dividenden, Zinsen, Steuern und Spreads sind nicht enthalten.</p>
      {!plan.optimization.forecasts.length && <p className="m-0">Keine vollständigen belegten Zahlen vorhanden. Es wird kein optimierter Betrag ausgegeben.</p>}
    </div>}
    {plan.targetAssetId !== undefined && <p className="m-0 text-xs text-sky-200">Einzelanalyse: Die übrigen Empfehlungsszenarien bleiben unverändert. Dies ist keine neue Gesamtanalyse.</p>}
    <p className="m-0 text-xs">Erfasster Bewertungsbetrag: {euros(plan.totalValueEUR)} · Ziel-Cash: {plan.status === 'blocked' ? 'Ungeklärt' : percent(plan.cashTargetPercent)} · Modellgebühren: {euros(plan.feesEUR)}</p>
    <p className="m-0 text-xs text-gray-400">„Danach“ zeigt die Umsetzung aller berechneten Modelltrades bei unveränderten Kursen, einschließlich Gebühren. Die KI kann einzelne Trades begründet zurückstellen. Cash danach: {euros(plan.projectedCashEUR)}.</p>
    <details className="text-xs text-sky-200"><summary className="cursor-pointer">Berechnung und Modellannahmen</summary>
      <ul className="mt-2 list-disc space-y-2 pl-4">{plan.assumptions.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </details>
    {!!plan.warnings.length && <div aria-label="Warnungen zur Zielgewichtung" className="rounded border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-200">
      <p className="m-0 font-bold">Warnungen</p><ul className="mt-2 list-disc space-y-1 pl-4">{plan.warnings.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>}
  </section>;
}
