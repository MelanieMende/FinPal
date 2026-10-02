import { act, fireEvent, screen, within } from '@testing-library/react';
import { render } from '../../../../../../testing/test-utils';
import { setupStore } from '../../../../../store';
import { analyzePortfolio } from '../../../../../store/portfolioAnalysis/portfolioAnalysis.reducer';
import { buildAnalysisPositions, type PortfolioAnalysisRequest, type PortfolioAnalysisResult } from '../../../../../utils/portfolioAnalysis';
import AssetList from './AssetList';

const assets = [10, 20, 30, 40, 50].map(ID => ({ ID, name: 'Asset ' + ID, type: 'Stock', current_shares: 1, price: ID, current_invest: -10, avg_price_paid: 10 })) as Asset[];
const request: PortfolioAnalysisRequest = { provider: 'api', positions: buildAnalysisPositions(assets), profile: { goal: 'growth', risk: 'medium', horizonYears: 10, buyBudget: 0 }, priceUpdatedAt: null };
const args = { request, snapshot: 'snapshot' };
const report: PortfolioAnalysisResult = {
  summary: 'Report', warnings: [], sources: [], generatedAt: '2026-10-02T10:00:00Z', priceUpdatedAt: null, model: 'test-model',
  recommendations: (['Kaufen', 'Verkaufen', 'Halten', 'Prüfen'] as const).map((action, i) => ({ assetId: assets[i].ID, action, rationale: 'Reason for ' + action, risk: 'Risk', sourceIndexes: [] as number[] })),
};

it('places AI indicators immediately after the name and matches recommendations by asset ID in sorted rows', async () => {
  const store = setupStore({ assets });
  store.dispatch(analyzePortfolio.fulfilled({ report, snapshot: 'snapshot' }, 'first', args));
  await act(async () => { render(<AssetList />, { store }); });
  const headers = screen.getAllByRole('columnheader');
  expect(headers.map(header => header.textContent).slice(2, 5)).toEqual(['Name', 'KI', 'Shares']);
  for (const rec of report.recommendations) {
    const row = screen.getByTestId('asset-row-' + rec.assetId);
    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(headers.length);
    expect(cells[2]).toHaveTextContent('Asset ' + rec.assetId);
    const indicator = within(cells[3]).getByRole('img', { name: 'KI-Empfehlung: ' + rec.action });
    expect(indicator).toHaveAttribute('title', expect.stringContaining(rec.rationale));
    expect(indicator).toHaveAttribute('title', expect.stringContaining('KI-Analyse vom'));
  }
  expect(within(screen.getByTestId('asset-row-50')).getByLabelText('Keine KI-Empfehlung vorhanden')).toHaveTextContent('—');
  const totals = document.getElementById('AssetListSumRow')!;
  expect(within(totals).getAllByRole('cell')).toHaveLength(headers.length);
  await act(async () => { fireEvent.click(screen.getByTestId('asset-row-10')); });
  expect(within(screen.getByTestId('asset-transactions-10')).getAllByRole('cell')[0]).toHaveAttribute('colspan', String(headers.length));
});

it('keeps the last successful indicators during and after a failed new analysis and replaces them on success', async () => {
  const store = setupStore({ assets });
  store.dispatch(analyzePortfolio.fulfilled({ report, snapshot: 'snapshot' }, 'first', args));
  await act(async () => { render(<AssetList />, { store }); });
  const recommendation = () => within(screen.getByTestId('asset-row-10'));
  await act(async () => { store.dispatch(analyzePortfolio.pending('second', args)); });
  expect(store.getState().portfolioAnalysis.result).toBeNull();
  expect(recommendation().getByRole('img', { name: 'KI-Empfehlung: Kaufen' })).toBeInTheDocument();
  await act(async () => { store.dispatch(analyzePortfolio.rejected(new Error('Timed out'), 'second', args)); });
  expect(recommendation().getByRole('img', { name: 'KI-Empfehlung: Kaufen' })).toBeInTheDocument();
  const nextReport = { ...report, recommendations: [{ ...report.recommendations[0], action: 'Verkaufen' as const }] };
  await act(async () => { store.dispatch(analyzePortfolio.fulfilled({ report: nextReport, snapshot: 'snapshot' }, 'third', args)); });
  expect(recommendation().getByRole('img', { name: 'KI-Empfehlung: Verkaufen' })).toBeInTheDocument();
  expect(recommendation().queryByRole('img', { name: 'KI-Empfehlung: Kaufen' })).not.toBeInTheDocument();
});
