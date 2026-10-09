/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { TradeRepublicSessionStore } from './tradeRepublicSession';
let dir: string;
const credentials = {phone: '+490000', pin: '1234'};
const cookies = [{name: 'session', value: 'secret-test-token', domain: '.traderepublic.com', path: '/', secure: true, expires: null as number | null}];
const key = crypto.randomBytes(32);
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString(value: string) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(value), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
  decryptString(value: Buffer) { const cipher = crypto.createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(12, 28)); return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString(); },
};
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-session-test-')); });
afterEach(() => { if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(dir).startsWith('finpal-session-test-')) throw new Error(); fs.rmSync(dir, {recursive: true, force: true}); });
it('restores encrypted cookies across instances without plaintext credentials or tokens on disk', () => {
  new TradeRepublicSessionStore(dir, encryption).save(credentials, cookies);
  const disk = fs.readFileSync(path.join(dir, 'trade-republic-trading-session.bin')).toString();
  expect(disk).not.toContain('secret-test-token'); expect(disk).not.toContain(credentials.phone);
  expect(new TradeRepublicSessionStore(dir, encryption).load(credentials)).toEqual(cookies);
});
it.each([{phone: '+499999', pin: '1234'}, {phone: '+490000', pin: '4321'}])('invalidates changed credentials %p', changed => {
  const store = new TradeRepublicSessionStore(dir, encryption); store.save(credentials, cookies);
  expect(store.load(changed)).toBeUndefined(); expect(fs.readdirSync(dir)).toEqual([]);
});
it('clears a corrupt encrypted session', () => {
  fs.writeFileSync(path.join(dir, 'trade-republic-trading-session.bin'), 'broken');
  expect(new TradeRepublicSessionStore(dir, encryption).load(credentials)).toBeUndefined(); expect(fs.readdirSync(dir)).toEqual([]);
});
it('never stores cookies without secure encryption or for unrelated domains', () => {
  new TradeRepublicSessionStore(dir, {...encryption, isEncryptionAvailable: () => false}).save(credentials, cookies);
  new TradeRepublicSessionStore(dir, {...encryption, getSelectedStorageBackend: () => 'basic_text'}).save(credentials, cookies);
  new TradeRepublicSessionStore(dir, encryption).save(credentials, [{...cookies[0], domain: 'eviltraderepublic.com'}]);
  expect(fs.readdirSync(dir)).toEqual([]);
});
it('explicitly clears stored sessions', () => {
  const store = new TradeRepublicSessionStore(dir, encryption); store.save(credentials, cookies); store.save(credentials, null);
  expect(store.load(credentials)).toBeUndefined();
});
