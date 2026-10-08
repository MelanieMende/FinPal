import type { AnalysisPosition } from './portfolioAnalysis';

export function isEltif(position: Pick<AnalysisPosition, 'name' | 'isin' | 'type'>): boolean {
  return position.type === 'Fund' && (/\bELTIF\b/i.test(position.name) || position.isin.trim().toUpperCase() === 'LU3170240538');
}

export interface NavEvidence {
  isin: string;
  value: number | null;
  currency: string | null;
  valuationDate: string | null;
  publicationCycle: string | null;
  nextPublicationDue: string | null;
  sourceIndexes: number[];
}

export function assessNavFreshness(evidence?: NavEvidence | null, now = Date.now()): 'current' | 'stale' | 'unknown' {
  if (!evidence || !(evidence.value > 0) || !/^[A-Z]{3}$/.test(evidence.currency ?? '')
    || !evidence.publicationCycle?.trim() || !evidence.sourceIndexes.length) return 'unknown';
  const date = (value: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const timestamp = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : NaN;
  };
  const valuation = date(evidence.valuationDate);
  const due = date(evidence.nextPublicationDue);
  if (!Number.isFinite(valuation) || !Number.isFinite(due) || valuation > now || due < valuation) return 'unknown';
  // Publication deadlines are inclusive; do not apply the stock-price 48-hour rule.
  return now > due + 86400000 - 1 ? 'stale' : 'current';
}
