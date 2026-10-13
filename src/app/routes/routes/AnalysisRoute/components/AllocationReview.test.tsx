import React from 'react';
import { render, screen, within } from '@testing-library/react';
import AllocationReview from './AllocationReview';
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
  render(<AllocationReview plan={buildPortfolioAllocation(request)} />);
  const card = within(screen.getByRole('article', { name: 'Zielgewicht Bitcoin' }));
  expect(card.getByText('50 %')).toBeInTheDocument();
  expect(card.getAllByText('10 %')).toHaveLength(2);
  expect(card.getByText(/Verkaufen.*800,10/)).toBeInTheDocument();
  expect(screen.getByText('Berechnung und Modellannahmen')).toBeInTheDocument();
  expect(screen.getByRole('generic', { name: 'Warnungen zur Zielgewichtung' })).toHaveTextContent('Steuern');
});

it('shows missing valuation as unresolved rather than a zero target or a sale amount', () => {
  render(<AllocationReview plan={buildPortfolioAllocation({ ...request, positions: [{ ...request.positions[0], price: null }] })} />);
  const card = within(screen.getByRole('article', { name: 'Zielgewicht Bitcoin' }));
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
  const plan = buildForecastAllocation(r, [returnForecastFixture('1', { targetPrice: 1200, referencePrice: 1000 })]);
  render(<AllocationReview plan={plan} />);
  expect(screen.getByText(/Mathematische 12-Monats-Optimierung/)).toBeInTheDocument();
  const panel = within(screen.getByRole('generic', { name: 'Prognosebasierte Optimierung' }));
  expect(panel.getByText(/Kursziel: 1.200 EUR.*20 %/)).toBeInTheDocument();
  expect(panel.getByText(/gemeinsamen Gleichlauf.*keine gemessenen Korrelationen/)).toBeInTheDocument();
  expect(panel.getAllByRole('link', { name: 'Synthetic source' })).toHaveLength(2);
});

it('does not display an optimized return or amount when evidence is missing', () => {
  render(<AllocationReview plan={buildForecastAllocation(request)} />);
  expect(screen.getByText(/Keine vollständigen belegten Zahlen/)).toBeInTheDocument();
  expect(screen.getByText(/12-Monats-Optimierung: Datengrundlage/)).toBeInTheDocument();
  expect(screen.getByText('Modellaktion: Prüfen')).toBeInTheDocument();
});
