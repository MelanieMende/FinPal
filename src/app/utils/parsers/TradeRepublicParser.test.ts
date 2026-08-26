import { TradeRepublicParser } from './TradeRepublicParser';

describe('TradeRepublicParser', () => {
  it('parses a German buy statement', () => {
    const result = TradeRepublicParser.parse(`
      WERTPAPIERABRECHNUNG KAUF
      Datum 15.01.2024
      Wertpapier Apple Inc.
      ISIN: US0378331005
      Stück 10,0000 Stk.
      Kurs 180,50 EUR
      Fremdkostenzuschlag 1,00 EUR
      Gesamt 1.806,00 EUR
    `);

    expect(result).toMatchObject({
      date: '2024-01-15', type: 'Buy', assetName: 'Apple Inc.', isin: 'US0378331005',
      shares: 10, pricePerShare: 180.5, fee: 1, totalAmount: 1806,
    });
  });

  it('parses and sums taxes on a dividend statement', () => {
    const result = TradeRepublicParser.parse(`
      DIVIDENDENGUTSCHRIFT
      Wertstellung 15.02.2024
      Bezeichnung Microsoft Corp.
      ISIN US5949181045
      Stücke 5,0000 Stk.
      Kapitalertragsteuer -0,38 EUR
      Solidaritätszuschlag -0,02 EUR
      Gutschrift 2,10 EUR
    `);

    expect(result).toMatchObject({
      date: '2024-02-15', type: 'Dividend', isin: 'US5949181045', shares: 5,
      tax: 0.4, totalAmount: 2.1,
    });
  });

  it('ignores cost-information documents and incomplete statements', () => {
    expect(TradeRepublicParser.parse('Kosteninformation Kauf US0378331005')).toBeNull();
    expect(TradeRepublicParser.parse('Kauf Datum 15.01.2024 ISIN US0378331005')).toBeNull();
  });
});
