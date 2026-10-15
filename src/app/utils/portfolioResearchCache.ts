import fs from 'node:fs';
import path from 'node:path';
import type { AnalysisSource } from './portfolioAnalysis';
import type { buildResearchSecurities } from './portfolioResearch';

type Research = { text: string; sources: AnalysisSource[]; fetchedAt: number };
export const RESEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const RESEARCH_POLICY = 'forecast-currency-evidence-v4';
const fresh = (timestamp: number, now: number) => Number.isFinite(timestamp) && timestamp <= now && now - timestamp < RESEARCH_CACHE_TTL_MS;

/** Successful, sourced research is reusable for 24 hours, including after restart. */
export class PortfolioResearchCache {
  private readonly entries = new Map<string, Research>();
  constructor(private readonly file: string) {
    try {
      if (fs.statSync(file).size > 20_000_000) return;
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.entries)) return;
      for (const entry of saved.entries.slice(-200)) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [key, value] = entry;
        if (typeof key !== 'string' || !value || typeof value.text !== 'string' || !value.text.trim()
          || typeof value.fetchedAt !== 'number' || !fresh(value.fetchedAt, Date.now())
          || !Array.isArray(value.sources) || !value.sources.length || !value.sources.every((source: AnalysisSource) => {
            if (!source || typeof source.title !== 'string' || typeof source.url !== 'string') return false;
            try { const url = new URL(source.url); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
            catch { return false; }
          })) continue;
        this.entries.set(key, value);
      }
    } catch { /* Missing or damaged cache must not prevent startup. */ }
  }
  get(key: string): Research | undefined {
    const value = this.entries.get(key);
    if (value && fresh(value.fetchedAt, Date.now())) return value;
    this.entries.delete(key);
    return undefined;
  }
  findForSecurity(security: ReturnType<typeof buildResearchSecurities>[number]): Research | undefined {
    let latest: Research | undefined;
    for (const [key, value] of this.entries) {
      if (!fresh(value.fetchedAt, Date.now())) continue;
      try {
        const input = JSON.parse(key);
        if (input.researchPolicy === RESEARCH_POLICY && Array.isArray(input.securities)
          && input.securities.some((item: unknown) => JSON.stringify(item) === JSON.stringify(security))
          && (!latest || value.fetchedAt > latest.fetchedAt)) latest = value;
      } catch { /* Ignore unrelated or malformed legacy keys. */ }
    }
    return latest;
  }
  set(key: string, value: Research): void {
    for (const [existingKey, entry] of this.entries) {
      if (!fresh(entry.fetchedAt, Date.now())) this.entries.delete(existingKey);
    }
    this.entries.delete(key);
    if (this.entries.size >= 200) this.entries.delete(this.entries.keys().next().value);
    this.entries.set(key, value);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = this.file + '.tmp';
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, entries: [...this.entries] }), { mode: 0o600 });
      fs.renameSync(temporary, this.file);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  clear(): void {
    this.entries.clear();
    if (fs.existsSync(this.file)) fs.unlinkSync(this.file);
  }
}
