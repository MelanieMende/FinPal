import type { AnalysisPosition } from './portfolioAnalysis';

// Discovery pointers, not cached financial figures or a claim that this is the latest filing.
const issuerHints: Record<string, { issuer: string; listing: string; sourceUrls: string[] }> = {
  LU3170240538: {
    issuer: 'Apollo Global Private Markets ELTIF, Klasse A2 UNH', listing: 'Nicht börslicher ELTIF; Broker-Preis und offizieller NAV sind getrennt zu prüfen',
    sourceUrls: ['https://www.apollo.com/agpm-eltif'],
  },
  CA03880B1040: {
    issuer: 'Arbor Metals Corp.', listing: 'TSXV: ABR; Frankfurt: 432',
    sourceUrls: [
      'https://arbormetalscorp.com/',
      'https://arbormetalscorp.com/news/arbor-metals-announces-adoption-of-semi-annual-reporting/',
      'https://arbormetalscorp.com/news/',
      'https://www.sedarplus.ca/',
      'https://cdn.financialreports.eu/financialreports/media/filings/46989/2026/RNS/46989_rns_2026-06-10_705e6e40-5c45-419b-96c0-21acf3219846.pdf',
    ],
  },
};

export const fundResearchInstructions = ' Für Fonds und insbesondere ELTIFs identifiziere die exakte Anteilsklasse per ISIN. Recherchiere den neuesten offiziell veröffentlichten NAV je Anteil mit NAV-Währung, Bewertungsstichtag, Veröffentlichungsdatum, Quelle und Bewertungsfrequenz. Veröffentlichungsdatum und Abrufdatum sind kein NAV-Stichtag. Broker-Kurse und deren Tick-Zeitpunkte sind kein Nachweis eines offiziellen Fonds-NAV. Wenn der aktuelle NAV oder sein Stichtag nicht öffentlich belegt werden kann, diese konkrete Lücke nennen; keinen NAV aus dem Broker-Kurs ableiten. Die Aktualität anhand des belegten Bewertungszyklus prüfen, nicht pauschal anhand einer 48-Stunden-Regel für Börsenkurse.';


export function buildResearchSecurities(positions: AnalysisPosition[]) {
  return positions.map(({ id, name, isin, symbol, type }) => {
    const hints = issuerHints[isin.trim().toUpperCase()];
    return { id, name, isin, symbol, type, ...(hints ? { discoveryHints: hints } : {}) };
  });
}

export const equityResearchInstructions = ' Für jede Aktie suche den neuesten verfügbaren Jahres- oder Zwischenabschluss und den zugehörigen Managementbericht (MD&A), direkt beim Emittenten oder im regulatorischen Register (z. B. SEDAR+ für Kanada). Eine Unternehmens-Startseite oder Projekt-Pressemitteilung allein reicht nicht als Finanzdatenquelle. Liefere je Asset-ID Berichtsperiode, Veröffentlichungsdatum, Berichtswährung, Prüfungsstatus und Direktquelle sowie verfügbare liquide Mittel, Verbindlichkeiten, operativen Cashflow, Umsatz, Gewinn/Verlust und Aktienanzahl. Nicht gefundene Werte offenlassen; fehlende Daten von nicht anwendbaren Kennzahlen unterscheiden. Bei Explorationsunternehmen ohne operativen Umsatz sind KGV und Umsatzmultiplikatoren möglicherweise nicht sinnvoll: priorisiere Finanzierungsbedarf, Liquidität, Explorationsausgaben, Kapitalerhöhungen, Warrants/Verwässerung, Going-Concern-Angaben und belegte Projektfortschritte. Suche auch Meldungen nach dem Bilanzstichtag; neue Finanzierungen getrennt berichten und den historischen Kassenbestand nicht als heutigen Bestand ausgeben. Bei fehlendem Bericht den angekündigten Berichtszyklus prüfen; Halbjahresberichterstattung bedeutet nicht automatisch einen fehlenden Quartalsbericht. discoveryHints sind lediglich Suchstartpunkte: Identität bestätigen, Dokument öffnen, nach neueren Berichten suchen, keine veralteten oder ungeprüften Zahlen als aktuell beziehungsweise geprüft ausgeben. Originalberichte und reproduzierbare Primärquellen haben Vorrang vor aggregierten Kennzahlen. Ausgabe pro Asset-ID klar trennen und ausdrücklich nennen, welche benötigten Informationen nach gezielter Suche fehlen.';
