/** @jest-environment node */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeStorage } from 'electron';
import { DivvyDiaryService } from './divvyDiaryService';
jest.mock('electron', () => ({ safeStorage: {
  isEncryptionAvailable: jest.fn(() => true),
  encryptString: jest.fn((value: string) => Buffer.from(value.split('').reverse().join(''))),
  decryptString: jest.fn((value: Buffer) => value.toString().split('').reverse().join('')),
} }));
let dir: string;
beforeEach(() => { jest.clearAllMocks(); jest.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-dividends-test-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
it('stores via safeStorage, restores only status and deletes the key', () => {
  const service = new DivvyDiaryService(dir);
  expect(service.status().hasApiKey).toBe(false);
  service.saveKey(' test-api-key ');
  expect(safeStorage.encryptString).toHaveBeenCalledWith('test-api-key');
  expect(fs.readFileSync(path.join(dir, 'divvydiary-api-key.bin')).toString()).not.toContain('test-api-key');
  expect(new DivvyDiaryService(dir).status()).toEqual({ hasApiKey: true, secureStorageAvailable: true });
  service.forgetKey(); expect(service.status().hasApiKey).toBe(false);
});
it('never falls back to plaintext storage when secure storage is unavailable', () => {
  jest.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false);
  const service = new DivvyDiaryService(dir);
  expect(() => service.saveKey('test-key')).toThrow(/Sichere/);
  expect(fs.readdirSync(dir)).toEqual([]);
});
it.each(['', 'key with spaces', 'key\nvalue'])('rejects malformed key %j', value => {
  expect(() => new DivvyDiaryService(dir).saveKey(value)).toThrow(/DivvyDiary/);
});
it('sends the key only as a header to the fixed DivvyDiary endpoint and blocks redirects', async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ currency: 'EUR', dividends: [] })));
  const service = new DivvyDiaryService(dir, fetcher); service.saveKey('test-api-key');
  await expect(service.dividends('US5801351017')).resolves.toMatchObject({ dividends: [] });
  expect(fetcher).toHaveBeenCalledWith('https://api.divvydiary.com/symbols/US5801351017', expect.objectContaining({ headers: { 'X-API-Key': 'test-api-key' }, redirect: 'error', signal: expect.any(AbortSignal) }));
  expect(fetcher.mock.calls[0][0]).not.toContain('test-api-key');
  await expect(service.dividends('https://another.example')).rejects.toThrow(/ISIN/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not contact the provider without a stored key', async () => {
  const fetcher = jest.fn();
  await expect(new DivvyDiaryService(dir, fetcher).dividends('US5801351017')).rejects.toThrow(/Upcoming Payments/);
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([401, 403])('keeps provider error bodies out of displayed authentication errors (%s)', async status => {
  const service = new DivvyDiaryService(dir, jest.fn().mockResolvedValue(new Response('secret-provider-body', { status })));
  service.saveKey('test-key');
  await expect(service.dividends('US5801351017')).rejects.toThrow(/Kontofreigabe/);
  await expect(service.dividends('US5801351017')).rejects.not.toThrow(/secret-provider-body|test-key/);
});
it('uses a generic message when a network error echoes secret request data', async () => {
  const service = new DivvyDiaryService(dir, jest.fn().mockRejectedValue(new Error('test-key secret-request')));
  service.saveKey('test-key');
  await expect(service.dividends('US5801351017')).rejects.toThrow('DivvyDiary ist nicht erreichbar. Bitte erneut versuchen.');
});
