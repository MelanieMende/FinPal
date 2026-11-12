import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addRiskReviewContext, PrimaryRiskAssessmentCache, riskFingerprint, riskForModel, riskReviewInput, validateRiskAssessment,
  type PrimaryRiskRecord } from './primaryRiskAssessment';
import type { AnalysisPosition } from './portfolioAnalysis';
import type { InvestorContext } from './investorFacts';
import type { RiskDocumentSet } from './primaryRiskResearch';

const position = { id: 31, type: 'Crypto', name: 'Bitcoin', isin: 'BTC', symbol: 'BTC' } as AnalysisPosition;
const ledger = 'The block chain provides Bitcoin’s public ledger, an ordered and timestamped record of transactions.';
const forks = 'Non-upgraded nodes may use and distribute incorrect information during both types of forks, creating several situations which could lead to financial loss.';
const documents: RiskDocumentSet = { discoveryChecked: true, gaps: [], documents: [{
  source: { title: 'Bitcoin Developer Guide', url: 'https://developer.bitcoin.org/devguide/block_chain.html' },
  excerpt: `${ledger} ${forks}`, identity: 'bitcoin-network', excerptVersion: 2, hash: 'same-source-hash', fetchedAt: Date.now(), period: null,
}] };

it('closes BTC network identity without an ISIN and cites documented fork risk while preserving actual gaps', () => {
  const record = validateRiskAssessment(position, documents, null);
  expect(record.checks.find(check => check.flag === 'identity')).toMatchObject({ finding: 'no-risk', quote: ledger });
  expect(record.checks.find(check => check.flag === 'protocol')).toMatchObject({ finding: 'risk', quote: forks });
  expect(record.gaps.some(gap => gap.startsWith('identity:') || gap.startsWith('protocol:'))).toBe(false);
  expect(record.checks.find(check => check.flag === 'custody')?.finding).toBe('unknown');
  expect(riskForModel(record).rationale).toContain('Netzwerk und Coin:');
  expect(riskForModel(record).decisionReadiness).toBeUndefined();
  const noEvidence = validateRiskAssessment(position, { ...documents, documents: [{ ...documents.documents[0], excerpt: ledger }] }, null);
  expect(noEvidence.checks.find(check => check.flag === 'protocol')?.finding).toBe('unknown');
});

it('repairs cached findings from expanded excerpts without changing source hashes or inventing custody', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-btc-review-'));
  try {
    const cache = new PrimaryRiskAssessmentCache(path.join(folder, 'risk.json'));
    cache.set(validateRiskAssessment(position, { ...documents, documents: [{ ...documents.documents[0], excerpt: 'Bitcoin network documentation.' }] }, null));
    const repaired = cache.get(position, documents)!;
    expect(repaired.checks.find(check => check.flag === 'identity')?.finding).toBe('no-risk');
    expect(repaired.checks.find(check => check.flag === 'protocol')?.finding).toBe('risk');
    expect(repaired.checks.find(check => check.flag === 'custody')?.finding).toBe('unknown');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
});

it('passes confirmed context into review, invalidates changed custody, and rejects conflicting product identity', () => {
  const custody = { kind: 'broker', provider: 'Trade Republic', source: 'user-confirmed', confirmedAt: new Date().toISOString(), orderFeeEUR: 1 } as const;
  const product = { kind: 'direct-crypto', source: 'trade-republic', instrumentId: 'BTC', instrumentType: 'crypto' } as const;
  const context = { taxResidencies: [{ country: 'DE', validFrom: '2025-01-01' }], assets: [{ assetId: 31, custody,
    resolvedTaxContext: { product } }] } as InvestorContext;
  const set = { ...documents };
  addRiskReviewContext(position, set, context);
  expect(riskReviewInput(position, set).security.reviewContext).toMatchObject({ custody, product });
  const initial = riskFingerprint(position, set);
  addRiskReviewContext(position, set, { ...context, assets: [{ ...context.assets[0], custody: { ...custody,
    orderFeeEUR: 2, confirmedAt: new Date(Date.now() + 1000).toISOString() } }] });
  expect(riskFingerprint(position, set)).toBe(initial);
  addRiskReviewContext(position, set, { ...context, assets: [{ ...context.assets[0], custody: { ...custody, provider: 'Other provider' } }] });
  expect(riskFingerprint(position, set)).not.toBe(initial);
  addRiskReviewContext(position, set, { ...context, assets: [{ ...context.assets[0], resolvedTaxContext: {
    ...context.assets[0].resolvedTaxContext!, product: { ...product, instrumentId: 'OTHER' } } }] });
  expect(set.reviewContext?.product).toBeUndefined();
  addRiskReviewContext(position, set, { ...context, assets: [{ ...context.assets[0], resolvedTaxContext: {
    ...context.assets[0].resolvedTaxContext!, product: { ...product, kind: 'security', instrumentType: 'etp' } } }] });
  expect(validateRiskAssessment(position, set, null).checks.find(check => check.flag === 'identity')?.finding).toBe('unknown');
  expect(validateRiskAssessment(position, set, { checks: [{ flag: 'identity', finding: 'no-risk',
    reason: 'Coin identified.', documentIndex: 0, quote: ledger }] }).checks.find(check => check.flag === 'identity')?.finding).toBe('unknown');
});

