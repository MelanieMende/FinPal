import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisPosition, AnalysisSource } from './portfolioAnalysis';
import { knownResearchSources } from './portfolioResearch';

type SearchNews = { title: string; publisher?: string; link: string; providerPublishTime?: Date | string | number; relatedTickers?: string[] };
export interface OnlineSearchClient {
  search(query: string, options: { newsCount: number; quotesCount: number; enableFuzzyQuery: boolean; region: string; lang: string }): Promise<{ news?: SearchNews[] }>;
}
export interface DeterministicResearchResult {
  assetId: number;
  query: string;
  fetchedAt: number;
  newsCount: number;
  searchStatus: 'completed' | 'failed';
  sources: AnalysisSource[];
  text: string;
}
export type DeterministicResearchProvider = (position: AnalysisPosition, options?: { forceRefresh?: boolean }) => Promise<DeterministicResearchResult>;

const ttl = 24 * 60 * 60 * 1000;
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
};
const safeText = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : fallback;
const timestamp = (value: unknown) => {
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export function createDeterministicOnlineResearchProvider(client: OnlineSearchClient, config: { cacheFile?: string; now?: () => number } = {}): DeterministicResearchProvider {
  const now = config.now ?? Date.now;
  const cache = new Map<string, DeterministicResearchResult>();
  if (config.cacheFile) try {
    const saved = JSON.parse(fs.readFileSync(config.cacheFile, 'utf8'));
    if (saved.version === 1 && Array.isArray(saved.entries)) for (const [key, value] of saved.entries.slice(-200)) {
      if (typeof key === 'string' && value && Number.isFinite(value.fetchedAt) && now() - value.fetchedAt < ttl
        && Array.isArray(value.sources) && value.sources.every((source: AnalysisSource) => safeUrl(source.url))) cache.set(key, value);
    }
  } catch { /* A missing or damaged cache must not prevent research. */ }
  const save = () => {
    if (!config.cacheFile) return;
    fs.mkdirSync(path.dirname(config.cacheFile), { recursive: true });
    const temporary = config.cacheFile + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, entries: [...cache] }), { mode: 0o600 });
      fs.renameSync(temporary, config.cacheFile);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  };
  return async (position, options = {}) => {
    const identity = [position.symbol, position.isin, position.name].map(value => value.trim()).filter(Boolean);
    const query = identity.join(' ');
    const key = JSON.stringify({ id: position.id, identity });
    const cached = cache.get(key);
    if (!options.forceRefresh && cached && now() - cached.fetchedAt < ttl) return cached;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let result: { news?: SearchNews[] } = {};
    let searchStatus: DeterministicResearchResult['searchStatus'] = 'completed';
    try {
      result = await Promise.race([
        client.search(query, { newsCount: 5, quotesCount: 1, enableFuzzyQuery: false, region: 'DE', lang: 'de-DE' }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Online search timeout')), 15000); }),
      ]);
    } catch { searchStatus = 'failed'; }
    finally { if (timer) clearTimeout(timer); }
    const sources: AnalysisSource[] = [];
    const add = (title: string, value: string) => {
      const url = safeUrl(value);
      if (url && !sources.some(source => source.url === url)) sources.push({ title: safeText(title, new URL(url).hostname), url });
    };
    for (const value of knownResearchSources(position)) add(`Bekannte Primärquelle für ${position.name}`, value);
    if (position.symbol.trim()) {
      const symbol = encodeURIComponent(position.symbol.trim());
      add(`Yahoo Finance: Historische Kurse für ${position.symbol}`, `https://finance.yahoo.com/quote/${symbol}/history/`);
      if (position.type === 'Stock') add(`Yahoo Finance: Analystendaten für ${position.symbol}`, `https://finance.yahoo.com/quote/${symbol}/analysis/`);
      if (position.type === 'ETF' || position.type === 'Fund') add(`Yahoo Finance: Fondsprofil für ${position.symbol}`, `https://finance.yahoo.com/quote/${symbol}/profile/`);
    }
    const news = (result.news ?? []).slice(0, 5);
    for (const item of news) add(`${safeText(item.publisher, 'Online-Quelle')}: ${safeText(item.title, position.name)}${timestamp(item.providerPublishTime) ? ` (${timestamp(item.providerPublishTime)})` : ''}`, item.link);
    const fetchedAt = now();
    const research: DeterministicResearchResult = {
      assetId: position.id, query, fetchedAt, searchStatus, newsCount: news.filter(item => !!safeUrl(item.link)).length, sources,
      text: `Asset ${position.id} (${position.name}): deterministische Online-Suche nach ${JSON.stringify(query)} am ${new Date(fetchedAt).toISOString()}. ${searchStatus === 'completed' ? `${news.length} Nachrichtentreffer` : 'Die Nachrichtensuche ist fehlgeschlagen'}; ${sources.length} validierte HTTPS-Quellen erfasst. Treffer sind Suchbelege und wurden nicht semantisch als Tatsachen oder Empfehlungen interpretiert.`,
    };
    cache.set(key, research);
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    try { save(); } catch { /* A valid online result survives a cache write failure. */ }
    return research;
  };
}
