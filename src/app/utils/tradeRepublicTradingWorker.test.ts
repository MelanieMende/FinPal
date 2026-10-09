/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { tradeRepublicTradingWorker } from './tradeRepublicTradingWorker';

it('uses fractional fee sizes and exact native EUR market amounts without placing real orders', () => {
  const harness = String.raw`
import asyncio, json, sys, types
api = types.ModuleType('pytr.api')
api.TradeRepublicApi = object
api.TradeRepublicError = type('TradeRepublicError', (Exception,), {})
sys.modules['pytr'] = types.ModuleType('pytr')
sys.modules['pytr.api'] = api
source = json.loads(sys.stdin.read())
namespace = {}
exec(compile(source.replace('asyncio.run(main())', ''), '<trading-worker>', 'exec'), namespace)
original_query = namespace['query']
calls = []
reject_v3 = False
no_fractions = False
async def query(payload):
    calls.append(payload)
    kind = payload['type']
    if kind == 'tickerV3' and reject_v3:
        raise namespace['BrokerRequestFailure']('tickerV3', Exception())
    if kind == 'instrument':
        return {'typeId': 'stock', 'isin': 'US0378331005', 'proprietaryTradable': not no_fractions, 'exchanges': [{'slug': 'LSX', 'fractionalTrading': {'stepSize': '0.000001'}}, {'slug': 'TIB', 'fractionalTrading': {'stepSize': '0.000001'}}]}
    if kind == 'priceForOrderV2': return {'price': '99'}
    if kind == 'simpleCreateOrder': return {'orderId': 'FAKE'}
    return {}
namespace['query'] = query
namespace['connected'] = True
def destinations(isin, instrument_type):
    assert instrument_type == 'stock', 'The live broker typeId must reach routing'
    return {'destinations': [{'id': 'TIB', 'currencyId': 'EUR', 'open': True}]}
namespace['destinations'] = destinations
namespace['suitability'] = lambda isin: {'instrumentId': isin, 'warnings': []}
async def check():
    global reject_v3, no_fractions
    error = api.TradeRepublicError()
    error.error = {'errors': [{'errorCode': 'INVALID_VALUE', 'message': 'secret-cookie'}]}
    assert namespace['broker_error_code'](error) == 'INVALID_VALUE'
    error.error = [{'errorCode': 'NOT_FOUND'}]
    assert namespace['broker_error_code'](error) == 'NOT_FOUND'
    error.error = {'errorCode': 'secret-cookie'}
    assert namespace['broker_error_code'](error) == ''
    async def failed_query(payload):
        raise error
    namespace['broker_query'] = failed_query
    try:
        await original_query({'type': 'orderFeesV2'})
        assert False
    except namespace['BrokerRequestFailure'] as failure:
        assert failure.stage == 'orderFeesV2' and failure.code == ''

    for side in ['buy', 'sell']:
        data = {'method': 'amount', 'amountEUR': 50.25, 'isin': 'US0378331005', 'exchange': 'LSX', 'accountNumber': 'SEC', 'cashAccountNumber': 'CASH', 'side': side}
        calls.clear()
        result = await namespace['handle']({'operation': 'preview', 'data': data})
        assert result['orderSize'] == 0.507575
        assert not any(c['type'] == 'simpleCreateOrder' for c in calls)
        fees = next(c for c in calls if c['type'] == 'orderFeesV2')['parameters']
        assert fees['mode'] == 'market' and fees['size'] == 0.507575 and 'limit' not in fees
        submit = dict(data, orderSize=result['orderSize'], clientProcessId='TEST', warningsShown=[], price=99)
        await namespace['handle']({'operation': 'submit', 'data': submit})
        submitted = json.loads(json.dumps(calls[-1]))
        assert submitted['lastClientPrice'] == 99 and isinstance(submitted['lastClientPrice'], (int, float))
        assert set(submitted) == {'type', 'secAccNo', 'clientProcessId', 'warningsShown', 'parameters', 'lastClientPrice'}
        order = submitted['parameters']
        assert set(order) == {'instrumentId', 'exchangeId', 'mode', 'expiry', 'size', 'type', 'sellFractions', 'settlementCurrency', 'tradingCurrency', 'amount'}
        assert 'side' not in order
        assert order['amount'] == 50.25 and order['size'] == 0.507575
        assert order['mode'] == 'market' and order['type'] == side and 'limit' not in order
        assert order['settlementCurrency'] == order['tradingCurrency'] == 'EUR'
    data = {'method': 'amount', 'amountEUR': 50.25, 'isin': 'US0378331005', 'exchange': 'TIB', 'accountNumber': 'SEC', 'cashAccountNumber': 'CASH', 'side': 'buy'}
    calls.clear()
    result = await namespace['handle']({'operation': 'preview', 'data': data})
    assert result['orderSize'] == 0.507575
    assert result['fractionalStep'] == 0.000001
    assert next(c for c in calls if c['type'] == 'orderFeesV2')['parameters']['exchangeId'] == 'TIB'
    assert next(c for c in calls if c['type'] == 'priceForOrderV2')['exchangeId'] == 'TIB'
    await namespace['handle']({'operation': 'submit', 'data': dict(data, orderSize=result['orderSize'], clientProcessId='TEST', warningsShown=[], price=99)})
    assert calls[-1]['parameters']['exchangeId'] == 'TIB' and calls[-1]['parameters']['amount'] == 50.25
    namespace['destinations'] = lambda isin, instrument_type: {'destinations': []}
    calls.clear()
    result = await namespace['handle']({'operation': 'preview', 'data': data})
    assert result['routing']['destinations'] == []
    assert not any(c['type'] in ['tickerV3', 'ticker', 'priceForOrderV2', 'orderFeesV2', 'simpleCreateOrder'] for c in calls)
    reject_v3 = True
    data = {'method': 'amount', 'amountEUR': 50.25, 'isin': 'US0378331005', 'exchange': 'LSX', 'accountNumber': 'SEC', 'cashAccountNumber': 'CASH', 'side': 'buy'}
    calls.clear()
    await namespace['handle']({'operation': 'preview', 'data': data})
    assert any(c == {'type': 'ticker', 'id': 'US0378331005.LSX'} for c in calls)
    assert not any(c['type'] == 'simpleCreateOrder' for c in calls)
    no_fractions = True
    calls.clear()
    result = await namespace['handle']({'operation': 'preview', 'data': data})
    assert result['orderSize'] == 0 and result['fees'] == {}
    assert not any(c['type'] in ['orderFeesV2', 'simpleCreateOrder'] for c in calls)
    data = {'isin': 'US0378331005', 'exchange': 'LSX', 'accountNumber': 'SEC', 'cashAccountNumber': 'CASH', 'side': 'buy', 'quantity': 2, 'limit': 100}
    result = await namespace['handle']({'operation': 'preview', 'data': data})
    await namespace['handle']({'operation': 'submit', 'data': dict(data, clientProcessId='TEST', warningsShown=[], price=99)})
    order = calls[-1]['parameters']
    assert order['mode'] == 'limit' and order['size'] == 2 and order['limit'] == 100 and 'amount' not in order
    assert 'lastClientPrice' not in calls[-1] and 'side' not in order
    assert set(order) == {'instrumentId', 'exchangeId', 'mode', 'expiry', 'size', 'type', 'sellFractions', 'settlementCurrency', 'tradingCurrency', 'limit'}
asyncio.run(check())
print('Offline payload checks passed')
`;
  const result = spawnSync('python', ['-c', harness], {input: JSON.stringify(tradeRepublicTradingWorker), encoding: 'utf8', timeout: 10000, windowsHide: true});
  expect({status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({status: 0, error: undefined, stderr: ''});
  expect(result.stdout).toContain('Offline payload checks passed');
});

it('calls the REST API with authenticated web-pro context and exposes only safe HTTP diagnostics', () => {
  const harness = String.raw`
import base64, json, sys, types
api = types.ModuleType('pytr.api')
api.TradeRepublicApi = object
api.TradeRepublicError = type('TradeRepublicError', (Exception,), {})
sys.modules['pytr'] = types.ModuleType('pytr')
sys.modules['pytr.api'] = api
namespace = {}
exec(compile(json.loads(sys.stdin.read()).replace('asyncio.run(main())', ''), '<worker>', 'exec'), namespace)
calls = []
class Response:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self.payload = {'destinations': []} if payload is None else payload
    def __bool__(self):
        return self.status_code < 400
    def raise_for_status(self):
        if self.status_code >= 400:
            error = Exception('secret-cookie-and-pin')
            error.response = self
            raise error
    def json(self):
        return self.payload
response = Response()
def get(url, **kwargs):
    calls.append((url, kwargs))
    return response
claims = base64.b64encode(json.dumps({'sub': 'PRIVATE_USER_ID', 'jurisdiction': 'DE', 'secret': 'do-not-forward'}).encode()).decode()
session = types.SimpleNamespace(get=get, cookies=[types.SimpleNamespace(name='tr_claims', value=claims)])
namespace['tr'] = types.SimpleNamespace(_websession=session)
namespace['destinations']('US0378331005', 'stock')
url, args = calls[-1]
assert url == 'https://api.traderepublic.com/api-gateway/order-router/api/v2/instruments/US0378331005/destinations'
assert args['params'] == {'lang': 'de', 'productContext': 'stock', 'userId': 'PRIVATE_USER_ID', 'jurisdiction': 'DE'}
namespace['destinations']('US0378331005', 'fund')
assert calls[-1][1]['params']['productContext'] == 'fund'
assert 'secret' not in calls[-1][1]['params']
namespace['destinations']('US0378331005', 'etf')
assert calls[-1][1]['params']['productContext'] == 'fund'
for invalid_type in [None, '', 'bond', 'privateFund', 'brokerage']:
    count = len(calls)
    try:
        namespace['destinations']('US0378331005', invalid_type)
        assert False
    except namespace['BrokerRequestFailure'] as error:
        assert error.code == 'INVALID_PRODUCT_CONTEXT'
    assert len(calls) == count
assert args['headers'] == {'X-Tr-Platform': 'web-pro', 'Accept-Language': 'de', 'Content-Type': 'application/json'}
assert args['timeout'] == 20
namespace['suitability']('US0378331005')
assert calls[-1][1]['params'] == {'instrumentId': 'US0378331005'}
for status, payload, expected in [
    (401, {}, 'HTTP_401'), (403, {'errors': [{'errorCode': 'FORBIDDEN', 'message': 'secret-cookie'}]}, 'FORBIDDEN'),
    (404, {}, 'HTTP_404'), (405, {'errorCode': 'secret-cookie'}, 'HTTP_405'), (500, {}, 'HTTP_500')
]:
    response = Response(status, payload)
    try:
        namespace['destinations']('US0378331005', 'stock')
        assert False
    except namespace['BrokerRequestFailure'] as error:
        assert error.stage == 'destinations' and error.code == expected and error.kind == 'BROKER_REJECTED'
response = Response(200, [])
try:
    namespace['destinations']('US0378331005', 'stock')
    assert False
except namespace['BrokerRequestFailure'] as error:
    assert error.code == '' and error.kind == 'BROKER_REQUEST_FAILED'
for cookies in [[], [types.SimpleNamespace(name='tr_claims', value='not-base64')], [types.SimpleNamespace(name='tr_claims', value=base64.b64encode(b'{}').decode())], [types.SimpleNamespace(name='tr_claims', value=claims), types.SimpleNamespace(name='tr_claims', value='conflict')]]:
    session.cookies = cookies
    count = len(calls)
    try:
        namespace['destinations']('US0378331005', 'stock')
        assert False
    except namespace['BrokerRequestFailure'] as error:
        assert error.code == 'SESSION_CONTEXT_MISSING'
    assert len(calls) == count
print('REST checks passed')
`;
  const result = spawnSync('python', ['-c', harness], {input: JSON.stringify(tradeRepublicTradingWorker), encoding: 'utf8', timeout: 10000, windowsHide: true});
  expect({status: result.status, error: result.error?.message, stderr: result.stderr}).toEqual({status: 0, error: undefined, stderr: ''});
  expect(result.stdout.trim()).toBe('REST checks passed');
});

it('reuses valid cookies, requests approval only after expiry or auth rejection, and preserves sessions on network failure', () => {
  const harness = String.raw`
import asyncio, json, sys, types, http.cookiejar
api = types.ModuleType('pytr.api')
api.TradeRepublicError = type('TradeRepublicError', (Exception,), {})
instances = []
mode = 'valid'
class FakeApi:
    def __init__(self, **kwargs):
        assert kwargs['save_cookies'] is False
        self._websession = types.SimpleNamespace(cookies=http.cookiejar.CookieJar())
        self.weblogin_needs_authenticator = False
        self.approvals = 0
        instances.append(self)
    def settings(self):
        assert list(self._websession.cookies)
        if mode != 'valid':
            error = Exception('sensitive details')
            if mode == 'rejected': error.response = types.SimpleNamespace(status_code=401)
            raise error
    def initiate_weblogin(self): self.approvals += 1
api.TradeRepublicApi = FakeApi
sys.modules['pytr'] = types.ModuleType('pytr')
sys.modules['pytr.api'] = api
namespace = {}
exec(compile(json.loads(sys.stdin.read()).replace('asyncio.run(main())', ''), '<worker>', 'exec'), namespace)
async def query(payload): return {'accounts': [{'currency': 'EUR', 'securitiesAccountNumber': 'SEC', 'cashAccountNumber': 'CASH'}]}
namespace['query'] = query
cookie = {'name': 'session', 'value': 'fake-token', 'domain': '.traderepublic.com', 'path': '/', 'secure': True, 'expires': None, 'rest': {'HttpOnly': None}}
async def check():
    global mode
    result = await namespace['handle']({'operation': 'start', 'data': {'phone': 'fake', 'pin': 'fake', 'session': [cookie]}})
    assert result['resumed'] and instances[-1].approvals == 0
    assert namespace['export_session']()[0]['rest'] == cookie['rest']
    mode = 'rejected'
    namespace['connected'] = False
    result = await namespace['handle']({'operation': 'start', 'data': {'phone': 'fake', 'pin': 'fake', 'session': [cookie]}})
    assert not result.get('resumed') and instances[-1].approvals == 1 and not list(instances[-1]._websession.cookies)
    mode = 'network'
    try:
        await namespace['handle']({'operation': 'start', 'data': {'phone': 'fake', 'pin': 'fake', 'session': [cookie]}})
        raise AssertionError()
    except namespace['BrokerRequestFailure'] as error:
        assert error.stage == 'session' and instances[-1].approvals == 0
        assert list(instances[-1]._websession.cookies)
    mode = 'valid'
    result = await namespace['handle']({'operation': 'start', 'data': {'phone': 'fake', 'pin': 'fake', 'session': [{**cookie, 'expires': 1}]}})
    assert not result.get('resumed') and instances[-1].approvals == 1
    print('ok')
asyncio.run(check())
`;
  const result = spawnSync('python', ['-c', harness], {input: JSON.stringify(tradeRepublicTradingWorker), encoding: 'utf8', timeout: 10000});
  expect(result.stderr).toBe(''); expect(result.status).toBe(0); expect(result.stdout.trim()).toBe('ok');
});