it('closes the German Trade Republic provider-authorisation gap without treating Bitcoin as approved', () => {
  const custody = { kind: 'broker', provider: 'Trade Republic', source: 'user-confirmed', confirmedAt: new Date().toISOString() } as const;
  const product = { kind: 'direct-crypto', source: 'trade-republic', instrumentId: 'BTC', instrumentType: 'crypto' } as const;
  const context = { taxResidencies: [{ country: 'DE', validFrom: '2025-01-01' }], assets: [{ assetId: 31, custody,
    resolvedTaxContext: { product } }] } as InvestorContext;
  const policy = 'Trade Republic Bank GmbH is a credit institution licensed in Germany and a crypto-asset services provider under Regulation (EU) 2023/1114 on Markets in Crypto-Assets (MiCAR).';
  const set: RiskDocumentSet = { ...documents, documents: [...documents.documents, { source: { title: 'Trade Republic Crypto Execution Policy',
    url: 'https://assets.traderepublic.com/assets/files/EN_ExecutionPolicy.pdf' }, excerpt: policy, identity: 'trade-republic-casp',
    excerptVersion: 2, hash: 'tr-policy', fetchedAt: Date.now(), period: null }] };
  addRiskReviewContext(position, set, context);
  const record = validateRiskAssessment(position, set, null);
  expect(record.checks.find(check => check.flag === 'regulatory')).toMatchObject({ finding: 'no-risk', documentIndex: 1 });
  expect(record.checks.find(check => check.flag === 'regulatory')?.reason).toContain('weder eine behördliche Billigung von Bitcoin');
  expect(record.gaps.some(gap => gap.startsWith('regulatory:'))).toBe(false);
});

it('recovers documented custody and liquidity risks when the model omits them', () => {
  const custody = { kind: 'broker', provider: 'Trade Republic', source: 'user-confirmed', confirmedAt: new Date().toISOString() } as const;
  const context = { taxResidencies: [{ country: 'DE', validFrom: '2025-01-01' }], assets: [{ assetId: 31, custody }] } as InvestorContext;
  const custodyQuote = 'When a third party controls your keys, you rely entirely on their security and honesty, and history has shown that exchanges and online wallets can be hacked, fail, or freeze access to funds.';
  const liquidityQuote = 'The price of a bitcoin can unpredictably increase or decrease over a short period of time due to its economy, evolving adoption, and sometimes illiquid markets.';
  const set: RiskDocumentSet = { ...documents, documents: [...documents.documents,
    { source: { title: 'Wallet risks', url: 'https://bitcoin.org/en/secure-your-wallet' }, excerpt: custodyQuote,
      identity: 'bitcoin-network', excerptVersion: 2, hash: 'wallet', fetchedAt: Date.now(), period: null },
    { source: { title: 'Market risks', url: 'https://bitcoin.org/en/you-need-to-know' }, excerpt: liquidityQuote,
      identity: 'bitcoin-network', excerptVersion: 2, hash: 'market', fetchedAt: Date.now(), period: null }] };
  addRiskReviewContext(position, set, context);
  const record = validateRiskAssessment(position, set, null);
  expect(record.checks.find(check => check.flag === 'custody')).toMatchObject({ finding: 'risk', documentIndex: 1 });
  expect(record.checks.find(check => check.flag === 'liquidity')).toMatchObject({ finding: 'risk', documentIndex: 2 });
  expect(record.gaps.some(gap => /^(?:custody|liquidity):/.test(gap))).toBe(false);
});

