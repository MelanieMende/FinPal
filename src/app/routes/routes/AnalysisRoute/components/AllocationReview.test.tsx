import React from 'react';
import { render, screen, within } from '@testing-library/react';
import AllocationReview, { AssetOptimizationDetails } from './AllocationReview';
import { buildPortfolioAllocation } from '../../../../utils/portfolioAllocation';
import type { PortfolioAnalysisRequest } from '../../../../utils/portfolioAnalysis';
import { buildForecastAllocation } from '../../../../utils/portfolioForecastOptimization';
import { returnForecastFixture } from '../../../../../testing/fixtures/returnForecast';

const request: PortfolioAnalysisRequest = { provider: 'api', priceUpdatedAt: null,
  profile: { goal: 'growth', risk: 'high', horizonYears: 10, buyBudget: 1000 },
  positions: [{ id: 1, type: 'Crypto', name: 'Bitcoin', isin: '', symbol: 'BTC', shares: 1, price: 1000, currency: 'EUR',
    costBasis: 800, dividendsEarned: 0, realizedGainLoss: 0 }],
};

it('shows the calculated target, before/after weights, exact amount and separate model assumptions and warnings', () => {
  const plan = buildPortfolioAllocation(request);
  render(<><AllocationReview plan={plan} /><AssetOptimizationDetails plan={plan} allocationKey="1" /></>);
  const card = within(screen.getByRole('region', { name: 'Prognose und Zielgewichtung Bitcoin' }));
  expect(card.getByText('50 %')).toBeInTheDocument();
  expect(card.getAllByText('10 %')).toHaveLength(2);
  expect(card.getByText(/Verkaufen.*800,10/)).toBeInTheDocument();
  expect(screen.getByText('Berechnung und Modellannahmen')).toBeInTheDocument();
  expect(screen.getByRole('generic', { name: 'Warnungen zur Zielgewichtung' })).toHaveTextContent('Steuern');
});

it('shows missing valuation as unresolved rather than a zero target or a sale amount', () => {
  const plan = buildPortfolioAllocation({ ...request, positions: [{ ...request.positions[0], price: null }] });
  render(<><AllocationReview plan={plan} /><AssetOptimizationDetails plan={plan} allocationKey="1" /></>);
  const card = within(screen.getByRole('region', { name: 'Prognose und Zielgewichtung Bitcoin' }));
  expect(card.getByText('Modellaktion: Prüfen')).toBeInTheDocument();
  expect(card.getAllByText('Ungeklärt').length).toBeGreaterThan(0);
  expect(card.queryByText(/Verkaufen/)).not.toBeInTheDocument();
});

it('keeps legacy reports renderable and labels the context of single-asset updates', () => {
  const { rerender, container } = render(<AllocationReview />);
  expect(container).toBeEmptyDOMElement();
  rerender(<AllocationReview plan={buildPortfolioAllocation({ ...request, targetAssetId: 1 })} />);
  expect(screen.getByText(/Einzelanalyse: Die übrigen Empfehlungsszenarien/)).toBeInTheDocument();
});

it('shows the optimization horizon, extracted forecast, current-price return and explicit risk assumptions', () => {
  const r = { ...request, priceUpdatedAt: new Date(Date.now()).toISOString(), positions: [{ ...request.positions[0], type: 'Stock' as const }] };
  const plan = buildForecastAllocation(r, [returnForecastFixture('1', { targetPrice: 1200, referencePrice: 1000,
    scenarioReturns: { p10: -40, median: 20, p90: 120 } })]);
  render(<><AllocationReview plan={plan} /><AssetOptimizationDetails plan={plan} allocationKey="1" /></>);
  expect(screen.getByText(/Mathematische 12-Monats-Optimierung/)).toBeInTheDocument();
  const panel = within(screen.getByRole('region', { name: 'Prognose und Zielgewichtung Bitcoin' }));
  expect(panel.getByText(/Kursziel: 1.200 EUR.*20 %/)).toBeInTheDocument();
  expect(panel.getByText('Historisches Bootstrap-Szenarioband: P10 -40 % · Median 20 % · P90 120 %')).toBeInTheDocument();
  expect(screen.getByText(/gemeinsamen Gleichlauf.*keine gemessenen Korrelationen/)).toBeInTheDocument();
  expect(panel.getAllByRole('link', { name: 'Synthetic source' })).toHaveLength(2);
});

