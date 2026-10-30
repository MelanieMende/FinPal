import type { AnalysisPosition } from './portfolioAnalysis';

// Discovery pointers, not cached financial figures or a claim that this is the latest filing.
const issuerHints: Record<string, { issuer: string; listing: string; sourceUrls: string[] }> = {
  DE0007030009: {
    issuer: 'Rheinmetall AG; Rheinmetall Group',
    listing: 'Xetra: RHM; ISIN laut Rheinmetall Investor Relations',
    sourceUrls: [
      'https://ir.rheinmetall.com/media/document/1bbcaadf-0e67-45bc-80df-bba822823824/assets/DE0007030009-Q2-2026-EQ-E-00.pdf',
      'https://ir.rheinmetall.com/media/document/214a8f96-a9e5-4296-9a89-e2b65122d258/assets/Rheinmetall-Annual-Report-2025.pdf',
    ],
  },
  DE0008232125: {
    issuer: 'Deutsche Lufthansa AG; Lufthansa Group',
    listing: 'Xetra: LHA; ISIN laut Lufthansa Group Investor Relations',
    sourceUrls: [
      'https://investor-relations.lufthansagroup.com/fileadmin/downloads/en/financial-reports/interims-reports/LH-QR-2026-2-e.pdf',
      'https://investor-relations.lufthansagroup.com/fileadmin/downloads/en/financial-reports/annual-reports/LH-AR-2025-e.pdf',
    ],
  },
  DE0008430026: {
    issuer: 'Münchener Rückversicherungs-Gesellschaft Aktiengesellschaft in München (Munich Re)',
    listing: 'Xetra: MUV2; Rückversicherer',
    sourceUrls: [
      'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2026-half-year-financial-report/MunichRe-Half-Year-Financial-Report-2026-en.pdf',
      'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2026-half-year-financial-report/MunichRe-Media-release-Q2-2026_en.pdf/_jcr_content/renditions/original./MunichRe-Media-release-Q2-2026_en.pdf',
      'https://www.munichre.com/content/dam/munichre/mrwebsiteslaunches/2025-annual-report/MunichRe-Group-Annual-Report-2025-en.pdf/_jcr_content/renditions/original./MunichRe-Group-Annual-Report-2025-en.pdf',
      'https://www.munichre.com/content/dam/munichre/contentlounge/website-pieces/documents/SFCR-Munich-Re-Group-2025.pdf/_jcr_content/renditions/original./SFCR-Munich-Re-Group-2025.pdf',
    ],
  },
  IE00B3WJKG14: {
    issuer: 'iShares S&P 500 Information Technology Sector UCITS ETF USD Acc', listing: 'Xetra: QDVE',
    sourceUrls: [
      'https://www.ishares.com/de/privatanleger/de/produkte/280510/ishares-sp-500-information-technology-sector-ucits-etf',
      'https://www.ishares.com/ch/professionals/en/literature/kiid/eu_priips-ishares-sp-500-information-technology-sector-ucits-etf-usd-acc-ch-ie00b3wjkg14-en.pdf?siteEntryPassthrough=true&switchLocale=y',
    ],
  },
  IE00B8GKDB10: {
    issuer: 'Vanguard FTSE All-World High Dividend Yield UCITS ETF USD Distributing', listing: 'Xetra: VGWD',
    sourceUrls: [
      'https://global.vanguard.com/de-de/investment-products/etf/equities/9506/ftse-all-world-high-dividend-yield-ucits-etf-usd-distributing',
      'https://fund-docs.vanguard.com/FTSE_All-World_High_Dividend_Yield_UCITS_ETF_USD_Distributing_9506_NETH_INT_EN.pdf',
      'https://fund-docs.vanguard.com/ie00b8gkdb10_priipskid_en.pdf',
    ],
  },
  US5801351017: {
    issuer: "McDonald's Corporation", listing: 'NYSE: MCD; SEC CIK 0000063908',
    sourceUrls: [
      'https://www.sec.gov/Archives/edgar/data/63908/000006390826000035/mcd-20251231.htm',
      'https://www.sec.gov/Archives/edgar/data/63908/000006390826000073/mcd-20260630.htm',
    ],
  },
  US47759T1007: {
    issuer: 'JinkoSolar Holding Co., Ltd.; ADR', listing: 'NYSE: JKS; SEC CIK 0001481513',
    sourceUrls: [
      'https://www.sec.gov/Archives/edgar/data/1481513/000110465926050737/jks-20251231x20f.htm',
      'https://ir.jinkosolar.com/news-releases/news-release-details/jinkosolar-announces-second-quarter-2026-financial-results',
      'https://www.sec.gov/Archives/edgar/data/1481513/000110465926116605/tm2627736d1_ex99-1.htm',
    ],
  },
  US912810SQ22: {
    issuer: 'United States Treasury; CUSIP 912810SQ2; 1,125 %; Fälligkeit 15.08.2040',
    listing: 'WKN A281P1; Frankfurt (XFRA) und Stuttgart (XSTU); Prozentnotierung in USD',
    sourceUrls: [
      'https://www.boerse-stuttgart.de/en/products/bonds/stuttgart/a281p1-united-states-of-america-dl-notes-2020-40/',
      'https://api.boerse-frankfurt.de/v1/data/price_information/single?isin=US912810SQ22',
      'https://www.treasurydirect.gov/instit/annceresult/press/preanre/2020/R_20200819_3.pdf',
      'https://www.treasurydirect.gov/instit/annceresult/press/preanre/2020/A_20201015_1.pdf',
      'https://www.treasurydirect.gov/research-center/history-of-marketable-securities/',
      'https://www.treasurydirect.gov/marketable-securities/',
      'https://www.treasurydirect.gov/marketable-securities/selling-marketable-securities/',
    ],
  },
  LU3170240538: {
    issuer: 'Apollo Global Private Markets ELTIF, Klasse A2 UNH', listing: 'Nicht börslicher ELTIF; Broker-Preis und offizieller NAV sind getrennt zu prüfen',
    sourceUrls: ['https://www.apollo.com/agpm-eltif'],
  },
  CA03880B1040: {
    issuer: 'Arbor Metals Corp.', listing: 'TSXV: ABR; Frankfurt: 432; Yahoo Finance: ABR.V (TSXV, CAD; zusätzliche Recherchekennung)',
    sourceUrls: [
      'https://arbormetalscorp.com/',
      'https://finance.yahoo.com/quote/ABR.V/analysis/',
      'https://finance.yahoo.com/quote/ABR.V/history/',
      'https://arbormetalscorp.com/news/arbor-metals-announces-adoption-of-semi-annual-reporting/',
      'https://arbormetalscorp.com/news/',
      'https://www.sedarplus.ca/',
      'https://cdn.financialreports.eu/financialreports/media/filings/46989/2026/RNS/46989_rns_2026-06-10_705e6e40-5c45-419b-96c0-21acf3219846.pdf',
      'https://cdn.financialreports.eu/financialreports/media/filings/46989/2026/RNS/46989_rns_2026-06-10_e4ebb3a3-86bd-496c-bbec-8c980d358494.pdf',
      'https://cdn.financialreports.eu/financialreports/media/filings/46989/2026/RNS/46989_rns_2026-02-21_ac4032f4-a922-4eef-aac8-50a80bea9e26.pdf',
    ],
  },
};

