import { assessNavFreshness, isEltif, type NavEvidence } from './eltifValuation';
const now = Date.parse('2026-10-08T08:00:00Z');
const evidence: NavEvidence = { isin: 'LU3170240538', value: 110, currency: 'USD', valuationDate: '2026-08-31', publicationCycle: 'Monthly, published after the month end', nextPublicationDue: '2026-10-15', sourceIndexes: [0] };
it('identifies named ELTIFs and the known Apollo ISIN without treating ordinary funds as ELTIFs', () => {
  expect(isEltif({ type: 'Fund', name: 'Apollo', isin: ' lu3170240538 ' })).toBe(true);
  expect(isEltif({ type: 'Fund', name: 'Other ELTIF', isin: 'OTHER' })).toBe(true);
  expect(isEltif({ type: 'Fund', name: 'Ordinary Fund', isin: 'OTHER' })).toBe(false);
});
it('uses the evidenced publication cycle instead of the 48-hour quote rule', () => {
  expect(assessNavFreshness(evidence, now)).toBe('current');
  expect(assessNavFreshness({ ...evidence, nextPublicationDue: '2026-10-07' }, now)).toBe('stale');
  expect(assessNavFreshness({ ...evidence, nextPublicationDue: '2026-10-08' }, now)).toBe('current');
});
it.each([{ value: null }, { currency: null }, { valuationDate: null }, { publicationCycle: null }, { nextPublicationDue: null }, { sourceIndexes: [] }, { valuationDate: '2026-02-30' }, { valuationDate: '2026-11-01' }, { nextPublicationDue: '2026-08-01' }])('keeps incomplete or invalid NAV evidence unknown: %j', partial => {
  expect(assessNavFreshness({ ...evidence, ...partial }, now)).toBe('unknown');
});
it('keeps absent evidence unknown, independently of the broker tick', () => {
  expect(assessNavFreshness(undefined, now)).toBe('unknown');
  expect(assessNavFreshness(null, now)).toBe('unknown');
});
