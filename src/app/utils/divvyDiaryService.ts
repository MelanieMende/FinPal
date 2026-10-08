import fs from 'node:fs';
import path from 'node:path';
import { safeStorage } from 'electron';

export class DivvyDiaryService {
  private readonly keyFile: string;
  constructor(dataPath: string, private readonly fetcher: typeof fetch = fetch) { this.keyFile = path.join(dataPath, 'divvydiary-api-key.bin'); }
  status() { return { hasApiKey: fs.existsSync(this.keyFile), secureStorageAvailable: safeStorage.isEncryptionAvailable() }; }
  saveKey(value: string) {
    if (typeof value !== 'string' || !value.trim() || value.length > 2048 || !/^[\x21-\x7e]+$/.test(value.trim())) throw new Error('Bitte einen gültigen DivvyDiary-API-Schlüssel eingeben.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Sichere Schlüsselspeicherung ist nicht verfügbar.');
    fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
    fs.writeFileSync(this.keyFile, safeStorage.encryptString(value.trim()), { mode: 0o600 });
    return true;
  }
  forgetKey() { if (fs.existsSync(this.keyFile)) fs.unlinkSync(this.keyFile); return true; }
  async dividends(isin: string) {
    if (typeof isin !== 'string' || !/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin)) throw new Error('Für den Dividendenabruf fehlt eine gültige ISIN.');
    if (!fs.existsSync(this.keyFile)) throw new Error('DivvyDiary benötigt einen API-Schlüssel. Bitte unter Upcoming Payments hinterlegen.');
    let key: string;
    try { key = safeStorage.decryptString(fs.readFileSync(this.keyFile)); }
    catch { throw new Error('Der gespeicherte DivvyDiary-Schlüssel kann nicht gelesen werden. Bitte erneut speichern.'); }
    let response: Response;
    try { response = await this.fetcher('https://api.divvydiary.com/symbols/' + isin, { headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new Error('DivvyDiary ist nicht erreichbar. Bitte erneut versuchen.'); }
    if (response.status === 401 || response.status === 403) throw new Error('DivvyDiary hat den API-Schlüssel abgelehnt oder die API-Nutzung nicht freigegeben. Bitte Schlüssel und Kontofreigabe prüfen.');
    if (!response.ok) throw new Error('Dividenden konnten nicht geladen werden (HTTP ' + response.status + ').');
    let data: any;
    try { data = await response.json(); } catch { throw new Error('DivvyDiary hat keine gültigen Dividendendaten geliefert.'); }
    if (!data || !Array.isArray(data.dividends)) throw new Error('DivvyDiary hat keine gültigen Dividendendaten geliefert.');
    return data;
  }
}