export function knownResearchSources(position: Pick<AnalysisPosition, 'isin'>) {
  return issuerHints[position.isin.trim().toUpperCase()]?.sourceUrls ?? [];
}

export const fundResearchInstructions = ' Für jeden Fonds und ETF identifiziere die exakte Anteilsklasse per ISIN und prüfe aktuelle offizielle Produktunterlagen. Für eine mögliche Kaufposition müssen Anlageziel und Index, Replikationsart, laufende Kosten, Fondsgröße, Liquiditätsmerkmale, Konzentration der größten Positionen und Sektoren, Wertpapierleihe/Derivate, Währungsabsicherung sowie wesentliche Produkt- oder regulatorische Risiken anhand von Emittentenunterlagen belegt beurteilt werden. Prüfe die Risiken auf Produktebene; Unternehmensmerkmale einzelner Indexmitglieder sind keine Fondsmerkmale. Ein Ergebnis ohne belegtes Warnmerkmal benötigt ebenfalls eine aktuelle offizielle Produktquelle. Für Fonds und insbesondere ELTIFs recherchiere zusätzlich den neuesten offiziell veröffentlichten NAV je Anteil mit NAV-Währung, Bewertungsstichtag, Veröffentlichungsdatum, Quelle und Bewertungsfrequenz. Veröffentlichungsdatum und Abrufdatum sind kein NAV-Stichtag. Broker-Kurse und deren Tick-Zeitpunkte sind kein Nachweis eines offiziellen Fonds-NAV. Wenn der aktuelle NAV oder sein Stichtag nicht öffentlich belegt werden kann, diese konkrete Lücke nennen; keinen NAV aus dem Broker-Kurs ableiten. Die Aktualität anhand des belegten Bewertungszyklus prüfen, nicht pauschal anhand einer 48-Stunden-Regel für Börsenkurse.';


