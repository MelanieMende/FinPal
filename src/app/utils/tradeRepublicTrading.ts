export interface TradingAccount { securitiesAccountNumber: string; cashAccountNumber: string; currency: 'EUR'; }
interface TradeBase { isin: string; assetType: 'Stock' | 'ETF'; side: 'buy' | 'sell'; exchange: string; accountNumber: string; }
export type TradeDraft = TradeBase & ({method: 'amount'; amountEUR: number; quantity?: never; limit?: never} | {method?: 'shares'; quantity: number; limit: number; amountEUR?: never});
export interface TradingStatus { state: 'disconnected' | 'confirmation-required' | 'connected'; requiresCode: boolean; accounts: TradingAccount[]; }
export interface TradePreview { id: string; draft: TradeDraft; expiresAt: string; price: number | null; quoteAsOf: string | null; feesEUR: number | null; limitValueEUR: number; estimatedShares?: number | null; cashEUR: number | null; availableShares: number | null; blockers: string[]; diagnostics: string; }
export interface TradeReceipt { clientProcessId: string; previewId: string; createdAt: string; isin: string; side: 'buy' | 'sell'; quantity?: number; amountEUR?: number; method?: 'amount' | 'shares'; accountNumber: string; status: 'submitted' | 'unknown' | 'rejected'; orderId?: string; message?: string; }
export function validateTradeDraft(value: TradeDraft): TradeDraft {
  const validMoney = (n: number, minimum: number) => Number.isFinite(n) && n >= minimum && n <= 1000000 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
  const amount = value?.method === 'amount';
  if (!value || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(value.isin) || !['Stock', 'ETF'].includes(value.assetType) || !['buy', 'sell'].includes(value.side)
    || (amount ? !validMoney(value.amountEUR, 1) || value.quantity !== undefined || value.limit !== undefined
      : (value.method !== undefined && value.method !== 'shares') || value.amountEUR !== undefined || !Number.isSafeInteger(value.quantity) || value.quantity <= 0 || value.quantity > 1000000 || !validMoney(value.limit, 0.01))
    || !['LSX', 'TDG', 'TIB', 'XETR', 'XMIL', 'XPAR', 'XWBO'].includes(value.exchange) || typeof value.accountNumber !== 'string') {
    throw new Error('Bitte eine Aktie oder einen ETF und entweder einen Betrag ab 1 EUR mit maximal zwei Nachkommastellen oder ganze Anteile mit positivem Limit angeben.');
  }
  const base = {isin: value.isin, assetType: value.assetType, side: value.side, exchange: value.exchange, accountNumber: value.accountNumber};
  return amount ? {...base, method: 'amount', amountEUR: value.amountEUR} : {...base, quantity: value.quantity, limit: value.limit};
}
