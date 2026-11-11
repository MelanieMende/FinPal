import { buildAnalysisPositions } from './portfolioAnalysis';
import { buildResearchSecurities, fundResearchInstructions, knownResearchSources } from './portfolioResearch';

it('provides filing discovery pointers by normalized ISIN without exposing holdings', () => {
  const positions = buildAnalysisPositions([
    { ID: 12, name: 'Arbor Metals', symbol: 'CA03880B1040.SG', isin: ' ca03880b1040 ', type: 'Stock', current_shares: 21.645021, price: 0.05, current_invest: -51 },
    { ID: 20, name: 'Unrelated issuer', symbol: 'OTHER', isin: 'OTHER', type: 'Stock', current_shares: 1 },
  ] as Asset[]);
  const securities = buildResearchSecurities(positions);
  expect(securities[0]).toMatchObject({ id: 12, symbol: 'CA03880B1040.SG', discoveryHints: { issuer: 'Arbor Metals Corp.', listing: expect.stringContaining('Yahoo Finance: ABR.V (TSXV, CAD;') } });
  expect(securities[0].discoveryHints!.sourceUrls).toContain('https://www.sedarplus.ca/');
  expect(securities[0].discoveryHints!.sourceUrls.some(url => url.endsWith('.pdf'))).toBe(true);
  expect(securities[1]).not.toHaveProperty('discoveryHints');
  for (const security of securities) {
    expect(security).not.toHaveProperty('shares');
    expect(security).not.toHaveProperty('price');
    expect(security).not.toHaveProperty('costBasis');
  }
});

it('identifies the Apollo share class and requires a separately evidenced NAV date', () => {
  const positions = buildAnalysisPositions([{ ID: 32, name: 'Apollo', isin: 'LU3170240538', symbol: 'A41HPL', type: 'Fund', current_shares: 0.1 }] as Asset[]);
  expect(buildResearchSecurities(positions)[0].discoveryHints).toMatchObject({ issuer: 'Apollo Global Private Markets ELTIF, Klasse A2 UNH', sourceUrls: [
    'https://www.francetransactions.com/IMG/pdf/dic-apollo-private-equity.pdf',
    'https://www.apollo.com/agpm-eltif',
  ] });
  expect(fundResearchInstructions).toContain('Bewertungsstichtag');
  expect(fundResearchInstructions).toContain('kein Nachweis eines offiziellen Fonds-NAV');
});

it('adds current German tax primary sources to direct Bitcoin research', () => {
  const sources = knownResearchSources({ isin: '', symbol: 'BTC', type: 'Crypto' });
  expect(sources).toContain('https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte-bmf-schreiben.html');
  expect(sources).toContain('https://www.gesetze-im-internet.de/estg/__23.html');
});

it('provides the listed SpaceX Class A identity and SEC discovery pointers', () => {
  const positions = buildAnalysisPositions([{ ID: 34, name: 'SpaceX', isin: 'US84615Q1031', symbol: 'SPCX', type: 'Stock', current_shares: 1 }] as Asset[]);
  expect(buildResearchSecurities(positions)[0].discoveryHints).toMatchObject({
    issuer: 'Space Exploration Technologies Corp. (SpaceX)', listing: expect.stringContaining('SEC CIK 0001181412'),
    sourceUrls: expect.arrayContaining(['https://www.sec.gov/edgar/browse/?CIK=0001181412&owner=include']),
  });
});
