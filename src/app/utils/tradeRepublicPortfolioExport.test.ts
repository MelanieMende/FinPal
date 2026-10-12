/** @jest-environment node */
import { spawnSync } from 'node:child_process';
import { tradeRepublicPortfolioExport } from './tradeRepublicPortfolioExport';

it('exports instrument types only from identity-matched broker replies using an isolated Python harness', () => {
  const harness = String.raw`
import asyncio, csv, json, sys, tempfile, types
from pathlib import Path
api = types.ModuleType('pytr.api')
class API:
    async def recv(self): return self.reply
api.TradeRepublicApi = API
portfolio = types.ModuleType('pytr.portfolio')
class Portfolio:
    def write_csv(self):
        Path(self.output).write_text('Name;ISIN;quantity;price;avgCost;netValue\nBitcoin;BTC;1;100;80;100\nETP;ETP;1;100;80;100\nWrong;WRONG;1;100;80;100\n', encoding='utf-8')
portfolio.Portfolio = Portfolio
main = types.ModuleType('pytr.main')
main.main = lambda: None
sys.modules.update({'pytr': types.ModuleType('pytr'), 'pytr.api': api, 'pytr.portfolio': portfolio, 'pytr.main': main})
namespace = {'__name__': 'test'}
exec(json.loads(sys.stdin.read()), namespace)
async def check():
    client = API()
    for key, response in [('BTC', {'isin':'BTC','typeId':'crypto'}), ('ETP', {'id':'ETP','type':'etp'}), ('WRONG', {'isin':'BTC','typeId':'crypto'})]:
        client.reply = ('sub', {'type':'instrument','id':key}, response)
        await client.recv()
    with tempfile.TemporaryDirectory() as directory:
        instance = Portfolio()
        instance.output = str(Path(directory) / 'portfolio.csv')
        instance.positions = [{'instrumentId': key, 'price': 100} for key in ['BTC','ETP','WRONG']]
        instance.write_csv()
        with open(instance.output, encoding='utf-8') as handle: rows = list(csv.DictReader(handle, delimiter=';'))
        assert [row['instrumentType'] for row in rows] == ['crypto', 'etp', '']
asyncio.run(check())
`;
  const result = spawnSync('python', ['-c', harness], { input: JSON.stringify(tradeRepublicPortfolioExport), encoding: 'utf8' });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