it('renders repeated provider URLs without duplicate React keys', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const r = { ...request, priceUpdatedAt: new Date(Date.now()).toISOString(), positions: [{ ...request.positions[0], type: 'Stock' as const }] };
    const repeatedUrl = 'https://finance.yahoo.com/quote/MUV2.DE/analysis/';
    const plan = buildForecastAllocation(r, [returnForecastFixture('1', { forecastSources: [
      { title: 'Analystenziele', url: repeatedUrl }, { title: 'Analysedaten', url: repeatedUrl },
    ] })]);
    render(<AssetOptimizationDetails plan={plan} allocationKey="1" />);
    expect(screen.getByRole('link', { name: 'Analystenziele' })).toHaveAttribute('href', repeatedUrl);
    expect(screen.getByRole('link', { name: 'Analysedaten' })).toHaveAttribute('href', repeatedUrl);
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('same key');
  } finally { consoleError.mockRestore(); }
});

it('shows the age and warning when the last valid forecast cache is used after an update failure', () => {
  const r = { ...request, priceUpdatedAt: new Date(Date.now()).toISOString(), positions: [{ ...request.positions[0], type: 'Stock' as const }] };
  const plan = buildForecastAllocation(r, [returnForecastFixture('1', { dataStatus: 'stale-fallback', dataAgeHours: 25 })]);
  render(<><AllocationReview plan={plan} /><AssetOptimizationDetails plan={plan} allocationKey="1" /></>);
  expect(screen.getByText(/letzter gültiger Cache nach Abruffehler.*25.0 Stunden alt/)).toBeInTheDocument();
  expect(screen.getByRole('generic', { name: 'Warnungen zur Zielgewichtung' })).toHaveTextContent(/Forecast-Anbieter.*25.0 Stunden alt/);
});

it('does not display an optimized return or amount when evidence is missing', () => {
  const plan = buildForecastAllocation(request);
  render(<><AllocationReview plan={plan} /><AssetOptimizationDetails plan={plan} allocationKey="1" /></>);
  expect(screen.getByText(/Keine vollständigen belegten Zahlen/)).toBeInTheDocument();
  expect(screen.getByText(/12-Monats-Optimierung: Datengrundlage/)).toBeInTheDocument();
  expect(screen.getByText('Modellaktion: Prüfen')).toBeInTheDocument();
});

it('explains why a strict crypto forecast remains unavailable after refreshing', () => {
  const plan = buildForecastAllocation(request);
  render(<AssetOptimizationDetails plan={plan} allocationKey="1" assetType="Crypto" />);
  expect(screen.getByText(/mindestens drei Jahre vollständige tägliche Kurse/)).toBeInTheDocument();
  expect(screen.getByText(/belastbare Modellrendite und Volatilität/)).toBeInTheDocument();
});

it('labels a calculated partial optimization and its frozen position coverage', () => {
  const r = { ...request, priceUpdatedAt: new Date(Date.now()).toISOString(), positions: [
    { ...request.positions[0], type: 'Stock' as const },
    { ...request.positions[0], id: 2, name: 'Unmodeled Stock', type: 'Stock' as const },
  ] };
  const plan = buildForecastAllocation(r, [returnForecastFixture('1')]);
  render(<><AllocationReview plan={plan} /><AssetOptimizationDetails plan={plan} allocationKey="2" /></>);
  expect(screen.getByText(/Strenge Teilportfolio-Optimierung: numerisch berechnet/)).toBeInTheDocument();
  expect(screen.getByText(/Modellabdeckung:.*1 Position ohne vollständige Daten unverändert eingefroren/)).toBeInTheDocument();
  const frozen = within(screen.getByRole('region', { name: 'Prognose und Zielgewichtung Unmodeled Stock' }));
  expect(frozen.getByText('Unverändert: Prognosedaten fehlen')).toBeInTheDocument();
  expect(frozen.getByText('Modellaktion: Prüfen')).toBeInTheDocument();
});
