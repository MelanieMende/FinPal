// Run the existing pytr portfolio command in the same isolated session, preserving
// the timestamp of the exact last-price tick used by its CSV export.
export const tradeRepublicPortfolioExport = `
import csv
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from pytr.api import TradeRepublicApi
from pytr.portfolio import Portfolio
from pytr.main import main

ticks = {}
original_recv = TradeRepublicApi.recv
original_write_csv = Portfolio.write_csv

async def recv(self):
    item = await original_recv(self)
    _, subscription, response = item
    if subscription.get('type') == 'ticker':
        key = subscription.get('id', '')
        last = response.get('last', {})
        if key and key not in ticks and isinstance(last, dict):
            ticks[key] = {'price': last.get('price'), 'time': last.get('time')}
    return item

def write_csv(self):
    original_write_csv(self)
    if self.output is None:
        return
    metadata = {}
    for pos in self.positions:
        isin = pos['instrumentId']
        exchanges = pos.get('exchangeIds', [])
        exchange = exchanges[0] if exchanges else ''
        tick = ticks.get(isin + '.' + exchange, {})
        stamp = ''
        raw_time = tick.get('time')
        try:
            # TR last.time is Unix milliseconds, not the message reception time.
            millis = int(raw_time)
            raw_price = Decimal(str(tick.get('price')))
            exported_price = Decimal(str(pos['price']))
            matches = raw_price == exported_price or raw_price / 100 == exported_price
            if matches and not isinstance(raw_time, bool) and 946684800000 <= millis <= int(datetime.now(timezone.utc).timestamp() * 1000):
                stamp = datetime.fromtimestamp(millis / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')
        except (ValueError, TypeError, ArithmeticError, OverflowError):
            pass
        metadata[isin] = (stamp, exchange)
    path = Path(self.output)
    with path.open(encoding='utf-8', newline='') as handle:
        rows = list(csv.DictReader(handle, delimiter=';'))
    if not rows:
        return
    columns = list(rows[0]) + ['quoteAsOf', 'exchange']
    with path.open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, delimiter=';')
        writer.writeheader()
        for row in rows:
            row['quoteAsOf'], row['exchange'] = metadata.get(row['ISIN'], ('', ''))
            writer.writerow(row)

TradeRepublicApi.recv = recv
Portfolio.write_csv = write_csv
if __name__ == '__main__':
    main()
`;
