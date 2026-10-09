/** @jest-environment node */
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { TradeRepublicTradingService, TradingBrokerError, tradingProcessTransport, parseTradePreview, parseTradingAccounts, type TradingTransport } from './tradeRepublicTradingService';
import { validateTradeDraft, type TradeDraft } from './tradeRepublicTrading';
const draft: TradeDraft = {isin: 'US0378331005', assetType: 'Stock', side: 'buy', quantity: 2, limit: 100, exchange: 'LSX', accountNumber: 'SEC1'};
const raw = () => ({instrument: {typeId: 'stock', isin: draft.isin, exchangeIds: ['LSX']}, requestedUnit: 'EUR', ticker: {ask: {price: '99', time: Date.now()}, bid: {price: '98', time: Date.now()}}, price: {price: '99'}, fees: {fees: [{type: 'EXTERNAL_FEE', absolute: {value: '1', currency: 'EUR'}}]}, cashAccountNumber: 'CASH1', cash: {accountNumber: 'CASH1', amount: '1000', currency: 'EUR'}, size: {size: '10'}, suitability: {instrumentId: draft.isin, warnings: ['appropriatenessTestingAppropriateUser']}});
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-trade-test-')); });
afterEach(() => { if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(dir).startsWith('finpal-trade-test-')) throw new Error('Unexpected test path'); fs.rmSync(dir, {recursive: true, force: true}); });
async function setup() {
  const request = jest.fn(async (operation: string): Promise<any> => {
    if (operation === 'start') return {requiresCode: false};
    if (operation === 'complete') return {accounts: [{currency: 'EUR', productType: 'DEFAULT', securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1'}]};
    if (operation === 'preview') return raw();
    if (operation === 'submit') return {orderId: 'ORDER1'};
    return {active: {items: []}, terminated: {items: []}};
  });
  const transport: TradingTransport = {request, close: jest.fn()};
  const service = new TradeRepublicTradingService(dir, async () => transport);
  await service.connect(7); await service.connect(7);
  return {service, request, transport};
}
it.each([{quantity: 0}, {quantity: 0.5}, {quantity: Infinity}, {limit: -1}, {limit: 1.123}, {exchange: 'INVALID'}, {isin: 'INVALID'}, {assetType: 'Bond'}])('rejects invalid draft %p', change => {
  expect(() => validateTradeDraft({...draft, ...change} as TradeDraft)).toThrow();
});
it('parses broker charges, matching tick time and available balances', () => {
  expect(parseTradePreview(draft, raw())).toMatchObject({feesEUR: 1, price: 99, cashEUR: 1000, availableShares: 10, limitValueEUR: 200, blockers: []});
});
it.each(['stale', 'mismatched', 'unknown fees', 'wrong currency', 'wrong isin', 'insufficient cash', 'warning', 'missing suitability', 'unknown exchange'])('blocks unsafe preview: %s', mode => {
  const data: any = raw();
  if (mode === 'stale') data.ticker.ask.time -= 61000;
  if (mode === 'mismatched') data.ticker.ask.price = '100';
  if (mode === 'unknown fees') data.fees = {};
  if (mode === 'wrong currency') data.fees.fees[0].absolute.currency = 'USD';
  if (mode === 'wrong isin') data.instrument.isin = 'US5801351017';
  if (mode === 'insufficient cash') data.cash.amount = '200';
  if (mode === 'warning') data.suitability.warnings = ['appropriatenessTestingNotSuitable'];
  if (mode === 'missing suitability') delete data.suitability;
  if (mode === 'unknown exchange') data.instrument.exchangeIds = [];
  expect(parseTradePreview(draft, data).blockers.length).toBeGreaterThan(0);
});
it('checks broker available shares for sells independently of local holdings', () => {
  const data = raw(); data.price.price = '98'; data.size.size = '1';
  expect(parseTradePreview({...draft, side: 'sell'}, data).blockers).toContain('Ausreichende frei verkaufbare Anteile sind nicht bestätigt.');
});
it('does not submit on login or preview and requires confirmation from the owning window', async () => {
  const {service, request} = await setup();
  const preview = await service.preview(7, draft);
  expect(request.mock.calls.some(([operation]) => operation === 'submit')).toBe(false);
  await expect(service.submit(8, preview.id, true)).rejects.toThrow();
  await expect(service.submit(7, preview.id, false)).rejects.toThrow();
  expect(request.mock.calls.some(([operation]) => operation === 'submit')).toBe(false);
});
it('writes durable intent before sending, rechecks preview, and submits only once', async () => {
  const {service, request} = await setup();
  request.mockImplementation(async (operation, data?: any) => {
    if (operation === 'preview') return raw();
    if (operation === 'submit') {
      const records = JSON.parse(fs.readFileSync(path.join(dir, 'trade-republic-orders.json'), 'utf8'));
      expect(records[0]).toMatchObject({status: 'unknown', clientProcessId: data.clientProcessId});
      expect(data).toMatchObject({isin: draft.isin, side: 'buy', quantity: 2, limit: 100, warningsShown: ['appropriatenessTestingAppropriateUser']});
      return {orderId: 'ORDER1'};
    }
  });
  const preview = await service.preview(7, draft);
  expect((await service.submit(7, preview.id, true)).status).toBe('submitted');
  await expect(service.submit(7, preview.id, true)).rejects.toThrow();
  expect(request.mock.calls.filter(([operation]) => operation === 'submit')).toHaveLength(1);
});
it('expires previews and rechecks changed fees without sending orders', async () => {
  const {service, request} = await setup();
  const preview = await service.preview(7, draft);
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(preview.expiresAt));
  await expect(service.submit(7, preview.id, true)).rejects.toThrow(); clock.mockRestore();
  const next = await service.preview(7, draft);
  request.mockImplementation(async () => { const data = raw(); data.fees.fees[0].absolute.value = '2'; return data; });
  await expect(service.submit(7, next.id, true)).rejects.toThrow();
  expect(request.mock.calls.some(([operation]) => operation === 'submit')).toBe(false);
});
it('persists an uncertain outcome across restarts and never retries automatically', async () => {
  const {service, request} = await setup();
  const preview = await service.preview(7, draft);
  request.mockImplementation(async operation => { if (operation === 'submit') throw new Error('Network timeout'); return raw(); });
  expect((await service.submit(7, preview.id, true)).status).toBe('unknown');
  const {service: restarted, request: secondRequest} = await setup();
  const second = await restarted.preview(7, draft);
  await expect(restarted.submit(7, second.id, true)).rejects.toThrow('unklaren Status');
  expect(request.mock.calls.filter(([operation]) => operation === 'submit')).toHaveLength(1);
  expect(secondRequest.mock.calls.some(([operation]) => operation === 'submit')).toBe(false);
});
it('keeps unknown submissions blocked unless exact broker process id reconciles them', async () => {
  const {service, request} = await setup();
  const preview = await service.preview(7, draft);
  request.mockImplementation(async operation => { if (operation === 'submit') return {}; return raw(); });
  const receipt = await service.submit(7, preview.id, true);
  request.mockResolvedValue({active: {items: [{clientProcessId: receipt.clientProcessId, orderId: 'MATCH'}]}, terminated: {items: []}});
  expect((await service.orders(7, 'SEC1')).receipts[0]).toMatchObject({status: 'submitted', orderId: 'MATCH'});
});

it('records definitive broker rejections without treating them as uncertain executions', async () => {
  const {service, request} = await setup();
  const preview = await service.preview(7, draft);
  request.mockImplementation(async operation => { if (operation === 'submit') throw new TradingBrokerError('Trade Republic hat die Anfrage abgelehnt (INVALID_LIMIT).'); return raw(); });
  const receipt = await service.submit(7, preview.id, true);
  expect(receipt.status).toBe('rejected');
  expect(receipt.message).toContain('INVALID_LIMIT');
});

it('matches current tickerV3 side prices without substituting message reception time', () => {
  const data: any = raw(); data.ticker = {time: Date.now(), bidPrice: '98', askPrice: '99'};
  expect(parseTradePreview(draft, data).blockers).toEqual([]);
  data.ticker.time = undefined;
  expect(parseTradePreview(draft, data).blockers).toContain('Ein aktueller handelbarer EUR-Kurs mit Kurszeitpunkt fehlt.');
});

it('passes credentials only once on the private pipe and does not surface broker error payloads', async () => {
  const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = {write: jest.fn()};
  const process = {child, credentials: {phone: '+49123456789', pin: '1234'}, dispose: jest.fn()};
  const transport = tradingProcessTransport(process);
  const start = transport.request('start');
  const sent = JSON.parse(child.stdin.write.mock.calls[0][0]);
  expect(sent.data).toEqual({phone: '+49123456789', pin: '1234'});
  expect(process.credentials).toBeUndefined();
  child.stdout.emit('data', Buffer.from(JSON.stringify({id: sent.id, result: {requiresCode: false}}) + '\n'));
  await start;
  const next = transport.request('preview', draft);
  const request = JSON.parse(child.stdin.write.mock.calls[1][0]);
  expect(request.data).not.toHaveProperty('pin');
  const rejected = expect(next).rejects.toThrow('Trade Republic konnte die Anfrage');
  child.stdout.emit('data', Buffer.from(JSON.stringify({id: request.id, error: 'BROKER_REQUEST_FAILED', detail: 'secret-cookie-do-not-leak'}) + '\n'));
  await rejected; transport.close();
});

it('recognizes DEFAULT as the ordinary EUR securities account and retains its exact cash pairing', () => {
  const standard = {productType: 'DEFAULT', currency: 'EUR', securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1'};
  expect(parseTradingAccounts({accounts: [standard, standard,
    {productType: 'DEFAULT', currency: 'EUR', cashAccountNumber: 'CASH_ONLY'},
    {...standard, currency: 'USD', securitiesAccountNumber: 'USD_SEC'},
    {...standard, securitiesAccountNumber: ''}, {...standard, cashAccountNumber: ' '}
  ]})).toEqual([{securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1', currency: 'EUR'}]);
});
it('retains multiple valid EUR securities accounts for explicit selection', () => {
  expect(parseTradingAccounts({accounts: [
    {productType: 'DEFAULT', currency: 'EUR', securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1'},
    {productType: 'BROKERAGE', currency: 'EUR', securitiesAccountNumber: 'SEC2', cashAccountNumber: 'CASH2'}
  ]})).toHaveLength(2);
});
it('rejects contradictory pairings and malformed account responses instead of guessing an account', () => {
  expect(() => parseTradingAccounts({accounts: [
    {currency: 'EUR', securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1'},
    {currency: 'EUR', securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH2'}
  ]})).toThrow('widersprüchliche');
  expect(parseTradingAccounts({accounts: {}})).toEqual([]);
  expect(parseTradingAccounts(null)).toEqual([]);
});
it('completes login for the actual DEFAULT product without filtering out the depot', async () => {
  const {service} = await setup();
  expect(service.status(7)).toEqual({state: 'connected', requiresCode: false, accounts: [{securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1', currency: 'EUR'}]});
});

const amountDraft: TradeDraft = {isin: draft.isin, assetType: 'Stock', side: 'buy', exchange: 'LSX', accountNumber: 'SEC1', method: 'amount', amountEUR: 50.25};
const amountRaw = () => ({...raw(), instrument: {...raw().instrument, proprietaryTradable: true}, orderSize: 0.507575, fractionalStep: 0.000001});
it.each([0, 0.99, -5, Infinity, NaN, 1.001, 1000001])('rejects invalid EUR amount %p', amountEUR => {
  expect(() => validateTradeDraft({...amountDraft, amountEUR})).toThrow();
});
it('accepts cent amounts from one EUR but rejects mixed amount/limit drafts', () => {
  expect(validateTradeDraft({...amountDraft, amountEUR: 1})).toEqual({...amountDraft, amountEUR: 1});
  expect(() => validateTradeDraft({...amountDraft, quantity: 2} as unknown as TradeDraft)).toThrow();
  expect(() => validateTradeDraft({...amountDraft, limit: 100} as unknown as TradeDraft)).toThrow();
});
it('uses exact EUR amount plus broker fees and fractional availability', () => {
  const data = amountRaw();
  expect(parseTradePreview(amountDraft, data)).toMatchObject({limitValueEUR: 50.25, estimatedShares: 0.507575, blockers: []});
  data.cash.amount = '51';
  expect(parseTradePreview(amountDraft, data).blockers).not.toHaveLength(0);
  data.price.price = '98'; data.size.size = '0.6';
  expect(parseTradePreview({...amountDraft, side: 'sell'}, data).blockers).toHaveLength(0);
  data.size.size = '0.5';
  expect(parseTradePreview({...amountDraft, side: 'sell'}, data).blockers).not.toHaveLength(0);
});
it('blocks unconfirmed fractional support and missing fee simulation size', () => {
  expect(parseTradePreview(amountDraft, {...amountRaw(), orderSize: 0}).blockers).not.toHaveLength(0);
  expect(parseTradePreview(amountDraft, {...amountRaw(), instrument: raw().instrument}).blockers).not.toHaveLength(0);
});
it('journals and sends exact amount without a whole-share or limit substitution', async () => {
  const {service, request} = await setup();
  request.mockImplementation(async operation => operation === 'preview' ? amountRaw() : {orderId: 'AMOUNT1'});
  const preview = await service.preview(7, amountDraft);
  const receipt = await service.submit(7, preview.id, true);
  expect(receipt).toMatchObject({amountEUR: 50.25, method: 'amount', status: 'submitted'});
  expect(receipt.quantity).toBeUndefined();
  const submit = request.mock.calls.find(([operation]) => operation === 'submit') as unknown as [string, any];
  expect(submit[1]).toMatchObject({method: 'amount', amountEUR: 50.25, orderSize: 0.507575});
  expect(submit[1].limit).toBeUndefined(); expect(submit[1].quantity).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'trade-republic-orders.json'), 'utf8'))[0]).toMatchObject({amountEUR: 50.25});
});
it('rechecks fractional sale coverage at the new market price before submitting', async () => {
  const {service, request} = await setup();
  const data = amountRaw(); data.price.price = '98'; data.size.size = '0.6';
  request.mockResolvedValue(data);
  const preview = await service.preview(7, {...amountDraft, side: 'sell'});
  data.price.price = '80'; data.ticker.bid.price = '80';
  await expect(service.submit(7, preview.id, true)).rejects.toThrow();
  expect(request.mock.calls.some(([operation]) => operation === 'submit')).toBe(false);
});

it.each([
  ['orderFeesV2', 'INVALID_VALUE', 'Trade Republic hat die Anfrage (Gebührenberechnung) abgelehnt (INVALID_VALUE).'],
  ['ticker', 'NOT_FOUND', 'Trade Republic hat die Anfrage (Kursabfrage) abgelehnt (NOT_FOUND).'],
  ['secret-cookie', 'secret-token', 'Trade Republic hat die Anfrage abgelehnt.'],
])('surfaces only approved broker stage and error code: %s', async (stage, code, expected) => {
  const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = {write: jest.fn()};
  const transport = tradingProcessTransport({child, dispose: jest.fn()});
  const pending = transport.request('preview', draft);
  const rejected = expect(pending).rejects.toThrow(expected);
  child.stdout.emit('data', Buffer.from(JSON.stringify({id: 1, error: 'BROKER_REJECTED', stage, code, detail: 'secret-cookie'}) + '\n'));
  await rejected; transport.close();
});

it('uses native Best Price routing even when legacy exchangeIds list only LSX', async () => {
  const {service, request} = await setup();
  const data = {...amountRaw(), routing: {destinations: [{id: 'TIB', currencyId: 'EUR', open: true, ongoingOutage: false}]}};
  request.mockImplementation(async operation => operation === 'preview' ? data : {orderId: 'BEST1'});
  const preview = await service.preview(7, {...amountDraft, exchange: 'TIB'});
  expect(preview.blockers).toHaveLength(0);
  await service.submit(7, preview.id, true);
  const submit = request.mock.calls.find(([operation]) => operation === 'submit') as unknown as [string, any];
  expect(submit[1]).toMatchObject({exchange: 'TIB', amountEUR: 50.25});
});
it.each([
  {}, {destinations: []}, {destinations: [{id: 'LSX', currencyId: 'EUR'}]},
  {destinations: [{id: 'TIB', currencyId: 'USD'}]}, {destinations: [{id: 'TIB', currencyId: 'EUR', ongoingOutage: true}]},
  {destinations: [{id: 'TIB', currencyId: 'EUR', open: false}]},
])('blocks unavailable Best Price without substituting another venue: %p', routing => {
  const preview = parseTradePreview({...amountDraft, exchange: 'TIB'}, {...amountRaw(), routing});
  expect(preview.blockers).toContain('Bestpreis ist für dieses Wertpapier derzeit nicht vom Broker bestätigt.');
  expect(preview.draft.exchange).toBe('TIB');
});

it.each(['BROKER_REJECTED', 'BROKER_REQUEST_FAILED'])('retains safe HTTP diagnostics for Best Price: %s', async error => {
  const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = {write: jest.fn()};
  const transport = tradingProcessTransport({child, dispose: jest.fn()});
  const pending = transport.request('preview', {...amountDraft, exchange: 'TIB'});
  const checked = expect(pending).rejects.toThrow(error === 'BROKER_REJECTED'
    ? 'Trade Republic hat die Anfrage (Bestpreis-Verfügbarkeit) abgelehnt (HTTP_401).'
    : 'Trade Republic konnte die Anfrage (Bestpreis-Verfügbarkeit) nicht bestätigen (HTTP_401).');
  child.stdout.emit('data', Buffer.from(JSON.stringify({id: 1, error, stage: 'destinations', code: 'HTTP_401', detail: 'secret-cookie'}) + '\n'));
  await checked; transport.close();
});

it('asks for a fresh trading session when authenticated routing claims are missing', async () => {
  const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = {write: jest.fn()};
  const transport = tradingProcessTransport({child, dispose: jest.fn()});
  const pending = transport.request('preview', {...amountDraft, exchange: 'TIB'});
  const checked = expect(pending).rejects.toThrow('Bitte die gespeicherte Sitzung löschen und erneut verbinden.');
  child.stdout.emit('data', Buffer.from(JSON.stringify({id: 1, error: 'BROKER_REQUEST_FAILED', stage: 'destinations', code: 'SESSION_CONTEXT_MISSING'}) + '\n'));
  await checked; transport.close();
});

it.each(['stock', 'fund'])('accepts the actual broker typeId format: %s', typeId => {
  const data = amountRaw(); data.instrument.typeId = typeId;
  expect(parseTradePreview(amountDraft, data).blockers).toHaveLength(0);
});
it('keeps legacy type compatibility but treats broker typeId as authoritative', () => {
  const data: any = amountRaw(); delete data.instrument.typeId; data.instrument.type = 'stock';
  expect(parseTradePreview(amountDraft, data).blockers).toHaveLength(0);
  data.instrument.typeId = 'bond';
  expect(parseTradePreview(amountDraft, data).blockers).not.toHaveLength(0);
  data.instrument.typeId = 'privateFund';
  expect(parseTradePreview(amountDraft, data).blockers).not.toHaveLength(0);
  delete data.instrument.typeId; delete data.instrument.type;
  expect(parseTradePreview(amountDraft, data).blockers).not.toHaveLength(0);
});

it.each([
  [undefined, 'Die Bruchstück-Schrittweite fehlt'], [0, 'Die Bruchstück-Schrittweite fehlt'],
  [1, 'nur ganze Anteile'],
])('explains the specific fractional sizing blocker for step %p', (fractionalStep, message) => {
  const data = {...amountRaw(), fractionalStep};
  expect(parseTradePreview(amountDraft, data).blockers.some(value => value.includes(message))).toBe(true);
});
it('distinguishes absent broker approval from explicit unsupported amount trading', () => {
  const data: any = amountRaw(); delete data.instrument.proprietaryTradable;
  expect(parseTradePreview(amountDraft, data).blockers).toContain('Die Broker-Freigabe für Betragsorders fehlt in den Wertpapierdaten.');
  data.instrument.proprietaryTradable = false;
  expect(parseTradePreview(amountDraft, data).blockers).toContain('Trade Republic meldet dieses Wertpapier als nicht für Betragsorders freigegeben.');
});

it('accepts native instrument isin without the nonexistent id field', () => {
  const data = amountRaw();
  expect(data.instrument).not.toHaveProperty('id');
  expect(parseTradePreview(amountDraft, data).blockers).toHaveLength(0);
});
it('accepts legacy id only when native isin is absent and never masks a mismatched isin', () => {
  const data: any = amountRaw(); data.instrument.id = draft.isin; delete data.instrument.isin;
  expect(parseTradePreview(amountDraft, data).blockers).toHaveLength(0);
  data.instrument.isin = 'US5801351017';
  expect(parseTradePreview(amountDraft, data).blockers).toContain('Die ISIN der Brokerantwort fehlt oder stimmt nicht mit dem gewählten Wertpapier überein.');
  delete data.instrument.isin; delete data.instrument.id;
  expect(parseTradePreview(amountDraft, data).blockers).toContain('Die ISIN der Brokerantwort fehlt oder stimmt nicht mit dem gewählten Wertpapier überein.');
});
it('recognizes native exchanges and blocks an explicitly inactive exchange', () => {
  const data: any = raw(); delete data.instrument.exchangeIds;
  data.instrument.exchanges = [{slug: 'LSX', active: true}];
  expect(parseTradePreview(draft, data).blockers).toHaveLength(0);
  data.instrument.exchanges[0].active = false;
  expect(parseTradePreview(draft, data).blockers).toContain('Der gewählte Handelsplatz ist für dieses Wertpapier nicht in den Brokerdaten freigegeben.');
});
it('reports inactive instrument separately from identity and venue validation', () => {
  const data: any = raw(); data.instrument.active = false;
  expect(parseTradePreview(draft, data).blockers).toEqual(['Trade Republic meldet dieses Wertpapier als nicht handelbar.']);
});

it('records JSON_PARSE_ERROR as a definitive rejection with no retry or accepted order ID', async () => {
  const {service, request} = await setup();
  request.mockImplementation(async operation => {
    if (operation === 'preview') return amountRaw();
    if (operation === 'submit') throw new TradingBrokerError('Trade Republic hat die Anfrage (Orderübermittlung) abgelehnt (JSON_PARSE_ERROR).');
  });
  const preview = await service.preview(7, amountDraft);
  const receipt = await service.submit(7, preview.id, true);
  expect(receipt).toMatchObject({status: 'rejected', amountEUR: 50.25});
  expect(receipt.orderId).toBeUndefined();
  expect(JSON.parse(fs.readFileSync(path.join(dir, 'trade-republic-orders.json'), 'utf8'))[0].status).toBe('rejected');
  expect(request.mock.calls.filter(([operation]) => operation === 'submit')).toHaveLength(1);
  await expect(service.submit(7, preview.id, true)).rejects.toThrow();
});

it('connects directly after broker-confirmed resumption and validates the resumed accounts', async () => {
  const request = jest.fn(async () => ({resumed: true, accounts: [{currency: 'EUR', securitiesAccountNumber: 'SEC1', cashAccountNumber: 'CASH1'}]}));
  const service = new TradeRepublicTradingService(dir, async () => ({request, close: jest.fn()}));
  expect((await service.connect(7)).state).toBe('connected');
  await service.connect(7); expect(request).toHaveBeenCalledTimes(1);
  const invalid = new TradeRepublicTradingService(dir, async () => ({request: async () => ({resumed: true, accounts: []}), close: jest.fn()}));
  await expect(invalid.connect(7)).rejects.toThrow('EUR-Kontopaar');
  expect(invalid.status(7).state).toBe('disconnected');
});
it('keeps session metadata private and preserves order acknowledgements if encrypted storage fails', async () => {
  const child: any = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.stdin = {write: jest.fn()};
  const saveSession = jest.fn(() => { throw new Error('disk unavailable'); });
  const transport = tradingProcessTransport({child, session: ['private-cookie'], credentials: {phone: 'fake', pin: 'fake'}, saveSession, dispose: jest.fn()});
  const start = transport.request('start');
  expect(JSON.parse(child.stdin.write.mock.calls[0][0]).data.session).toEqual(['private-cookie']);
  child.stdout.emit('data', Buffer.from(JSON.stringify({id: 1, result: {resumed: true}, session: ['renewed-cookie']}) + '\n'));
  expect(await start).toEqual({resumed: true});
  const submit = transport.request('submit');
  child.stdout.emit('data', Buffer.from(JSON.stringify({id: 2, result: {orderId: 'ORDER'}, session: ['renewed-cookie']}) + '\n'));
  expect(await submit).toEqual({orderId: 'ORDER'}); expect(saveSession).toHaveBeenCalledTimes(2); transport.close();
});
