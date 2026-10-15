import React from 'react';
import type { PortfolioAllocation } from '../../../../utils/portfolioAllocation';

const euros = (n: number | null) => n === null ? 'Ungeklärt' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
const percent = (n: number | null) => n === null ? 'Ungeklärt' : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(n) + ' %';

type AssetOptimizationDetailsProps = {
  plan?: PortfolioAllocation;
  allocationKey: string;
  assetType?: Asset['type'];
  onOpenSource?: (event: React.MouseEvent<HTMLAnchorElement>, url: string) => void;
};

export function AssetOptimizationDetails({ plan, allocationKey, assetType, onOpenSource }: AssetOptimizationDetailsProps) {
  const position = plan?.positions.find(p => p.key === allocationKey);
  if (!position) return null;
  const forecast = plan?.optimization?.forecasts.find(f => f.key === allocationKey);
  const input = plan?.optimization?.inputs.find(i => i.key === allocationKey);
  const reviewedUnavailable = plan?.optimization?.reviewedUnavailableKeys?.includes(allocationKey);
  const robust = plan?.optimization?.robust;
  const estimate = robust?.estimates.find(e => e.key === allocationKey);
  const scenarioTrade = robust?.scenarioTrades.find(t => t.key === allocationKey);
  const sourceLabel = reviewedUnavailable ? 'Geprüft: Prognosedaten nicht verfügbar'
    : robust?.decisionStatus === 'review-required' && scenarioTrade ? 'Modellszenario: Entscheidung offen'
    : position.source === 'user-confirmed' ? 'Innerhalb eigener bestätigter Zielvorgaben'
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
      <p className="m-0">{forecast.model?.kind === 'etf-history-v1' ? 'Modell-Referenzwert (kein veröffentlichtes Kursziel)' : 'Kursziel'}: {new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(forecast.targetPrice)} {forecast.currency} · {robust ? 'Bereinigte Modellrendite' : 'Erwartete Kursrendite'}: {percent(input?.expectedReturnPercent ?? null)}</p>
      {forecast.model?.kind === 'etf-history-v1' && <p className="m-0 text-sky-200">Lokales ETF-Historienmodell: {forecast.model.observations} bereinigte Tageskurse über {forecast.model.historyYears.toFixed(2)} Jahre · 2.000 Bootstrap-Pfade · 252 Handelstage · 20-Tage-Blöcke. Historische Szenarien, keine kalibrierten Zukunftswahrscheinlichkeiten. Ausschüttungen nicht zusätzlich addieren.</p>}
      {estimate && <p className="m-0">Rohsignal: {percent(estimate.rawReturnPercent)} · Nach Unsicherheitsgewichtung: {percent(estimate.adjustedReturnPercent)} · Unsicherheitsproxy: {percent(estimate.uncertaintyPercent)} (keine Wahrscheinlichkeit).</p>}
      {forecast.uncertainty?.method === 'analyst-consensus' && <p className="m-0">Analystenabdeckung: {forecast.uncertainty.analystCount ?? 'Unbekannt'} · Kurszielspanne: {forecast.uncertainty.targetLowPrice ?? 'Unbekannt'} bis {forecast.uncertainty.targetHighPrice ?? 'Unbekannt'} {forecast.currency}. Wenige Analysten oder breite Spannen schwächen das Signal.</p>}
      {forecast.scenarioReturns && <p className="m-0">Historisches Bootstrap-Szenarioband: P10 {percent(forecast.scenarioReturns.p10)} · Median {percent(forecast.scenarioReturns.median)} · P90 {percent(forecast.scenarioReturns.p90)}</p>}
      <p className="m-0">Annualisierte historische Volatilität: {percent(forecast.annualVolatilityPercent)} · Kurswährung {forecast.currency} · Stand {forecast.volatilityAsOf.slice(0, 10)} · Fenster {forecast.volatilityLookbackDays} Tage</p>
      <details><summary className="cursor-pointer text-gray-400">Quellen und Prognoseannahmen</summary>
        <div className="mt-2 min-w-0 space-y-1 break-words">
          <p className="m-0">{forecast.assumptions}</p>
          {[['Kursprognose', forecast.forecastSources], ['Risikodaten', forecast.volatilitySources]].map(([label, sources]) => <p key={label as string} className="m-0 break-all">
            {label as string}: {(sources as typeof forecast.forecastSources).map((source, index) => <React.Fragment key={`${source.url}-${index}`}>{index > 0 && ', '}<a href={source.url} onClick={event => onOpenSource?.(event, source.url)} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a></React.Fragment>)}
          </p>)}
          {forecast.riskHistory && <p className="m-0 break-all">EUR-Historie und FX: {forecast.riskHistory.sources.map((source, index) => <React.Fragment key={`${source.url}-${index}`}>{index > 0 && ', '}<a href={source.url} onClick={event => onOpenSource?.(event, source.url)} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a></React.Fragment>)}</p>}
        </div>
      </details>
    </div>}
    {!forecast && plan?.method === 'forecast-mean-variance-v1' && <p className={`m-0 ${reviewedUnavailable ? 'text-sky-200' : 'text-amber-200'}`}>{reviewedUnavailable
      ? 'Hinweis: Die gezielte Nachrecherche ist abgeschlossen. Vollständige belegte 12-Monats-Prognose- und Volatilitätsdaten sind nicht verfügbar. Die weitere Analyse läuft ohne diese Eingaben weiter; für diese Position wird kein optimierter Handelsbetrag berechnet.'
      : assetType === 'Crypto'
      ? 'Für das lokale Krypto-Modell fehlen mindestens drei Jahre vollständige tägliche Kurse oder eine passende Kurswährung. Ohne belastbare Modellrendite und Volatilität bleibt die Position eingefroren.'
      : assetType === 'ETF'
      ? 'ETF-Historienmodell nicht vollständig verfügbar: Bestätigte Historienkennung, mindestens fünf Jahre bereinigte Handelstagskurse mit passender Währung und EUR-Risikodaten erforderlich. Keine Ersatzprognose geschätzt.'
      : 'Keine vollständige belegte 12-Monats-Prognose und Volatilität vorhanden.'}</p>}
    <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="min-w-0"><dt>Vorher</dt><dd className="m-0 break-words">{percent(position.currentWeightPercent)}</dd></div>
      <div className="min-w-0"><dt>{robust?.decisionStatus === 'review-required' ? 'Szenarioziel' : 'Ziel'}</dt><dd className="m-0 break-words">{percent(position.targetWeight?.percent ?? null)}</dd></div>
      <div className="min-w-0"><dt>Bandbreite</dt><dd className="m-0 break-words">{position.targetWeight ? `${percent(position.targetWeight.minPercent)} – ${percent(position.targetWeight.maxPercent)}` : 'Ungeklärt'}</dd></div>
      <div className="min-w-0"><dt>Danach</dt><dd className="m-0 break-words">{percent(position.projectedWeightPercent)}</dd></div>
    </dl>
    <p className="m-0 font-bold text-white">Modellaktion: {position.action}{position.amountEUR !== null ? ` · ${euros(position.amountEUR)}` : ''}</p>
    {robust?.decisionStatus === 'review-required' && scenarioTrade && <p className="m-0 text-amber-200">Entscheidung offen · Reines Modellszenario: {scenarioTrade.action} {euros(scenarioTrade.amountEUR)}. Dieser Betrag ist keine Handlungsempfehlung und nicht zur Finanzierung freigegeben.</p>}
    <p className="m-0 break-words">{position.reason}</p>
  </section>;
}