it('allows a recommendation with reviewed structural BTC risks but still blocks a current incident', () => {
  const base = validateRiskAssessment(position, documents, null);
  const reviewed: PrimaryRiskRecord = { ...base, status: 'unknown',
    sources: [
      { title: 'Funktionsweise', url: 'https://bitcoin.org/en/how-it-works' },
      { title: 'Developer Guide', url: 'https://developer.bitcoin.org/devguide/block_chain.html' },
      { title: 'Wallet-Risiken', url: 'https://bitcoin.org/en/secure-your-wallet' },
      { title: 'Marktrisiken', url: 'https://bitcoin.org/en/you-need-to-know' },
    ],
    gaps: ['concentration: Aktuelle Mining-Pool-Anteile fehlen.', 'regulatory: Die konkrete deutsche Produktzulässigkeit bleibt offen.'],
    checks: [
      { flag: 'identity' as const, finding: 'no-risk' as const, reason: 'BTC ist dem Bitcoin-Netzwerk zugeordnet.', documentIndex: 0, quote: ledger },
      { flag: 'protocol' as const, finding: 'risk' as const,
        reason: 'Strukturelles Konsens- und Fork-Risiko laut Developer Guide; kein aktueller Angriff oder Ausfall belegt. Bei Regeländerungen können Nodes falsche Informationen weitergeben.', documentIndex: 0, quote: forks },
      { flag: 'concentration' as const, finding: 'unknown' as const, reason: 'Aktuelle Mining-Pool-Anteile fehlen.', documentIndex: null, quote: '' },
      { flag: 'custody' as const, finding: 'risk' as const,
        reason: 'Die Brokerverwahrung bei Trade Republic ist im reviewContext nutzerbestätigt. Das strukturelle Dienstleisterrisiko bleibt; eine konkrete Sicherheitslücke ist nicht belegt.', documentIndex: 0, quote: 'third party controls your keys' },
      { flag: 'liquidity' as const, finding: 'risk' as const,
        reason: 'Strukturelles Marktrisiko; die Dokumentation belegt nicht die derzeitige Handelbarkeit.', documentIndex: 0, quote: 'sometimes illiquid markets' },
      { flag: 'regulatory' as const, finding: 'unknown' as const, reason: 'Die konkrete deutsche Produktzulässigkeit bleibt offen.', documentIndex: null, quote: '' },
    ] };
  expect(riskForModel(reviewed)).toMatchObject({ decisionReadiness: 'reviewed-uncertainty', materialRisks: [] });
  const optionalProviderUnavailable = { ...reviewed, gaps: [...reviewed.gaps,
    'Optionale anbieterbezogene Crypto-Primärquelle konnte nicht aktuell geladen werden: https://assets.traderepublic.com/assets/files/EN_ExecutionPolicy.pdf'] };
  expect(riskForModel(optionalProviderUnavailable)).toMatchObject({ decisionReadiness: 'reviewed-uncertainty', materialRisks: [] });
  const reworded = { ...reviewed, checks: reviewed.checks.map(check => check.flag === 'protocol'
    ? { ...check, reason: 'Die undatierten Protokollgrundlagen belegen strukturelle Konsens- und Forkrisiken.' }
    : check.flag === 'custody' ? { ...check, reason: 'Brokerverwahrung bei Trade Republic ist im reviewContext nutzerbestätigt. Damit ist das strukturelle Dienstleister- und Gegenparteirisiko relevant.' }
      : check.flag === 'liquidity' ? { ...check, reason: 'Die Projektdokumentation nennt zeitweise illiquide Märkte als strukturelles Bitcoin-Marktrisiko.' }
        : check) };
  expect(riskForModel(reworded)).toMatchObject({ decisionReadiness: 'reviewed-uncertainty', materialRisks: [] });
  const incident = { ...reviewed, checks: reviewed.checks.map(check => check.flag === 'custody'
    ? { ...check, reason: 'Ein aktueller Verlust bei Trade Republic ist belegt.' } : check) };
  expect(riskForModel(incident)).toMatchObject({ materialRisks: ['custody'] });
  expect(riskForModel(incident).decisionReadiness).toBeUndefined();
});