export const bondResearchInstructions = ' Für Anleihen suche gezielt mit der exakten ISIN beziehungsweise CUSIP auf den Instrumentseiten der Börsen (insbesondere Frankfurt und Stuttgart) und beim Emittenten. discoveryHints sind Suchstartpunkte, keine aktuellen Kursdaten: Identität und Datum der geöffneten Quelle bestätigen. Allgemeine Glossare oder alte Emissions-/Rückkaufmitteilungen belegen keine aktuellen Kurse, Stückzinsen oder YTM. Liefere verfügbare Kurse mit Währung, Prozentnotierung, Handelsplatz, Kurszeitpunkt und explizit belegter Clean-/Dirty-Einordnung; außerdem Rendite bis Fälligkeit mit zugehörigem Berechnungskurs und -datum sowie Stückzinsen mit Einheit und Abrechnungsstichtag. Falls ein Stichtag fehlt, dies nennen. Werte verschiedener Handelsplätze oder Tage getrennt ausweisen und nicht zu einem scheinbar aktuellen Datensatz kombinieren. Historische Auktionsrenditen und aus Zinskurven modellierte Preise sind keine aktuellen handelbaren Kurse. Stammdaten, aktuelle Kursbelege und ergänzende Kennzahlen getrennt berichten; fehlende Einzelkennzahlen machen vorhandene Kursbelege nicht ungültig.';

export const bondAnalysisInstructions = ' Bei Anleihen den gelieferten lokalen Bewertungskurs in quote mit Quelle, quoteAsOf, Handelsplatz, Originalwährung, Prozentnotierung, FX-Nachweis und bestätigtem bondHolding auswerten. Ein vorhandener nachvollziehbarer Bewertungskurs darf nicht allein wegen fehlender zweiter Webquelle als fehlend dargestellt werden. Fehlende aktuelle YTM, Stückzinsen oder eine nicht belegte Clean-/Dirty-Einordnung allein erzwingen kein Prüfen: Eine belegte qualitative Beurteilung von Halten, Zinsänderungsrisiko, Währungsrisiko und Portfolioeignung bleibt möglich. Für Kaufen oder Verkaufen prüfen, ob diese Lücken die konkrete Richtung oder den berechneten Betrag wesentlich unsicher machen; dann Prüfen mit dem konkreten Hindernis wählen. Keine exakte Gesamtrendite, Abrechnungssumme oder ausführbare Order aus unvollständigen Daten ableiten. Bei fehlendem gültigem Bewertungskurs, fehlender notwendiger FX-Umrechnung, ungeklärter Identität oder widersprüchlichen Bestandseinheiten weiterhin Prüfen wählen. Tatsächlich veraltete Kurse gemäß quoteFreshness nicht als aktuell darstellen. Keine bestimmte Aktion erzwingen und fehlende Kennzahlen transparent als Einschränkung nennen.';

export const currencyExposureResearchInstructions = ' Recherchiere die wirtschaftliche Währungsexposition getrennt von Handels-, Bewertungs- und Fondswährung. Für Fonds und ETFs die exakte ISIN/Anteilsklasse in aktuellen offiziellen Factsheets, Bestandsberichten und Angaben zur Währungsabsicherung prüfen: belegte Währungsaufteilung der zugrundeliegenden Anlagen, Datenstichtag, Abdeckung, Methodik, Absicherungsziel und verbleibende Risiken nennen. Länder- oder Branchengewichte sind keine Währungsgewichte; auch eine Bestandswährungsaufteilung ist ohne Absicherungsdaten keine exakte Netto-Währungsrisiko-Allokation. Hedged im Namen allein genügt nicht. Bei Aktien verfügbare Umsatz-/Kostenwährungen, regionale Umsätze und Absicherungsangaben aus Unternehmensberichten qualitativ auswerten; geografische Umsätze nicht in exakte Währungsrisiko-Prozente umdeuten. Bei direkten Anleihen die Nominal-/Zahlungswährung belegen. Bei Krypto keine USD-Exposition allein aus einem USD-Kurs ableiten. Je Asset konkrete Belege mit Datum oder die konkret fehlenden Angaben liefern. Keine pauschale Unbekannt-Aussage über alle Positionen, wenn einzelne Daten belegt sind. Eine vollständige Portfolio-Währungsrisiko-Allokation nur bei vergleichbaren, ausreichend abgedeckten Daten ableiten; keine Werte oder Absicherungen erfinden.';

