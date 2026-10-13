import { forecastResearchGaps, forecastResearchRequirements } from './forecastResearch';

it('routes only unique known numeric asset IDs from the coverage footer', () => {
  expect(forecastResearchGaps('Recherche\nFORECAST_GAPS: [2, 2, 99, "1", null]\n', [{ id: 1 }, { id: 2 }])).toEqual([2]);
  for (const text of ['Recherche', 'FORECAST_GAPS: invalid', 'FORECAST_GAPS: [broken]', 'FORECAST_GAPS: []']) {
    expect(forecastResearchGaps(text, [{ id: 1 }])).toEqual([]);
  }
});

it('uses the same strict date windows as the forecast validator', () => {
  expect(forecastResearchRequirements(Date.parse('2026-10-13T12:00:00Z'))).toEqual({
    publishedAndVolatilityNotBefore: '2026-07-15T12:00:00.000Z',
    targetDateFrom: '2027-09-08T12:00:00.000Z',
    targetDateThrough: '2027-11-17T12:00:00.000Z',
    minimumVolatilityLookbackDays: 180,
  });
});
