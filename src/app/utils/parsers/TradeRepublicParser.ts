export interface ParsedTransaction {
  date: string;
  type: 'Buy' | 'Sell' | 'Dividend';
  assetName: string;
  isin: string;
  shares: number;
  pricePerShare: number;
  fee: number;
  tax: number;
  totalAmount: number;
  rawText?: string;
}

/** Parser for German Trade Republic transaction PDFs. */
export class TradeRepublicParser {
  static parse(rawText: string): ParsedTransaction | null {
    const text = this.normalize(rawText);
    const lowerText = text.toLocaleLowerCase('de-DE');
    if (/kosteninformation|ex-ante kosteninformation/.test(lowerText)) return null;

    const type = this.findType(lowerText);
    if (!type) return null;

    const date = this.findDate(text);
    const isin = (text.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/i)?.[1] || '').toUpperCase();
    const assetName = this.findAssetName(text, isin);
    const compact = text.match(/([0-9][0-9.,]*)\s*(?:Stk\.?|Stück(?:e)?)\s+([0-9][0-9.,]*)\s*(?:EUR|€)\s+([+-]?[0-9][0-9.,]*)\s*(?:EUR|€)/i);
    const shares = compact
      ? this.parseNumber(compact[1])
      : this.numberAfter(text, /(?:Anzahl|Stück(?:e)?|Position)/i, /(?:Stk\.?|Stück(?:e)?)/i);
    let pricePerShare = compact
      ? this.parseNumber(compact[2])
      : this.numberAfter(text, /(?:Kurs|Preis)/i, /(?:EUR|€)/i);
    const fee = this.sumAmounts(text, /(?:Fremdkostenzuschlag|Provision|Ordergebühr|Gebühr)/gi);
    const tax = this.sumAmounts(text, /(?:Kapitalertragsteuer|Solidaritätszuschlag|Kirchensteuer|Quellensteuer)/gi);
    const totals = Array.from(text.matchAll(/(?:Gesamt|Endbetrag|Abrechnungsbetrag|Ausmachender Betrag|Netto|Gutschrift|Zahlung)\s*([+-]?[0-9][0-9.,]*)\s*(?:EUR|€)/gi));
    let totalAmount = totals.length
      ? Math.abs(this.parseNumber(totals[totals.length - 1][1]))
      : Math.abs(this.parseNumber(compact?.[3] || '0'));

    if (!totalAmount && type === 'Dividend') {
      const amount = text.match(/(?:Betrag|Ertrag)\s*([+-]?[0-9][0-9.,]*)\s*(?:EUR|€)/i);
      totalAmount = Math.abs(this.parseNumber(amount?.[1] || '0'));
    }
    if (!pricePerShare && shares && totalAmount && type !== 'Dividend') {
      pricePerShare = type === 'Sell'
        ? Math.max(0, (totalAmount + fee + tax) / shares)
        : Math.max(0, (totalAmount - fee - tax) / shares);
    }

    // Incomplete records must never reach the database silently.
    if (!date || !isin || !totalAmount || (type !== 'Dividend' && (!shares || !pricePerShare))) return null;
    return { date, type, assetName, isin, shares, pricePerShare, fee, tax, totalAmount, rawText };
  }

  private static normalize(value: string): string {
    return value
      .replace(/FÃ¤lligkeit/g, 'Fälligkeit').replace(/GebÃ¼hr/g, 'Gebühr')
      .replace(/SolidaritÃ¤tszuschlag/g, 'Solidaritätszuschlag')
      .replace(/StÃ¼ck(?:e)?/g, 'Stücke').replace(/Ãœ/g, 'Ü')
      .replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  }

  private static findType(text: string): ParsedTransaction['type'] | null {
    if (/dividendengutschrift|dividende|ertragsabrechnung/.test(text)) return 'Dividend';
    if (/verkauf|sell/.test(text)) return 'Sell';
    if (/kauf|buy/.test(text)) return 'Buy';
    return null;
  }

  private static findDate(text: string): string {
    const labelled = text.match(/(?:Datum|Wertstellung|Valuta|Fälligkeit|Schlusstag|Handelstag|Ausführung(?:stag)?|am)\D{0,20}(\d{2}\.\d{2}\.\d{4})/i);
    const candidate = labelled?.[1] || text.match(/\b(\d{2}\.\d{2}\.\d{4})\b/)?.[1];
    if (!candidate) return '';
    const [day, month, year] = candidate.split('.').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day));
    if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return '';
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  private static findAssetName(text: string, isin: string): string {
    const labelled = text.match(/(?:^|\n)\s*(?:Wertpapier|Bezeichnung)\s*:?[ \t]+([^\n\r]+)/im)?.[1];
    if (labelled) return labelled.replace(isin, '').replace(/\s{2,}.*$/, '').trim() || 'Unbekanntes Wertpapier';
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const isinIndex = lines.findIndex(line => line.toUpperCase().includes(isin));
    for (let index = isinIndex - 1; index >= Math.max(0, isinIndex - 3); index -= 1) {
      const line = lines[index];
      if (!/^(position|anzahl|kurs|betrag|isin|wertpapier)/i.test(line) && !/^\d/.test(line)) return line;
    }
    return 'Unbekanntes Wertpapier';
  }

  private static numberAfter(text: string, label: RegExp, suffix: RegExp): number {
    const match = text.match(new RegExp(`${label.source}\\s*:?\\s*([0-9][0-9.,]*)\\s*${suffix.source}`, 'i'));
    if (match) return this.parseNumber(match[1]);
    const fallback = text.match(new RegExp(`([0-9][0-9.,]*)\\s*${suffix.source}`, 'i'));
    return this.parseNumber(fallback?.[1] || '0');
  }

  private static sumAmounts(text: string, label: RegExp): number {
    const expression = new RegExp(`${label.source}\\s*([+-]?[0-9][0-9.,]*)\\s*(?:EUR|€)`, 'gi');
    return Array.from(text.matchAll(expression)).reduce((sum, match) => sum + Math.abs(this.parseNumber(match[1])), 0);
  }

  private static parseNumber(value: string): number {
    const cleaned = value.trim().replace(/\s/g, '');
    if (!cleaned) return 0;
    const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    const result = Number(normalized);
    return Number.isFinite(result) ? result : 0;
  }
}
