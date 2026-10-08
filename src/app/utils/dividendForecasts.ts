export interface DividendForecast {
  payDate: string;
  exDate?: string;
  amount: number;
  currency?: string;
  amountEUR?: number;
  eligibleShares?: number;
}
export function isDividendForecastAsset(asset: Asset): boolean {
  return Boolean(asset.isin) && asset.type !== 'Crypto' && (asset.current_shares > 0 || asset.current_shares_before_ex_date > 0);
}
export function needsDividendForecast(asset: Asset): boolean {
  return isDividendForecastAsset(asset) && !asset.dividendForecastRequested && asset.dividends === undefined && !asset.dividendForecastError;
}
export function calendarDate(value?: string): string | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day ? day : null;
}
export function todayDate(now = new Date()): string {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}
export function upcomingForecasts(dividends: DividendForecast[], today = todayDate()) {
  return dividends.filter(dividend => calendarDate(dividend.payDate) !== null && calendarDate(dividend.payDate)! >= today && Number.isFinite(dividend.amount) && dividend.amount > 0)
    .slice().sort((a, b) => a.payDate.localeCompare(b.payDate));
}
export function selectUpcomingPayments(assets: Asset[], today = todayDate()) {
  return (assets ?? []).flatMap(asset => upcomingForecasts(asset.dividends ?? [], today).flatMap(dividend => {
    const exDate = calendarDate(dividend.exDate);
    const shares = dividend.eligibleShares ?? (exDate && exDate > today ? asset.current_shares : exDate && exDate === calendarDate(asset.exDividendDate) ? asset.current_shares_before_ex_date : asset.current_shares) ?? 0;
    if (!(shares > 1e-8)) return [];
    const amount = dividend.amountEUR ?? dividend.amount;
    const currency = dividend.amountEUR !== undefined ? 'EUR' : dividend.currency;
    return [{ ...dividend, asset, shares, value: shares * amount, currency }];
  })).sort((a, b) => a.payDate.localeCompare(b.payDate));
}
