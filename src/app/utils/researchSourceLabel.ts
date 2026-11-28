import type { AnalysisSource } from './portfolioAnalysis';

/** A URL is a discovery hint; its host and path do not establish source provenance. */
export function researchLinkLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const location = `${parsed.pathname}${parsed.search}`;
    return `Bekannter Recherchelink: ${parsed.hostname}${location === '/' ? '' : location}`;
  } catch {
    return 'Bekannter Recherchelink';
  }
}

/** Older research caches used one generic title for every known URL. */
export function displayResearchSourceTitle(source: AnalysisSource): string {
  return source.title.startsWith('Bekannte Primärquelle für ') ? researchLinkLabel(source.url) : source.title;
}
