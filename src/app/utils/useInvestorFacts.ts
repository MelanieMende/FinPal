import { useEffect, useState } from 'react';
import { readInvestorFacts, saveInvestorFacts, seedInvestorFacts, type InvestorFacts } from './investorFacts';

export function useInvestorFacts(database: string, assets: Asset[]) {
  const [saved, setSaved] = useState(() => ({ database, facts: readInvestorFacts(database, assets) }));
  const [error, setError] = useState<string | null>(null);
  const facts = saved.database === database ? saved.facts : readInvestorFacts(database, assets);
  useEffect(() => {
    const next = seedInvestorFacts(facts, assets);
    if (saved.database !== database || JSON.stringify(next) !== JSON.stringify(saved.facts)) setSaved({ database, facts: next });
    try { saveInvestorFacts(database, next); setError(null); }
    catch { setError('Die dauerhaften Analyseangaben konnten nicht gespeichert werden.'); }
  }, [database, assets, saved]);
  const save = (next: InvestorFacts) => {
    try { saveInvestorFacts(database, next); setSaved({ database, facts: next }); setError(null); return true; }
    catch { setError('Die dauerhaften Analyseangaben konnten nicht gespeichert werden.'); return false; }
  };
  return { facts, save, error };
}
