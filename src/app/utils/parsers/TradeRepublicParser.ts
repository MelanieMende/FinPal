import { parse, format } from 'date-fns';

export interface ParsedTransaction {
  id?: string;
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

export class TradeRepublicParser {
  static parse(text: string): ParsedTransaction | null {
    // 1. Determine Type
    let type: 'Buy' | 'Sell' | 'Dividend' | null = null;
    const lowerText = text.toLowerCase();
    if (lowerText.includes('wertpapierabrechnung') || lowerText.includes('abrechnung')) {
      if (lowerText.includes('kauf')) type = 'Buy';
      else if (lowerText.includes('verkauf')) type = 'Sell';
    } else if (lowerText.includes('dividendengutschrift') || lowerText.includes('dividende')) {
      type = 'Dividend';
    }

    if (!type) {
      // Fallback: check for keywords
      if (lowerText.includes('kauf')) type = 'Buy';
      else if (lowerText.includes('verkauf')) type = 'Sell';
      else if (lowerText.includes('dividende')) type = 'Dividend';
    }

    if (!type) {
      console.warn('Could not determine Trade Republic document type.');
      return null;
    }

    // 2. Extract Date
    const dateMatch = text.match(/(?:Datum|Wertstellung|Valuta|Fälligkeit)\s+(\d{2}\.\d{2}\.\d{4})/i);
    let date = dateMatch ? dateMatch[1] : '';
    if (date) {
      try {
        const parsedDate = parse(date, 'dd.MM.yyyy', new Date());
        date = format(parsedDate, 'yyyy-MM-dd');
      } catch (e) {
        console.error('Failed to parse date:', date);
      }
    }

    // 3. Extract ISIN
    const isinMatch = text.match(/(?:ISIN|Wertpapier-Kenn-Nr):\s*([A-Z0-9]{12})/i) || 
                      text.match(/\b([A-Z]{2}[A-Z0-9]{9}\d)\b/);
    const isin = isinMatch ? isinMatch[isinMatch.length - 1] : '';

    // 4. Extract Asset Name
    let assetName = 'Unknown Asset';
    const nameMatch = text.match(/(?:Wertpapier|Bezeichnung)\s+(.+)/i);
    if (nameMatch) {
      assetName = nameMatch[1].replace(isin, '').trim();
    } else if (isin) {
      const lines = text.split('\n');
      const isinIndex = lines.findIndex(l => l.includes(isin));
      if (isinIndex > 0) {
        // Try the line before ISIN
        assetName = lines[isinIndex - 1].trim();
        // If the line before ISIN is just some header, try the one before that
        if (assetName.match(/POSITION|BETRAG|STÜCKE/i) && isinIndex > 1) {
            assetName = lines[isinIndex - 2].trim();
        }
      }
    }
    // Clean up name
    assetName = assetName.replace(/ISIN:?.*$/i, '').trim();
    if (assetName === 'POSITION ANZAHL ERTRAG BETRAG') assetName = 'Unknown Asset';

    // 5. Extract Shares
    const sharesMatch = text.match(/([0-9.,]+)\s+(?:Stk\.|Stücke)/i);
    const shares = sharesMatch ? parseFloat(sharesMatch[1].replace(/\./g, '').replace(',', '.')) : 0;

    // 6. Extract Price per Share
    const priceMatch = text.match(/(?:Kurs|Preis)\s+([0-9.,]+)\s+(?:EUR|USD)/i);
    const pricePerShare = priceMatch ? parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.')) : 0;

    // 7. Extract Fee
    const feeMatch = text.match(/(?:Fremdkostenzuschlag|Provision|Gebühr)\s+([0-9.,]+)\s+(?:EUR|USD)/i);
    const fee = feeMatch ? parseFloat(feeMatch[1].replace(/\./g, '').replace(',', '.')) : 0;

    // 8. Extract Tax
    let tax = 0;
    const taxMatches = text.matchAll(/(?:Kapitalertragsteuer|Solidaritätszuschlag|Kirchensteuer|Quellensteuer)\s+([0-9.,-]+)\s+(?:EUR|USD)/gi);
    for (const match of taxMatches) {
        tax += Math.abs(this.parseNumber(match[1]));
    }

    // 9. Extract Total Amount (Prefer EUR)
    let totalAmount = 0;
    const allTotalMatches = Array.from(text.matchAll(/(?:Gesamt|Betrag|Netto)\s+([0-9.,-]+)\s+(EUR|USD)/gi));
    if (allTotalMatches.length > 0) {
        // Prefer the last EUR match if it exists
        const eurMatch = [...allTotalMatches].reverse().find(m => m[2] === 'EUR');
        if (eurMatch) {
            totalAmount = Math.abs(this.parseNumber(eurMatch[1]));
        } else {
            // Fallback to the last match
            const lastMatch = allTotalMatches[allTotalMatches.length - 1];
            totalAmount = Math.abs(this.parseNumber(lastMatch[1]));
        }
    }

    return {
      date,
      type: type as any,
      assetName,
      isin,
      shares: this.parseNumber(sharesMatch ? sharesMatch[1] : '0'),
      pricePerShare: this.parseNumber(priceMatch ? priceMatch[1] : '0'),
      fee: this.parseNumber(feeMatch ? feeMatch[1] : '0'),
      tax,
      totalAmount,
      rawText: text
    };
  }

  private static parseNumber(val: string): number {
    if (!val) return 0;
    const cleaned = val.trim();
    
    // If it contains both dot and comma, assume dot is thousands and comma is decimal (German)
    if (cleaned.includes('.') && cleaned.includes(',')) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    }
    
    // If it contains only a comma, it's the decimal separator
    if (cleaned.includes(',')) {
      return parseFloat(cleaned.replace(',', '.'));
    }
    
    // If it contains only a dot, and there's logic to think it's decimal (like 0.32)
    // In these PDFs, a single dot is almost always a decimal.
    return parseFloat(cleaned);
  }
}
