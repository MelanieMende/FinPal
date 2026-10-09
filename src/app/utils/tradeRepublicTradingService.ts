import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { validateTradeDraft, type TradingAccount, type TradingStatus, type TradeDraft, type TradePreview, type TradeReceipt } from './tradeRepublicTrading';

export class TradingBrokerError extends Error {}
export interface TradingTransport { request(operation: string, data?: unknown): Promise<any>; close(): void; isClosed?(): boolean; }
export function tradingProcessTransport(process: {child: ChildProcessWithoutNullStreams; credentials?: {phone: string; pin: string}; session?: unknown; saveSession?(cookies: unknown): void; dispose(): void}): TradingTransport {
  let sequence = 0, buffer = '', closed = false;
  const pending = new Map<number, {resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>}>();
  const fail = () => { closed = true; for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Die Trade-Republic-Verbindung wurde unterbrochen.')); } pending.clear(); };
  process.child.on('error', fail); process.child.on('close', fail);
  process.child.stderr.on('data', () => {});
  process.child.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    if (buffer.length > 2000000) { process.dispose(); fail(); return; }
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const message = JSON.parse(line), item = pending.get(message.id);
        if (!item) continue;
        pending.delete(message.id); clearTimeout(item.timer);
        if (Object.prototype.hasOwnProperty.call(message, 'session')) {
          // Storage failure must not turn an acknowledged order into an unknown order.
          try { process.saveSession?.(message.session); } catch { /* Keep the broker result intact. */ }
        }
        if (message.error) {
          const code = typeof message.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(message.code) ? ' (' + message.code + ')' : '';
          const stages: Record<string, string> = {session: 'Sitzungsprüfung', accountPairs: 'Kontozuordnung', instrument: 'Wertpapierdaten', tickerV3: 'Kursabfrage', ticker: 'Kursabfrage', priceForOrderV2: 'handelbarer Kurs', orderFeesV2: 'Gebührenberechnung', availableCash: 'verfügbares Guthaben', availableSize: 'verkaufbare Anteile', simpleCreateOrder: 'Orderübermittlung', orders: 'Orderstatus', suitability: 'Handelsfreigabe', destinations: 'Bestpreis-Verfügbarkeit'};
          const stage = typeof message.stage === 'string' && stages[message.stage] ? ' (' + stages[message.stage] + ')' : '';
          if (message.error === 'BROKER_REJECTED') item.reject(new TradingBrokerError('Trade Republic hat die Anfrage' + stage + ' abgelehnt' + code + '.'));
          else if (message.stage === 'destinations' && message.code === 'SESSION_CONTEXT_MISSING') item.reject(new Error('Der Benutzerkontext der Trade-Republic-Sitzung fehlt. Bitte die gespeicherte Sitzung löschen und erneut verbinden.'));
          else item.reject(new Error('Trade Republic konnte die Anfrage' + stage + ' nicht bestätigen' + code + '. Anmeldung, Handelsfreigabe oder Antwortformat prüfen.'));
        }
        else item.resolve(message.result);
      } catch { /* Library stdout is not forwarded to the UI. */ }
    }
  });
  return {
    request(operation, data) { return new Promise((resolve, reject) => {
      if (closed || process.child.killed) { reject(new Error('Die Handelsverbindung ist geschlossen. Bitte erneut verbinden.')); return; }
      const id = ++sequence;
      const timer = setTimeout(() => { process.dispose(); fail(); }, 180000);
      pending.set(id, {resolve, reject, timer});
      if (operation === 'start' && process.credentials) { data = {phone: process.credentials.phone, pin: process.credentials.pin, session: process.session}; process.credentials = undefined; process.session = undefined; }
      process.child.stdin.write(JSON.stringify({id, operation, data}) + '\n', error => { if (error) { process.dispose(); fail(); } });
    }); },
    close() { process.dispose(); fail(); },
    isClosed() { return closed; },
  };
}
const numeric = (value: unknown): number | null => {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) return null;
  const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null;
};
const money = (value: any): number | null => value?.currency === 'EUR' ? numeric(value.amount) : null;
export function parseTradePreview(draft: TradeDraft, raw: any, now = Date.now()): Omit<TradePreview, 'id'> {
  const blockers: string[] = [];
  const instrument = raw?.instrument;
  const bestPrice = draft.exchange === 'TIB';
  const destination = bestPrice && Array.isArray(raw?.routing?.destinations) ? raw.routing.destinations.find((item: any) => item?.id === 'TIB' && item?.currencyId === 'EUR') : null;
  const instrumentExchange = Array.isArray(instrument?.exchanges) ? instrument.exchanges.find((item: any) => item?.slug === draft.exchange) : null;
  const directDestinationListed = (Array.isArray(instrument?.exchangeIds) && instrument.exchangeIds.includes(draft.exchange)) || !!instrumentExchange;
  const validDestination = bestPrice ? !!destination && destination.ongoingOutage !== true && !(draft.method === 'amount' && destination.open === false) : directDestinationListed && instrumentExchange?.active !== false;
  if (bestPrice && !validDestination) blockers.push('Bestpreis ist für dieses Wertpapier derzeit nicht vom Broker bestätigt.');
  else if (!bestPrice && !validDestination) blockers.push('Der gewählte Handelsplatz ist für dieses Wertpapier nicht in den Brokerdaten freigegeben.');
  const instrumentISIN = instrument?.isin ?? instrument?.id;
  if (instrumentISIN !== draft.isin) blockers.push('Die ISIN der Brokerantwort fehlt oder stimmt nicht mit dem gewählten Wertpapier überein.');
  if (!['stock', 'fund', 'etf'].includes(instrument?.typeId ?? instrument?.type)) blockers.push('Der Broker-Wertpapiertyp ist nicht als Aktie oder ETF bestätigt.');
  if (instrument?.active === false || instrument?.tradable === false) blockers.push('Trade Republic meldet dieses Wertpapier als nicht handelbar.');
  if (instrument?.tradedInPercent === true) blockers.push('In Prozent notierte Wertpapiere werden von dieser Handelsmaske nicht unterstützt.');
  const priceData = raw?.price;
  const price = numeric(priceData?.price);
  const tick = draft.side === 'buy' ? raw?.ticker?.ask : raw?.ticker?.bid;
  const tickPrice = tick?.price ?? (draft.side === 'buy' ? raw?.ticker?.askPrice : raw?.ticker?.bidPrice);
  const matchingTick = numeric(tickPrice) === price;
  const time = numeric(priceData?.time ?? (matchingTick ? (tick?.time ?? raw?.ticker?.time) : undefined));
  const quoteAsOf = time !== null && time > 946684800000 && time <= now ? new Date(time).toISOString() : null;
  if (!(price !== null && price > 0 && (priceData?.currency ?? raw?.requestedUnit) === 'EUR' && quoteAsOf && now - time! <= 60000)) blockers.push('Ein aktueller handelbarer EUR-Kurs mit Kurszeitpunkt fehlt.');
  // Unknown fee structures must never become an invented zero fee.
  const charges = raw?.fees?.fees;
  const values: (number | null)[] | null = Array.isArray(charges) && charges.length > 0 ? charges.map((charge: any) => charge?.absolute?.currency === 'EUR' ? numeric(charge.absolute.value) : null) : null;
  const feesEUR = money(raw?.fees?.totalFees) ?? (values && values.every(value => value !== null) ? Math.round(values.reduce((sum, value) => sum! + value!, 0)! * 100) / 100 : null);
  if (feesEUR === null) blockers.push('Die Gesamtkosten wurden von Trade Republic nicht eindeutig in EUR bestätigt.');
  const cash = Array.isArray(raw?.cash) ? raw.cash.find((item: any) => item.accountNumber === raw.cashAccountNumber) : raw?.cash;
  const cashEUR = money(cash) ?? (cash?.accountNumber === raw.cashAccountNumber && raw?.requestedUnit === 'EUR' ? numeric(cash?.amount) : null);
  const availableShares = numeric(raw?.size?.size);
  const isAmount = draft.method === 'amount';
  const estimatedShares = isAmount ? numeric(raw?.orderSize) : draft.quantity;
  if (isAmount) {
    const step = numeric(raw?.fractionalStep);
    if (instrument?.proprietaryTradable !== true) blockers.push(instrument?.proprietaryTradable === false ? 'Trade Republic meldet dieses Wertpapier als nicht für Betragsorders freigegeben.' : 'Die Broker-Freigabe für Betragsorders fehlt in den Wertpapierdaten.');
    else if (step === null || step <= 0) blockers.push('Die Bruchstück-Schrittweite fehlt in den Broker-Wertpapierdaten für diesen Handelsplatz.');
    else if (step >= 1) blockers.push('Die Broker-Wertpapierdaten erlauben an diesem Handelsplatz nur ganze Anteile.');
    else if (estimatedShares === null || estimatedShares <= 0) blockers.push('Für diesen Betrag konnte keine handelbare Bruchstückmenge ermittelt werden. Bitte Kurs und Mindestmenge prüfen.');
  }
  const limitValueEUR = isAmount ? draft.amountEUR : Math.round(draft.quantity * draft.limit * 100) / 100;
  if (draft.side === 'buy' && (cashEUR === null || feesEUR === null || cashEUR < limitValueEUR + feesEUR)) blockers.push('Ausreichendes verfügbares EUR-Guthaben ist nicht bestätigt.');
  if (draft.side === 'sell' && (availableShares === null || (isAmount ? price === null || price <= 0 || availableShares * price + 1e-8 < draft.amountEUR : availableShares < draft.quantity))) blockers.push('Ausreichende frei verkaufbare Anteile sind nicht bestätigt.');
  if (raw?.suitability?.instrumentId !== draft.isin || !Array.isArray(raw?.suitability?.warnings) || raw.suitability.warnings.some((warning: unknown) => warning !== 'appropriatenessTestingAppropriateUser') || (raw?.fees?.warnings?.length ?? 0) > 0) blockers.push('Die Handelsfreigabe ist nicht eindeutig bestätigt oder es bestehen Brokerhinweise.');
  return { draft, expiresAt: new Date(now + 30000).toISOString(), price, quoteAsOf, feesEUR, limitValueEUR, estimatedShares, cashEUR, availableShares, blockers,
    diagnostics: JSON.stringify({instrument: {isin: instrument?.isin, id: instrument?.id, active: instrument?.active, typeId: instrument?.typeId, type: instrument?.type, proprietaryTradable: instrument?.proprietaryTradable, fractionalStep: raw?.fractionalStep, exchangeIds: instrument?.exchangeIds, exchanges: Array.isArray(instrument?.exchanges) ? instrument.exchanges.map((item: any) => ({slug: item?.slug, active: item?.active})) : undefined}, routing: raw?.routing, price: raw?.price, fees: raw?.fees, size: raw?.size, suitability: raw?.suitability}, null, 2).slice(0, 16000) };
}

