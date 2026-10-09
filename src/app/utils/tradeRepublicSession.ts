import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
interface Encryption { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string; getSelectedStorageBackend?(): string; }
export interface SessionCredentials {phone: string; pin: string;}
const binding = (value: SessionCredentials) => crypto.createHash('sha256').update(JSON.stringify([value.phone.trim(), value.pin.trim()])).digest('hex');
function validCookies(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100 && JSON.stringify(value).length <= 200000 && value.every(c =>
    c && typeof c.name === 'string' && c.name.length > 0 && typeof c.value === 'string' && typeof c.domain === 'string'
    && /^(\.?)([a-z0-9-]+\.)*traderepublic\.com$/.test(c.domain) && typeof c.path === 'string' && c.path.startsWith('/')
    && typeof c.secure === 'boolean' && (c.expires === null || (Number.isSafeInteger(c.expires) && c.expires >= 0)));
}
// Only encrypted bytes reach disk; session contents never go to the renderer.
export class TradeRepublicSessionStore {
  private readonly file: string;
  constructor(dataPath: string, private readonly encryption: Encryption) { this.file = path.join(dataPath, 'trade-republic-trading-session.bin'); }
  private available() { return this.encryption.isEncryptionAvailable() && this.encryption.getSelectedStorageBackend?.() !== 'basic_text'; }
  clear() { if (fs.existsSync(this.file)) fs.unlinkSync(this.file); }
  load(credentials: SessionCredentials): unknown {
    if (!this.available() || !fs.existsSync(this.file)) return undefined;
    try {
      if (fs.statSync(this.file).size > 300000) throw new Error();
      const saved = JSON.parse(this.encryption.decryptString(fs.readFileSync(this.file)));
      if (saved.version !== 1 || saved.binding !== binding(credentials) || !validCookies(saved.cookies)) throw new Error();
      return saved.cookies;
    } catch { this.clear(); return undefined; }
  }
  save(credentials: SessionCredentials, cookies: unknown) {
    if (cookies === null) { this.clear(); return; }
    if (!this.available() || !validCookies(cookies)) return;
    const encrypted = this.encryption.encryptString(JSON.stringify({version: 1, binding: binding(credentials), cookies}));
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const temporary = this.file + '.tmp';
    try { fs.writeFileSync(temporary, encrypted, {mode: 0o600}); fs.renameSync(temporary, this.file); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  }
}
