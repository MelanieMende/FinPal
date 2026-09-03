import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { safeStorage } from 'electron';
import extract from 'extract-zip';

const UV_VERSION = '0.11.30';
const UV_WINDOWS_X64_SHA256 = 'be8d78c992312212e5cc05e9f9de3fa996db73b7c86a186dfb9231eb9f91d33e';

export interface TradeRepublicCredentials { phone: string; pin: string; }
export interface TradeRepublicRecord {
  date: string;
  type: 'Buy' | 'Sell' | 'Dividend';
  assetName: string;
  isin: string;
  shares: number;
  pricePerShare: number;
  fee: number;
  tax: number;
  totalAmount: number;
}

type PytrRow = Record<string, unknown>;
const stringValue = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const numberValue = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Number(value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function parsePytrJsonLines(contents: string): { records: TradeRepublicRecord[]; skipped: number } {
  const records: TradeRepublicRecord[] = [];
  let skipped = 0;
  for (const line of contents.split(/\r?\n/).filter(Boolean)) {
    let row: PytrRow;
    try { row = JSON.parse(line) as PytrRow; } catch { skipped += 1; continue; }
    const rawType = stringValue(row.Type ?? row.type).toLowerCase();
    const type = rawType.includes('buy') ? 'Buy'
      : rawType.includes('sell') ? 'Sell'
      : (rawType.includes('dividend') || rawType.includes('distribution')) ? 'Dividend' : null;
    const date = stringValue(row.Date ?? row.date).slice(0, 10);
    const isin = stringValue(row.ISIN ?? row.isin).toUpperCase();
    const shares = Math.abs(numberValue(row.Shares ?? row.shares));
    const fee = Math.abs(numberValue(row.Fees ?? row.fees));
    const tax = Math.abs(numberValue(row.Taxes ?? row.taxes));
    const totalAmount = Math.abs(numberValue(row.Value ?? row.value));
    if (!type || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)
      || !totalAmount || (type !== 'Dividend' && !shares)) {
      skipped += 1; continue;
    }
    records.push({
      date, type, assetName: stringValue(row.Note ?? row.note) || isin, isin, shares, fee, tax, totalAmount,
      pricePerShare: type === 'Dividend' ? 0 : Math.max(0, (totalAmount - fee - tax) / shares),
    });
  }
  return { records, skipped };
}

export class TradeRepublicSync {
  private readonly credentialsFile: string;
  private readonly runnerDir: string;
  constructor(userDataPath: string) {
    this.credentialsFile = path.join(userDataPath, 'trade-republic-credentials.bin');
    this.runnerDir = path.join(userDataPath, 'tools', `uv-${UV_VERSION}`);
  }
  hasSavedCredentials(): boolean { return fs.existsSync(this.credentialsFile) && safeStorage.isEncryptionAvailable(); }
  forgetCredentials(): void { if (fs.existsSync(this.credentialsFile)) fs.unlinkSync(this.credentialsFile); }
  private saveCredentials(value: TradeRepublicCredentials): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Die sichere Speicherung ist auf diesem System nicht verfügbar.');
    fs.writeFileSync(this.credentialsFile, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 });
  }
  private readCredentials(): TradeRepublicCredentials | null {
    if (!this.hasSavedCredentials()) return null;
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(this.credentialsFile))) as TradeRepublicCredentials;
  }
  isRunnerAvailable(): Promise<boolean> {
    return Promise.resolve(process.platform === 'win32' && process.arch === 'x64');
  }
  async sync(credentials: TradeRepublicCredentials | null, remember: boolean): Promise<{ records: TradeRepublicRecord[]; skipped: number }> {
    const login = credentials?.phone && credentials?.pin ? credentials : this.readCredentials();
    if (!login) throw new Error('Bitte Telefonnummer und PIN eingeben.');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-tr-'));
    const outputFile = path.join(tempDir, 'transactions.jsonl');
    try {
      await this.runPytr(login, outputFile);
      const result = parsePytrJsonLines(fs.readFileSync(outputFile, 'utf8'));
      if (remember && credentials) this.saveCredentials(credentials);
      return result;
    } finally { fs.rmSync(tempDir, { recursive: true, force: true }); }
  }
  private runPytr(credentials: TradeRepublicCredentials, outputFile: string): Promise<void> {
    return this.ensureRunner().then(runner => new Promise((resolve, reject) => {
      // Python's getpass reads directly from the Windows console instead of a
      // redirected stdin pipe. Give pytr an isolated, short-lived profile so it
      // can read the credentials non-interactively without exposing them in the
      // process arguments. The parent temp directory is deleted after syncing.
      const isolatedHome = path.join(path.dirname(outputFile), 'profile');
      const pytrDir = path.join(isolatedHome, '.pytr');
      fs.mkdirSync(pytrDir, { recursive: true });
      fs.writeFileSync(path.join(pytrDir, 'credentials'), `${credentials.phone.trim()}\n${credentials.pin.trim()}\n`, { mode: 0o600 });
      const args = ['pytr', 'export_transactions', '--lang', 'en', '--format', 'json', '--no-date-with-time', '--sort', '--v2', '--outputdir', path.dirname(outputFile), outputFile];
      const child = spawn(runner, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1', USERPROFILE: isolatedHome, HOME: isolatedHome },
      });
      let output = '';
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Zeitüberschreitung bei der Anmeldung.')); }, 8 * 60 * 1000);
      child.stdout.on('data', chunk => { output += chunk.toString(); });
      child.stderr.on('data', chunk => { output += chunk.toString(); });
      child.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once('exit', code => {
        clearTimeout(timeout);
        if (code === 0 && fs.existsSync(outputFile)) resolve();
        else reject(new Error(output.trim().split(/\r?\n/).slice(-4).join('\n') || `pytr wurde mit Code ${code} beendet.`));
      });
    }));
  }

  private async ensureRunner(): Promise<string> {
    if (process.platform !== 'win32' || process.arch !== 'x64') {
      throw new Error('Die automatische Trade-Republic-Synchronisierung wird derzeit nur unter Windows x64 unterstützt.');
    }
    const runner = path.join(this.runnerDir, 'uvx.exe');
    if (fs.existsSync(runner)) return runner;

    fs.mkdirSync(this.runnerDir, { recursive: true });
    const archive = path.join(this.runnerDir, 'uv.zip');
    try {
      const url = `https://releases.astral.sh/github/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`;
      const response = await fetch(url, { redirect: 'follow' });
      if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status}).`);
      const contents = Buffer.from(await response.arrayBuffer());
      const checksum = crypto.createHash('sha256').update(contents).digest('hex');
      if (checksum !== UV_WINDOWS_X64_SHA256) throw new Error('Die Prüfsumme der Laufzeitkomponente ist ungültig.');
      fs.writeFileSync(archive, contents);
      await extract(archive, { dir: this.runnerDir });
      if (!fs.existsSync(runner)) throw new Error('Die Laufzeitkomponente konnte nicht entpackt werden.');
      return runner;
    } catch (error) {
      for (const name of ['uv.exe', 'uvx.exe']) {
        const candidate = path.join(this.runnerDir, name);
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
      throw new Error(`FinPal konnte die Synchronisierungskomponente nicht automatisch einrichten: ${error instanceof Error ? error.message : error}`);
    } finally {
      if (fs.existsSync(archive)) fs.unlinkSync(archive);
    }
  }
}