export const currencyExposureAnalysisInstructions = ' currencyExposure beschreibt ausschließlich die lokal gelieferte Datengrundlage: unknown bedeutet keine lokal strukturierte wirtschaftliche Währungsexposition, nicht automatisch fehlende Webbelege. Ergänze sie anhand der gelieferten Recherche und nenne belegte Erkenntnisse je Position samt Quellen und Stichtag. kind direct-nominal bezeichnet die bestätigte Nominal-/Zahlungswährung einer direkten Anleihe; sie darf nicht als unbekannt dargestellt werden, belegt aber keine vollständige Netto-Risikoquote oder Absicherung. Bei Aktien, ETFs und Fonds Handelswährung, ISIN-Land, Fondswährung oder geografische Umsätze nicht mit wirtschaftlicher Währungsexposition gleichsetzen. Vorhandene recherchierte Daten auswerten und nur die verbleibenden konkreten Lücken nennen. Keine pauschale Warnung für alle Positionen allein wegen unknown. Eine fehlende exakte Portfolio-Währungsrisiko-Allokation ist eine Einschränkung der Quantifizierung, nicht allein ein Grund für die Aktion Prüfen. Belegte wesentliche Fremdwährungsrisiken bleiben in risk/warnings zu nennen.';

export function buildResearchSecurities(positions: Pick<AnalysisPosition, 'id' | 'name' | 'isin' | 'symbol' | 'type'>[]) {
  return positions.map(({ id, name, isin, symbol, type }) => {
    const hints = issuerHints[isin.trim().toUpperCase()];
    return { id, name, isin, symbol, type, ...(hints ? { discoveryHints: hints } : {}) };
  });
}

export const equityResearchInstructions = ' Für jede Aktie suche den neuesten verfügbaren Jahres- oder Zwischenabschluss und den zugehörigen Managementbericht (MD&A), direkt beim Emittenten oder im regulatorischen Register (z. B. SEDAR+ für Kanada). Prüfe für jede mögliche Kaufposition ausdrücklich die Risikofaktoren des neuesten Jahresberichts und wesentliche Änderungen im neuesten Zwischenbericht. Ordne mit Primärquellen ein, ob Verlustlage, erhebliches Margenproblem, akutes Finanzierungsproblem, Going-Concern-Unsicherheit oder ein entscheidungsrelevantes regulatorisches Risiko belegt ist. Gewöhnliche Verschuldung oder allgemeine Emittenten-Risikotexte allein sind kein akutes Finanzierungsproblem; begründe auch ein Ergebnis ohne solche Warnmerkmale mit Kennzahlen zu Ertrag, Cashflow, Liquidität und Finanzierung. Eine Unternehmens-Startseite oder Projekt-Pressemitteilung allein reicht nicht als Finanzdatenquelle. Liefere je Asset-ID Berichtsperiode, Veröffentlichungsdatum, Berichtswährung, Prüfungsstatus und Direktquelle sowie verfügbare liquide Mittel, Verbindlichkeiten, operativen Cashflow, Umsatz, Gewinn/Verlust und Aktienanzahl. Nicht gefundene Werte offenlassen; fehlende Daten von nicht anwendbaren Kennzahlen unterscheiden. Bei Explorationsunternehmen ohne operativen Umsatz sind KGV und Umsatzmultiplikatoren möglicherweise nicht sinnvoll: priorisiere Finanzierungsbedarf, Liquidität, Explorationsausgaben, Kapitalerhöhungen, Warrants/Verwässerung, Going-Concern-Angaben und belegte Projektfortschritte. Suche auch Meldungen nach dem Bilanzstichtag; neue Finanzierungen getrennt berichten und den historischen Kassenbestand nicht als heutigen Bestand ausgeben. Bei fehlendem Bericht den angekündigten Berichtszyklus prüfen; Halbjahresberichterstattung bedeutet nicht automatisch einen fehlenden Quartalsbericht. discoveryHints sind lediglich Suchstartpunkte: Identität bestätigen, Dokument öffnen, nach neueren Berichten suchen, keine veralteten oder ungeprüften Zahlen als aktuell beziehungsweise geprüft ausgeben. Originalberichte und reproduzierbare Primärquellen haben Vorrang vor aggregierten Kennzahlen. Ausgabe pro Asset-ID klar trennen und ausdrücklich nennen, welche benötigten Informationen nach gezielter Suche fehlen.';