export default function AllocationReview({ plan }: { plan?: PortfolioAllocation }) {
  if (!plan) return null;
  const reviewedWithoutModel = plan.status === 'blocked' && !!plan.optimization?.reviewedUnavailableKeys?.length && !plan.optimization.inputs.length;
  const robust = plan.optimization?.robust;
  const partial = plan.status === 'calculated' && !!plan.optimization?.unresolvedKeys?.length;
  const unresolvedCount = plan.optimization?.unresolvedKeys?.length ?? 0;
  return <section aria-label="Berechnete Zielgewichtung" className="min-w-0 space-y-3 rounded-lg border border-indigo-400/20 p-4 text-sm text-gray-300">
    <h5 className="m-0 font-bold text-indigo-300">Berechnete Zielgewichtung</h5>
    <p className="m-0 text-xs">{plan.method === 'forecast-mean-variance-v1'
      ? 'Mathematische 12-Monats-Optimierung aus veröffentlichten Kurszielen oder lokalen historischen Modellszenarien und Risikodaten. Deine bestätigten Bandbreiten begrenzen die Berechnung. Das Ergebnis gilt unter den angezeigten Annahmen.'
      : 'Profilbasierte Modellziele mit Vorrang für deine bestätigten Zielgewichte. Beträge sind lokal berechnet; sie garantieren keine optimale zukünftige Rendite.'}</p>
    {plan.optimization && <div aria-label="Prognosebasierte Optimierung" className="min-w-0 space-y-2 rounded border border-sky-400/20 bg-sky-500/5 p-3 text-xs text-sky-200">
      <p className="m-0 font-bold">{partial ? 'Strenge Teilportfolio-Optimierung' : '12-Monats-Optimierung'}: {reviewedWithoutModel ? 'Prognoseprüfung abgeschlossen; Optimierung nicht verfügbar' : plan.status === 'blocked' ? 'Datengrundlage oder Berechnung ungeklärt' : 'numerisch berechnet'}</p>
      {reviewedWithoutModel && <p className="m-0">Die qualitative Analyse wird fortgesetzt. Nicht beschaffbare Prognosedaten sind als geprüfter Hinweis vermerkt; es werden keine Renditen oder optimierten Handelsbeträge geschätzt.</p>}
      <p className="m-0">{partial ? 'Modellierter Renditebeitrag des erfassten Teils zum Gesamtportfolio' : 'Modellierte Portfolio-Rendite'} nach Modellgebühren: {percent(plan.optimization.expectedReturnPercent)} · Modellierte Wertentwicklung: {euros(plan.optimization.expectedGainEUR)} · Risikoproxy: {percent(plan.optimization.riskProxyPercent)}</p>
      {partial && <p className="m-0 font-bold text-amber-200">Modellabdeckung: {percent(plan.optimization.modeledValuePercent ?? null)} · {unresolvedCount} {unresolvedCount === 1 ? 'Position' : 'Positionen'} ohne vollständige Daten unverändert eingefroren.</p>}
      <p className="m-0">{robust ? robust.covarianceStatus === 'measured-eur'
        ? `Robustes Modell v2: gemessene EUR-Kovarianzen aus ${robust.observations} gemeinsamen Renditeintervallen; Schrumpfung ${percent((robust.covarianceShrinkage ?? 0) * 100)}.`
        : 'Robustes Modell v2: Gemeinsame EUR-Kurshistorien fehlen; keine bestätigte Umschichtung.'
        : 'Altes Modellszenario: angenommener Gleichlauf (+1), keine gemessenen Korrelationen. Für das robuste Modell bitte neu analysieren.'} ETF-Historienmodelle nutzen ausschüttungsbereinigte Renditeproxies; andere Dividenden, Zinsen, Steuern und Spreads sind nicht enthalten.</p>
      {robust && <section aria-label="Robustheit und Entscheidungsprüfung" className="min-w-0 space-y-2 break-words">
        <p className="m-0 font-bold">{robust.decisionStatus === 'review-required' ? 'Modellszenario mit offener Entscheidung' : robust.decisionStatus === 'no-trades' ? 'Keine wirtschaftlich belastbare Umschichtung im Modell' : 'In den geprüften Szenarien stabil; keine Ausführungsfreigabe'}</p>
        <p className="m-0">Gemeinsame Grundgewichtung 0,25 für Aktien-, ETF- und Krypto-Signale; Analystenabdeckung zusätzlich n/(n+10). Konservative Modellannahmen, keine empirisch nachgewiesene Prognosegüte.</p>
        {robust.concentration && <p className="m-0">Größte Einzelposition: vorher {percent(robust.concentration.beforeLargestPercent)}, im Umschichtungsszenario {percent(robust.concentration.scenarioLargestPercent)}. Keine feste Quote; Konzentration wird ausdrücklich geprüft.</p>}
        {robust.stressChecks.map(check => <p className={`m-0 ${check.utilityImprovementEUR <= 0 ? 'text-amber-200' : 'text-sky-200'}`} key={check.name}>{check.name}: Modellnutzen gegenüber unverändertem Bestand {euros(check.utilityImprovementEUR)} nach Gebühren. Kein prognostizierter Geldgewinn.</p>)}
        {robust.reviewReasons.map((reason, index) => <p className="m-0 text-amber-200" key={index}>{reason}</p>)}
      </section>}
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
