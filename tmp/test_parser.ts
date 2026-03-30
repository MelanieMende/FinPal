import { TradeRepublicParser } from '../src/app/utils/parsers/TradeRepublicParser';

const mockBuyText = `
ABRECHNUNG
Kauf
Datum 15.01.2024
Wertpapier Apple Inc.
ISIN: US0378331005
Stück 10,0000 Stk.
Kurs 180,50 EUR
Fremdkostenzuschlag 1,00 EUR
Gesamt 1.806,00 EUR
`;

const mockDividendText = `
DIVIDENDENGUTSCHRIFT
Dividende
Datum 15.02.2024
Wertpapier Microsoft Corp.
ISIN: US5949181045
Stück 5,0000 Stk.
Betrag 2,50 EUR
Kapitalertragsteuer 0,38 EUR
Solidaritätszuschlag 0,02 EUR
Gesamt 2,10 EUR
`;

console.log('Testing BUY Parser:');
const buyResult = TradeRepublicParser.parse(mockBuyText);
console.log(JSON.stringify(buyResult, null, 2));

console.log('\nTesting DIVIDEND Parser:');
const divResult = TradeRepublicParser.parse(mockDividendText);
console.log(JSON.stringify(divResult, null, 2));
