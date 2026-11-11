import type { AnalysisPosition } from './portfolioAnalysis';

export interface EltifProductTerms {
  kidDate: string;
  prospectusEdition: string;
  shareClass: string;
  shareClassCurrency: string;
  currencyHedged: boolean;
  distributionPolicy: 'accumulating' | 'distributing';
  recommendedHoldingYears: number;
  riskClass: number;
  valuationFrequency: 'monthly';
  subscriptionFrequency: 'monthly';
  redemptionFrequency: 'quarterly';
  redemptionNoticeDays: number;
  initialRedemptionLockMonths: number;
  redemptionGate: string;
  navPublicationDelay: string;
  managementFeePercent: number;
  annualCostImpactPercent: number;
  sourceDocuments: string[];
  indicativeNav: {
    value: number;
    currency: 'EUR';
    observedOn: string;
    source: 'user-confirmed-broker-display';
    official: false;
    valuationDate: null;
    useForPlanning: true;
  };
}

const APOLLO_A2_UNH: EltifProductTerms = {
  kidDate: '2026-03-31', prospectusEdition: '2026-04', shareClass: 'A2 UNH', shareClassCurrency: 'EUR', currencyHedged: false,
  distributionPolicy: 'accumulating', recommendedHoldingYears: 5, riskClass: 4, valuationFrequency: 'monthly',
  subscriptionFrequency: 'monthly', redemptionFrequency: 'quarterly', redemptionNoticeDays: 30,
  initialRedemptionLockMonths: 9,
  redemptionGate: 'Niedrigerer Wert aus 5 % des Fonds-NAV und 27,3 % der liquiden Anlagen zuzüglich erwarteter Cashflows',
  navPublicationDelay: 'Prospekt widersprüchlich: etwa 25 bzw. 35 Geschäftstage nach Monatsende',
  managementFeePercent: 2.2, annualCostImpactPercent: 6.8,
  sourceDocuments: ['Prospekt April 2026', 'PRIIPs-KID vom 31.03.2026'],
  indicativeNav: { value: 111.29, currency: 'EUR', observedOn: '2026-11-09',
    source: 'user-confirmed-broker-display', official: false, valuationDate: null, useForPlanning: true },
};

export function eltifProductTerms(position: Pick<AnalysisPosition, 'isin' | 'type'>): EltifProductTerms | null {
  return position.type === 'Fund' && position.isin.trim().toUpperCase() === 'LU3170240538'
    ? { ...APOLLO_A2_UNH, sourceDocuments: [...APOLLO_A2_UNH.sourceDocuments], indicativeNav: { ...APOLLO_A2_UNH.indicativeNav } } : null;
}

export function analysisUnitValueEUR(position: Pick<AnalysisPosition, 'price' | 'currency' | 'eltifProductTerms'>): number | null {
  if (position.eltifProductTerms?.indicativeNav.useForPlanning) return position.eltifProductTerms.indicativeNav.value;
  return position.currency === 'EUR' && position.price !== null ? position.price : null;
}

export function validEltifProductTerms(value: EltifProductTerms): boolean {
  return !!value && value.kidDate === '2026-03-31' && value.prospectusEdition === '2026-04' && value.shareClass === 'A2 UNH'
    && value.shareClassCurrency === 'EUR' && value.currencyHedged === false && value.distributionPolicy === 'accumulating'
    && value.recommendedHoldingYears === 5 && value.riskClass === 4 && value.valuationFrequency === 'monthly'
    && value.subscriptionFrequency === 'monthly' && value.redemptionFrequency === 'quarterly'
    && value.redemptionNoticeDays === 30 && value.initialRedemptionLockMonths === 9
    && typeof value.redemptionGate === 'string' && value.redemptionGate.length <= 300
    && typeof value.navPublicationDelay === 'string' && value.navPublicationDelay.length <= 300
    && value.managementFeePercent === 2.2 && value.annualCostImpactPercent === 6.8
    && Array.isArray(value.sourceDocuments) && value.sourceDocuments.length === 2
    && value.sourceDocuments.every(source => typeof source === 'string' && source.length <= 100)
    && value.indicativeNav?.value === 111.29 && value.indicativeNav.currency === 'EUR'
    && value.indicativeNav.observedOn === '2026-11-09' && value.indicativeNav.source === 'user-confirmed-broker-display'
    && value.indicativeNav.official === false && value.indicativeNav.valuationDate === null && value.indicativeNav.useForPlanning === true;
}
