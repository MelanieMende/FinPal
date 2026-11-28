import fs from 'node:fs';
import path from 'node:path';
import type { ResearchAsset, AnalysisSource } from './portfolioAnalysis';
import { knownResearchSources } from './portfolioResearch';
import { researchLinkLabel, displayResearchSourceTitle } from './researchSourceLabel';

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
  failureReason?: 'timeout' | 'provider';
  failureStage?: 'search' | 'fallback';
  cacheStatus?: 'reused' | 'fresh';
  sources: AnalysisSource[];
  text: string;
}
export type DeterministicResearchProvider = (position: ResearchAsset, options?: { forceRefresh?: boolean }) => Promise<DeterministicResearchResult>;

const ttl = 24 * 60 * 60 * 1000;
const safeUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
};
const safeText = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : fallback;
const timestamp = (value: unknown) => {
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? (Math.abs(value) < 1e11 ? value * 1000 : value) : Date.parse(String(value ?? ''));
  const date = new Date(parsed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const validNews = (value: unknown): SearchNews[] => Array.isArray(value) ? value.flatMap(item => {
  if (!item || typeof item !== 'object' || typeof item.title !== 'string' || !item.title.trim() || typeof item.link !== 'string' || !safeUrl(item.link)) return [];
  return [{ title: item.title, link: item.link, ...(typeof item.publisher === 'string' ? { publisher: item.publisher } : {}),
    ...(typeof item.providerPublishTime === 'number' || typeof item.providerPublishTime === 'string' || item.providerPublishTime instanceof Date ? { providerPublishTime: item.providerPublishTime } : {}) }];
}) : [];
const normalizeNewsResponse = (value: unknown): { news: SearchNews[] } => {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { news?: unknown }).news)) throw new Error('Online search response has no news list');
  const raw = (value as { news: unknown[] }).news;
  const news = validNews(raw);
  if (raw.length && !news.length) throw new Error('Online search returned no usable news');
  return { news };
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
    // Curated sources are part of the research policy and must invalidate a
    // fresh discovery cache when a newly required primary source is added.
    const key = JSON.stringify({ id: position.id, identity, knownSources: knownResearchSources(position) });
    const cached = cache.get(key);
    if (!options.forceRefresh && cached && cached.searchStatus === 'completed' && cached.fetchedAt <= now() && now() - cached.fetchedAt < ttl)
      return { ...cached, sources: cached.sources.map(source => ({ ...source, title: displayResearchSourceTitle(source) })), cacheStatus: 'reused' };
    let result: { news?: SearchNews[] } = {};
    let fallbackQuery: string | undefined;
    let searchStatus: DeterministicResearchResult['searchStatus'] = 'completed';
    let failureReason: DeterministicResearchResult['failureReason'];
    let failureStage: DeterministicResearchResult['failureStage'];
    let initialSucceeded = false;
    const search = async (value: string) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await Promise.race([
          client.search(value, { newsCount: 5, quotesCount: 1, enableFuzzyQuery: false, region: 'DE', lang: 'de-DE' }),
          new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Online search timeout')), 15000); }),
        ]);
        return normalizeNewsResponse(response);
      } catch (error) {
        // Yahoo can reject the whole response for an unrelated schema field.
        // Use only independently validated news from the response in that case.
        if (error instanceof Error && error.name === 'FailedYahooValidationError') {
          const raw = (error as Error & { result?: unknown }).result;
          return normalizeNewsResponse(raw);
        }
        throw error;
      } finally { if (timer) clearTimeout(timer); }
    };
    try {
      result = await search(query);
      initialSucceeded = true;
    } catch (error) {
      searchStatus = 'failed'; failureStage = 'search';
      failureReason = error instanceof Error && error.message === 'Online search timeout' ? 'timeout' : 'provider';
    }
    if ((!initialSucceeded || !(result.news ?? []).some(item => safeUrl(item.link))) && position.name.trim() && position.name.trim() !== query) {
      fallbackQuery = position.name.trim();
      try {
        result = await search(fallbackQuery);
        searchStatus = 'completed'; failureReason = undefined; failureStage = undefined;
      } catch (error) {
        searchStatus = 'failed'; failureStage = 'fallback';
        failureReason = error instanceof Error && error.message === 'Online search timeout' ? 'timeout' : 'provider';
      }
    }
    const sources: AnalysisSource[] = [];
    const add = (title: string, value: string) => {
      const url = safeUrl(value);
      if (url && !sources.some(source => source.url === url)) sources.push({ title: safeText(title, new URL(url).hostname), url });
    };
    for (const value of knownResearchSources(position)) add(researchLinkLabel(value), value);
    if (position.symbol.trim()) {
      const symbol = encodeURIComponent(position.symbol.trim());
      add(`Yahoo Finance: Historische Kurse für ${position.symbol} (Link ungeprüft)`, `https://finance.yahoo.com/quote/${symbol}/history/`);
      if (position.type === 'Stock') add(`Yahoo Finance: Analystendaten für ${position.symbol} (Link ungeprüft)`, `https://finance.yahoo.com/quote/${symbol}/analysis/`);
      if (position.type === 'ETF' || position.type === 'Fund') add(`Yahoo Finance: Fondsprofil für ${position.symbol} (Link ungeprüft)`, `https://finance.yahoo.com/quote/${symbol}/profile/`);
    }
    const news = (result.news ?? []).slice(0, 5);
    for (const item of news) add(`${safeText(item.publisher, 'Online-Quelle')}: ${safeText(item.title, position.name)}${timestamp(item.providerPublishTime) ? ` (${timestamp(item.providerPublishTime)})` : ''}`, item.link);
    const fetchedAt = now();
    const research: DeterministicResearchResult = {
      assetId: position.id, query, fetchedAt, searchStatus, newsCount: news.filter(item => !!safeUrl(item.link)).length, sources,
      ...(failureReason ? { failureReason, failureStage } : {}),
      text: `Asset ${position.id} (${position.name}): deterministische Online-Suche nach ${JSON.stringify(query)}${fallbackQuery ? ` und ${JSON.stringify(fallbackQuery)}` : ''} am ${new Date(fetchedAt).toISOString()}. ${searchStatus === 'completed' ? `${news.filter(item => !!safeUrl(item.link)).length} Nachrichtentreffer` : initialSucceeded ? 'Die erste Suche lieferte keine nutzbaren Nachrichten; die ergänzende Namenssuche ist fehlgeschlagen' : 'Die Nachrichtensuche ist fehlgeschlagen'}; ${sources.length} HTTPS-Links erfasst. Treffer sind Suchbelege und wurden nicht semantisch als Tatsachen oder Empfehlungen interpretiert.`,
    };
    if (searchStatus === 'completed') {
      cache.set(key, research);
      if (cache.size > 200) cache.delete(cache.keys().next().value!);
      try { save(); } catch { /* A valid online result survives a cache write failure. */ }
    }
    return { ...research, cacheStatus: 'fresh' };
  };
}
