/** @jest-environment node */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {TradeRepublicSync} from './tradeRepublicSync';
jest.mock('electron', () => ({safeStorage: {isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString()}}));
jest.mock('node:child_process', () => ({spawn: jest.fn()}));
let dir: string;
let child: EventEmitter;
const credentials = {phone: '+490000', pin: '1234'};
const cookies = [{name: 'session', value: 'fake-token', domain: '.traderepublic.com', path: '/', secure: true, expires: null as number | null}];
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-session-integration-')); child = new EventEmitter(); jest.mocked(spawn).mockReturnValue(child as any); });
afterEach(() => { child.emit('close'); if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(dir).startsWith('finpal-session-integration-')) throw new Error(); fs.rmSync(dir, {recursive: true, force: true}); });
async function setup() {
  const sync = new TradeRepublicSync(dir);
  jest.spyOn(sync as any, 'ensureRunner').mockResolvedValue('fake-runner');
  (sync as any).saveCredentials(credentials);
  return {sync, process: await sync.createTradingProcess()};
}
it.each(['clear', 'forget', 'change'])('does not resurrect a removed session from a late worker response: %s', async action => {
  const {sync, process} = await setup();
  process.saveSession(cookies);
  expect((sync as any).tradingSession.load(credentials)).toEqual(cookies);
  if (action === 'clear') sync.clearTradingSession();
  if (action === 'forget') sync.forgetCredentials();
  if (action === 'change') (sync as any).saveCredentials({...credentials, pin: '4321'});
  process.saveSession(cookies);
  expect(fs.existsSync(path.join(dir, 'trade-republic-trading-session.bin'))).toBe(false);
});
it('supplies encrypted stored cookies to a new worker and keeps them when credentials stay the same', async () => {
  const {sync, process} = await setup(); process.saveSession(cookies);
  (sync as any).saveCredentials(credentials);
  child.emit('close');
  const next = await sync.createTradingProcess();
  expect(next.session).toEqual(cookies);
  expect(next.credentials).toEqual(credentials);
});
