import { render, screen } from '@testing-library/react';
import TradeDecisionReview from './TradeDecisionReview';
import { tradeDecisionFixture } from '../../../../../testing/fixtures/tradeDecision';

it('shows both alternatives, timing, profile, amount and explicitly labeled sourced scenarios', () => {
  render(<TradeDecisionReview decision={tradeDecisionFixture} />);
  expect(screen.getByRole('region', { name: 'Halten oder jetzt reduzieren' })).toBeInTheDocument();
  expect(screen.getByText(tradeDecisionFixture.holdCase)).toBeInTheDocument();
  expect(screen.getByText(tradeDecisionFixture.profileFit)).toBeInTheDocument();
  expect(screen.getByText(tradeDecisionFixture.amountRationale)).toBeInTheDocument();
  expect(screen.getByText(tradeDecisionFixture.uncertainties)).toBeInTheDocument();
  expect(screen.getByText(/Abwärtsszenario · 12 Monate/)).toBeInTheDocument();
  expect(screen.getByText(/Basisszenario · 12 Monate/)).toBeInTheDocument();
  expect(screen.getByText(/Aufwärtsszenario · 12 Monate/)).toBeInTheDocument();
  expect(screen.getAllByText('Bedingtes Szenario, keine veröffentlichte Kursprognose')).toHaveLength(2);
  expect(screen.getByText('Veröffentlichte Prognose · Stand: 2026-10-09')).toBeInTheDocument();
});
