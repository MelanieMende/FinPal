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
    const lowerText = text.toLowerCase();

    // 0. Skip cost information documents (regulatory requirements, not actual trades)
    if (lowerText.includes('kosteninformation')) {
      console.log('Skipping cost information document.');
      return null;
    }

    // 1. Determine Type
    let type: 'Buy' | 'Sell' | 'Dividend' | null = null;
    
    if (lowerText.includes('wertpapierabrechnung') || lowerText.includes('abrechnung') || lowerText.includes('order')) {
      if (lowerText.includes('kauf') || lowerText.includes('buy')) type = 'Buy';
      else if (lowerText.includes('verkauf') || lowerText.includes('sell')) type = 'Sell';
    } else if (lowerText.includes('dividendengutschrift') || lowerText.includes('dividende')) {
      type = 'Dividend';
    }

    if (!type) {
      if (lowerText.includes('buy') || lowerText.includes('kauf')) type = 'Buy';
      else if (lowerText.includes('sell') || lowerText.includes('verkauf')) type = 'Sell';
      else if (lowerText.includes('dividende')) type = 'Dividend';
    }

    if (!type) {
      console.warn('Could not determine Trade Republic document type.');
      return null;
    }

    // 2. Extract Date
    const dateMatch = text.match(/(?:Datum|Wertstellung|Valuta|Fälligkeit|am)\s+(\d{2}\.\d{2}\.\d{4})/i);
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
        assetName = lines[isinIndex - 1].trim();
        if (assetName.match(/POSITION|BETRAG|STÜCKE|WERTPAPIER|ÜBERSICHT/i) && isinIndex > 1) {
            assetName = lines[isinIndex - 2].trim();
        }
      }
    }
    assetName = assetName.replace(/ISIN:?.*$/i, '').trim();
    if (assetName.match(/POSITION|BETRAG|STÜCKE|WERTPAPIER|ÜBERSICHT/i)) assetName = 'Unknown Asset';

    // 5. Extract Shares, Price and Total from compact table lines
    // Example: 0,058139 Stk. 1.720,00 EUR 100,00 EUR
    const compactMatch = text.match(/([0-9.,]+)\s+(?:Stk\.|Stücke)\s+([0-9.,]+)\s+(?:EUR|USD)\s+([0-9.,]+)\s+(?:EUR|USD)/i);
    
    let shares = 0;
    let pricePerShare = 0;
    let totalAmountFromCompact = 0;

    if (compactMatch) {
        shares = this.parseNumber(compactMatch[1]);
        pricePerShare = this.parseNumber(compactMatch[2]);
        totalAmountFromCompact = this.parseNumber(compactMatch[3]);
    } else {
        const sharesMatch = text.match(/([0-9.,]+)\s+(?:Stk\.|Stücke)/i);
        shares = this.parseNumber(sharesMatch ? sharesMatch[1] : '0');

        const priceMatch = text.match(/(?:Kurs|Preis)\s+([0-9.,]+)\s+(?:EUR|USD)/i);
        pricePerShare = this.parseNumber(priceMatch ? priceMatch[1] : '0');
    }

    // 7. Extract Fee
    const feeMatch = text.match(/(?:Fremdkostenzuschlag|Provision|Gebühr)\s+([0-9.,-]+)\s+(?:EUR|USD)/i);
    const fee = feeMatch ? Math.abs(this.parseNumber(feeMatch[1])) : 0;

    // 8. Extract Tax
    let tax = 0;
    const taxMatches = text.matchAll(/(?:Kapitalertragsteuer|Solidaritätszuschlag|Kirchensteuer|Quellensteuer)\s+([0-9.,-]+)\s+(?:EUR|USD)/gi);
    for (const match of taxMatches) {
        tax += Math.abs(this.parseNumber(match[1]));
    }

    // 9. Extract Total Amount (Prefer EUR)
    let totalAmount = totalAmountFromCompact;
    if (totalAmount === 0) {
        const allTotalMatches = Array.from(text.matchAll(/(?:Gesamt|Betrag|Netto)\s+([0-9.,-]+)\s+(EUR|USD)/gi));
        if (allTotalMatches.length > 0) {
            const eurMatch = [...allTotalMatches].reverse().find(m => m[2] === 'EUR');
            if (eurMatch) {
                totalAmount = Math.abs(this.parseNumber(eurMatch[1]));
            } else {
                const lastMatch = allTotalMatches[allTotalMatches.length - 1];
                totalAmount = Math.abs(this.parseNumber(lastMatch[1]));
            }
        }
    }

    return {
      date,
      type: type as any,
      assetName,
      isin,
      shares,
      pricePerShare,
      fee,
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
