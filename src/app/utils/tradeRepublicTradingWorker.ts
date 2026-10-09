// Only this worker talks to the broker. Preview commands never create orders.
export const tradeRepublicTradingWorker = String.raw`
import asyncio
import base64
from urllib.parse import unquote
import json
import logging
from http.cookiejar import Cookie
import sys
from decimal import Decimal, ROUND_DOWN
from pytr.api import TradeRepublicApi, TradeRepublicError

logging.disable(logging.CRITICAL)
tr = None
connected = False

STAGES = {'accountPairs', 'instrument', 'tickerV3', 'ticker', 'priceForOrderV2', 'orderFeesV2', 'availableCash', 'availableSize', 'simpleCreateOrder', 'orders', 'suitability', 'destinations', 'session'}

class BrokerRequestFailure(Exception):
    def __init__(self, stage, error):
        self.stage = stage if stage in STAGES else ''
        self.code = broker_error_code(error)
        response = getattr(error, 'response', None)
        status = getattr(response, 'status_code', None)
        self.kind = 'BROKER_REJECTED' if isinstance(error, TradeRepublicError) or (isinstance(status, int) and 400 <= status <= 599) else 'BROKER_REQUEST_FAILED'
        if not self.code and isinstance(status, int) and 400 <= status <= 599:
            self.code = 'HTTP_' + str(status)

def broker_error_code(error):
    payload = getattr(error, 'error', None)
    if payload is None:
        response = getattr(error, 'response', None)
        try:
            payload = response.json() if response is not None else {}
        except Exception:
            payload = {}
    candidates = payload if isinstance(payload, list) else [payload]
    if isinstance(payload, dict) and isinstance(payload.get('errors'), list):
        candidates += payload['errors']
    for item in candidates:
        code = item.get('errorCode', '') if isinstance(item, dict) else ''
        if isinstance(code, str) and 0 < len(code) <= 80 and all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_' for c in code):
            return code
    return ''

async def query(payload):
    try:
        return await broker_query(payload)
    except TradeRepublicError as error:
        raise BrokerRequestFailure(payload.get('type', ''), error) from None

async def broker_query(payload):
    sid = await tr.subscribe(payload)
    try:
        while True:
            received, _, data = await asyncio.wait_for(tr.recv(), 20)
            if received == sid:
                return data
    finally:
        try:
            await tr.unsubscribe(sid)
        except Exception:
            pass

def export_session():
    return [{'name': c.name, 'value': c.value, 'domain': c.domain, 'path': c.path, 'secure': c.secure, 'expires': c.expires, 'rest': c._rest, 'domainSpecified': c.domain_specified, 'domainInitialDot': c.domain_initial_dot} for c in tr._websession.cookies if not c.is_expired() and (c.domain.lstrip('.') == 'traderepublic.com' or c.domain.endswith('.traderepublic.com'))]

def restore_session(cookies):
    if not isinstance(cookies, list):
        return False
    try:
        for c in cookies:
            domain = c['domain']
            if domain.lstrip('.') != 'traderepublic.com' and not domain.endswith('.traderepublic.com'):
                raise ValueError()
            cookie = Cookie(version=0, name=c['name'], value=c['value'], port=None, port_specified=False, domain=domain, domain_specified=c.get('domainSpecified', True), domain_initial_dot=c.get('domainInitialDot', domain.startswith('.')), path=c['path'], path_specified=True, secure=c['secure'], expires=c['expires'], discard=c['expires'] is None, comment=None, comment_url=None, rest=c.get('rest', {}))
            if not cookie.is_expired():
                tr._websession.cookies.set_cookie(cookie)
        return bool(list(tr._websession.cookies))
    except Exception:
        tr._websession.cookies.clear()
        return False

async def handle(command):
    global tr, connected
    operation = command['operation']
    data = command.get('data') or {}
    if operation == 'start':
        tr = TradeRepublicApi(phone_no=data['phone'], pin=data['pin'], locale='de', save_cookies=False, use_v2_login=True)
        if restore_session(data.get('session')):
            try:
                await asyncio.to_thread(tr.settings)
            except Exception as error:
                status = getattr(getattr(error, 'response', None), 'status_code', None)
                if status not in (401, 403):
                    raise BrokerRequestFailure('session', error) from None
                tr._websession.cookies.clear()
            else:
                accounts = await query({'type': 'accountPairs'})
                connected = True
                return {**accounts, 'resumed': True}
        await asyncio.to_thread(tr.initiate_weblogin)
        return {'requiresCode': bool(tr.weblogin_needs_authenticator)}
    if operation == 'complete':
        await asyncio.to_thread(tr.complete_weblogin, data.get('code') or None)
        accounts = await query({'type': 'accountPairs'})
        connected = True
        return accounts
    if not connected:
        raise ValueError('NOT_CONNECTED')
    if operation == 'preview':
        instrument = await query({'type': 'instrument', 'id': data['isin']})
        routing = None
        destination = None
        if data['exchange'] == 'TIB':
            routing = await asyncio.to_thread(destinations, data['isin'], instrument.get('typeId', instrument.get('type')))
            destination = next((item for item in routing.get('destinations', []) if item.get('id') == 'TIB' and item.get('currencyId') == 'EUR'), None)
            if not destination or destination.get('ongoingOutage') is True or (destination.get('open') is False and data.get('method') == 'amount'):
                return {'instrument': instrument, 'routing': routing, 'requestedUnit': 'EUR'}

        try:
            ticker = await query({'type': 'tickerV3', 'isin': data['isin'], 'exchangeId': data['exchange'], 'unit': 'EUR'})
        except BrokerRequestFailure:
            # Read-only compatibility fallback for the JSON websocket protocol.
            ticker = await query({'type': 'ticker', 'id': data['isin'] + '.' + data['exchange']})
        price = await query({'type': 'priceForOrderV2', 'isin': data['isin'], 'exchangeId': data['exchange'], 'unit': 'EUR', 'side': data['side']})
        size = data.get('quantity', 0)
        fractional_step = None
        if data.get('method') == 'amount':
            exchange = next((item for item in instrument.get('exchanges', []) if item.get('slug') == data['exchange']), {})
            step = Decimal(str((exchange.get('fractionalTrading') or {}).get('stepSize', 0)))
            fractional_step = float(step) if step.is_finite() else None
            current_price = Decimal(str(price.get('price', 0)))
            if instrument.get('proprietaryTradable') is True and step.is_finite() and 0 < step < 1 and current_price.is_finite() and current_price > 0:
                size = float((Decimal(str(data['amountEUR'])) / current_price / step).to_integral_value(rounding=ROUND_DOWN) * step)
        parameters = {'exchangeId': data['exchange'], 'instrumentId': data['isin'], 'mode': 'market' if data.get('method') == 'amount' else 'limit', 'size': size, 'type': data['side'], 'currency': 'EUR'}
        if data.get('method') != 'amount':
            parameters['limit'] = data['limit']
        return {
            'instrument': instrument,
            'routing': routing,
            'requestedUnit': 'EUR',
            'ticker': ticker,
            'price': price,
            'orderSize': size,
            'fractionalStep': fractional_step,
            'fees': await query({'type': 'orderFeesV2', 'secAccNo': data['accountNumber'], 'parameters': parameters}) if size > 0 else {},
            'cash': await query({'type': 'availableCash', 'accountNumber': data['cashAccountNumber']}),
            'size': await query({'type': 'availableSize', 'secAccNo': data['accountNumber'], 'parameters': {'instrumentId': data['isin']}}),
            'suitability': await asyncio.to_thread(suitability, data['isin'])
        }
    if operation == 'submit':
        parameters = {'exchangeId': data['exchange'], 'instrumentId': data['isin'], 'mode': 'market' if data.get('method') == 'amount' else 'limit', 'expiry': {'type': 'gfd'}, 'size': data['orderSize'] if data.get('method') == 'amount' else data['quantity'], 'type': data['side'], 'sellFractions': False, 'settlementCurrency': 'EUR', 'tradingCurrency': 'EUR'}
        if data.get('method') == 'amount':
            parameters['amount'] = data['amountEUR']
        else:
            parameters['limit'] = data['limit']
        request = {
            'type': 'simpleCreateOrder', 'secAccNo': data['accountNumber'],
            'clientProcessId': data['clientProcessId'], 'warningsShown': data['warningsShown'],
            'parameters': parameters
        }
        if data.get('method') == 'amount':
            request['lastClientPrice'] = data['price']
        return await query(request)
    if operation == 'orders':
        return {'active': await query({'type': 'orders', 'terminated': False, 'secAccNo': data['accountNumber']}), 'terminated': await query({'type': 'orders', 'terminated': True, 'secAccNo': data['accountNumber']})}
    raise ValueError('UNSUPPORTED_OPERATION')

def broker_get_json(stage, url, params):
    # The login helper applies its headers per request; REST calls need their own
    # web-pro context, just like the official trading frontend.
    try:
        response = tr._websession.get(url, params=params, headers={
            'X-Tr-Platform': 'web-pro', 'Accept-Language': 'de', 'Content-Type': 'application/json'
        }, timeout=20)
        response.raise_for_status()
        value = response.json()
        if not isinstance(value, dict):
            raise ValueError('INVALID_RESPONSE')
        return value
    except Exception as error:
        raise BrokerRequestFailure(stage, error) from None

def session_context():
    # Official frontend decodes the base64 JSON tr_claims cookie (not a JWT).
    # Read only the existing authenticated session; never invent identity fields.
    tokens = {cookie.value for cookie in tr._websession.cookies if cookie.name == 'tr_claims'}
    try:
        if len(tokens) != 1:
            raise ValueError()
        token = unquote(next(iter(tokens)))
        if len(token) > 16384:
            raise ValueError()
        claims = json.loads(base64.b64decode(token + '=' * (-len(token) % 4), validate=True))
        context = {'userId': claims.get('sub'), 'jurisdiction': claims.get('jurisdiction')}
        if any(not isinstance(value, str) or not value.strip() or len(value) > 128 for value in context.values()):
            raise ValueError()
        return context
    except Exception:
        error = ValueError()
        error.error = {'errorCode': 'SESSION_CONTEXT_MISSING'}
        raise BrokerRequestFailure('destinations', error) from None

def destinations(isin, instrument_type):
    context = 'fund' if instrument_type == 'etf' else instrument_type
    if context not in ('stock', 'fund'):
        error = ValueError()
        error.error = {'errorCode': 'INVALID_PRODUCT_CONTEXT'}
        raise BrokerRequestFailure('destinations', error)
    params = {'lang': 'de', 'productContext': context, **session_context()}
    return broker_get_json('destinations', 'https://api.traderepublic.com/api-gateway/order-router/api/v2/instruments/' + isin + '/destinations', params)

def suitability(isin):
    return broker_get_json('suitability', 'https://api.traderepublic.com/api/v1/user-experience/instrument-suitability', {'instrumentId': isin})

async def main():
    while True:
        line = await asyncio.to_thread(sys.stdin.readline)
        if not line:
            return
        command = {}
        try:
            command = json.loads(line)
            result = await handle(command)
            message = {'id': command['id'], 'result': result}
            # Private IPC metadata is consumed by the main process, never the renderer.
            if connected:
                try:
                    message['session'] = export_session() or None
                except Exception:
                    pass
            elif command.get('operation') == 'start':
                message['session'] = None
            print(json.dumps(message), flush=True)
        except BrokerRequestFailure as error:
            print(json.dumps({'id': command.get('id'), 'error': error.kind, 'stage': error.stage, 'code': error.code}), flush=True)
        except TradeRepublicError as error:
            code = broker_error_code(error)
            print(json.dumps({'id': command.get('id'), 'error': 'BROKER_REJECTED', 'code': code}), flush=True)
        except Exception:
            # Never send cookies, PINs, traceback or HTTP headers to the renderer.
            print(json.dumps({'id': command.get('id'), 'error': 'BROKER_REQUEST_FAILED'}), flush=True)

asyncio.run(main())
`;