export function parseTradingAccounts(response: unknown): TradingAccount[] {
  if (!response || typeof response !== 'object' || !('accounts' in response) || !Array.isArray(response.accounts)) return [];
  const accounts = new Map<string, TradingAccount>();
  for (const item of response.accounts) {
    // DEFAULT is the regular brokerage product, not an account without securities.
    if (!item || item.currency !== 'EUR' || typeof item.securitiesAccountNumber !== 'string' || !item.securitiesAccountNumber.trim()
      || typeof item.cashAccountNumber !== 'string' || !item.cashAccountNumber.trim()) continue;
    const account: TradingAccount = {securitiesAccountNumber: item.securitiesAccountNumber, cashAccountNumber: item.cashAccountNumber, currency: 'EUR'};
    const previous = accounts.get(account.securitiesAccountNumber);
    if (previous && previous.cashAccountNumber !== account.cashAccountNumber) throw new Error('Trade Republic hat widersprüchliche Konto-Zuordnungen geliefert. Bitte erneut verbinden.');
    accounts.set(account.securitiesAccountNumber, account);
  }
  return [...accounts.values()];
}

export class TradeRepublicTradingService {
  private transport?: TradingTransport;
  private state: TradingStatus = {state: 'disconnected', requiresCode: false, accounts: []};
  private owner?: number;
  private busy = false;
  private previews = new Map<string, {owner: number; value: TradePreview}>();
  private readonly journal: string;
  private latestWarnings: string[] = [];
  constructor(dataPath: string, private readonly createTransport: () => Promise<TradingTransport>) { this.journal = path.join(dataPath, 'trade-republic-orders.json'); }
  status(owner: number): TradingStatus { if (this.transport?.isClosed?.()) this.disconnect(this.owner!); return this.owner === owner ? this.state : {state: 'disconnected', requiresCode: false, accounts: []}; }
  private records(): TradeReceipt[] {
    if (!fs.existsSync(this.journal)) return [];
    try { const values = JSON.parse(fs.readFileSync(this.journal, 'utf8')); if (!Array.isArray(values) || values.some(value => !['submitted', 'unknown', 'rejected'].includes(value.status))) throw new Error(); return values; }
    catch { throw new Error('Das lokale Orderprotokoll kann nicht gelesen werden. Eine erneute Order ist deshalb gesperrt.'); }
  }
  private save(records: TradeReceipt[]) { fs.mkdirSync(path.dirname(this.journal), {recursive: true}); const temp = this.journal + '.tmp'; fs.writeFileSync(temp, JSON.stringify(records), {mode: 0o600}); fs.renameSync(temp, this.journal); }
  async connect(owner: number, code?: string): Promise<TradingStatus> {
    if (this.busy) throw new Error('Eine Trade-Republic-Anfrage läuft bereits.');
    if (this.owner !== undefined && this.owner !== owner) throw new Error('Die Handelsverbindung ist in einem anderen Fenster geöffnet.');
    this.status(owner);
    this.busy = true;
    try {
      this.owner = owner;
      if (!this.transport) {
        this.transport = await this.createTransport();
        const result = await this.transport.request('start');
        if (result.resumed === true) {
          const accounts = parseTradingAccounts(result);
          if (!accounts.length) throw new Error('Die gespeicherte Sitzung hat kein eindeutiges EUR-Kontopaar geliefert. Bitte erneut verbinden.');
          this.state = {state: 'connected', requiresCode: false, accounts};
        } else this.state = {state: 'confirmation-required', requiresCode: result.requiresCode === true, accounts: []};
      } else if (this.state.state === 'confirmation-required') {
        if (this.state.requiresCode && !/^\d{6}$/.test(code || '')) throw new Error('Bitte den sechsstelligen Authenticator-Code eingeben.');
        const result = await this.transport.request('complete', {code});
        const accounts = parseTradingAccounts(result);
        if (!accounts.length) throw new Error('Trade Republic hat kein vollständiges EUR-Kontopaar aus Wertpapierkonto und Verrechnungskonto geliefert. Bitte erneut verbinden.');
        this.state = {state: 'connected', requiresCode: false, accounts};
      }
      return this.state;
    } catch (error) { this.disconnect(owner); throw error; }
    finally { this.busy = false; }
  }
  disconnect(owner: number) { if (this.owner !== owner) return; this.transport?.close(); this.transport = undefined; this.owner = undefined; this.previews.clear(); this.state = {state: 'disconnected', requiresCode: false, accounts: []}; }
  private account(owner: number, number: string): TradingAccount {
    if (this.status(owner).state !== 'connected') throw new Error('Bitte zuerst mit Trade Republic verbinden.');
    const account = this.state.accounts.find(a => a.securitiesAccountNumber === number);
    if (!account) throw new Error('Das gewählte Konto gehört nicht zur aktiven Anmeldung.');
    return account;
  }
  private async readPreview(owner: number, draft: TradeDraft): Promise<Omit<TradePreview, 'id'>> {
    const account = this.account(owner, draft.accountNumber);
    const raw = await this.transport!.request('preview', {...draft, cashAccountNumber: account.cashAccountNumber});
    this.latestWarnings = Array.isArray(raw?.suitability?.warnings) ? raw.suitability.warnings : [];
    return parseTradePreview(draft, {...raw, cashAccountNumber: account.cashAccountNumber});
  }
  async preview(owner: number, value: TradeDraft): Promise<TradePreview> {
    if (this.busy) throw new Error('Eine Trade-Republic-Anfrage läuft bereits.');
    const draft = validateTradeDraft(value);
    this.busy = true;
    try {
      const preview = {...await this.readPreview(owner, draft), id: crypto.randomUUID()};
      this.previews.clear(); this.previews.set(preview.id, {owner, value: preview}); return preview;
    } finally { this.busy = false; }
  }
  async submit(owner: number, id: string, confirmed: boolean): Promise<TradeReceipt> {
    if (confirmed !== true) throw new Error('Die Order muss ausdrücklich bestätigt werden.');
    const entry = this.previews.get(id);
    if (!entry || entry.owner !== owner) throw new Error('Diese Ordervorschau ist nicht mehr gültig.');
    if (this.busy) throw new Error('Eine Trade-Republic-Anfrage läuft bereits.');
    this.previews.delete(id);
    const preview = entry.value;
    if (preview.blockers.length || Date.parse(preview.expiresAt) <= Date.now()) throw new Error('Bitte eine vollständige neue Ordervorschau laden.');
    const records = this.records();
    if (records.some(record => record.status === 'unknown')) throw new Error('Eine frühere Order hat einen unklaren Status. Bitte zuerst den Orderstatus prüfen.');
    this.busy = true;
    try {
      const fresh = await this.readPreview(owner, preview.draft);
      if (fresh.blockers.length || fresh.feesEUR !== preview.feesEUR || Date.parse(preview.expiresAt) <= Date.now()) throw new Error('Kurs, Gebühren oder Handelsfreigabe haben sich geändert. Bitte erneut prüfen.');
      const receipt: TradeReceipt = {clientProcessId: crypto.randomUUID(), previewId: id, createdAt: new Date().toISOString(), isin: preview.draft.isin, side: preview.draft.side, ...(preview.draft.method === 'amount' ? {method: 'amount' as const, amountEUR: preview.draft.amountEUR} : {quantity: preview.draft.quantity}), accountNumber: preview.draft.accountNumber, status: 'unknown'};
      records.push(receipt); this.save(records); // Durable intent before the single network attempt.
      try {
        const result = await this.transport!.request('submit', {...preview.draft, clientProcessId: receipt.clientProcessId, price: preview.price, orderSize: fresh.estimatedShares, warningsShown: this.latestWarnings});
        if (typeof result?.orderId === 'string' && result.orderId.length > 0 && !result.error && !result.warnings?.length) { receipt.status = 'submitted'; receipt.orderId = result.orderId; }
      } catch (error) { if (error instanceof TradingBrokerError) { receipt.status = 'rejected'; receipt.message = error.message; } /* No automatic retries. */ }
      this.save(records); return receipt;
    } finally { this.busy = false; }
  }
  async orders(owner: number, accountNumber: string): Promise<{orders: unknown; receipts: TradeReceipt[]}> {
    this.account(owner, accountNumber);
    if (this.busy) throw new Error('Eine Trade-Republic-Anfrage läuft bereits.');
    this.busy = true;
    try {
      const orders = await this.transport!.request('orders', {accountNumber});
      const list = [orders?.active, orders?.terminated].flatMap(group => Array.isArray(group) ? group : Array.isArray(group?.items) ? group.items : []);
      const receipts = this.records();
      for (const receipt of receipts) {
        const matched = list.find((order: any) => receipt.accountNumber === accountNumber && order.clientProcessId === receipt.clientProcessId && typeof order.orderId === 'string');
        if (receipt.status === 'unknown' && matched) { receipt.status = 'submitted'; receipt.orderId = matched.orderId; }
      }
      this.save(receipts);
      return {orders, receipts: receipts.filter(receipt => receipt.accountNumber === accountNumber)};
    }
    finally { this.busy = false; }
  }
}
