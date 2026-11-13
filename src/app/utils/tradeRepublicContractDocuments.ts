import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_PDF_BYTES = 16_000_000;
const PDF_MAGIC = Buffer.from('%PDF-');
const cryptoTerms = /(?:bitcoin|\bbtc\b|cryptocurrenc(?:y|ies)|crypto(?:[-\s]?assets?)?|krypto(?:währung(?:en)?|werte|assets?))/i;
const agreementTerms = /(?:\bT\s*&\s*C(?:s)?\b|\bTNC\b|\bterms?\b|\bconditions?\b|\bagreements?\b|\bcontracts?\b|\bAGB\b|\bbedingungen\b|\bvertrag(?:s|liche|lich)?\b|\bsonderbedingungen\b|krypto.{0,30}(?:bedingungen|vertrag))/i;
const excludedDocumentTypes = /(?:annual.{0,16}statement|jahresaufstellung|steuer|tax.{0,16}(?:statement|report)|kontoauszug|depotauszug|transaction|transaktionsbestätigung|order.{0,16}(?:confirmation|abrechnung)|abrechnung|invoice|rechnung)/i;

interface StoredDocumentMetadata {
  hash: string;
  fileName: string;
  title: string;
  eventType: string;
  eventDate: string | null;
  storedAt: string;
}

interface Manifest {
  version: 1;
  documents: StoredDocumentMetadata[];
}

export interface LoadedTradeRepublicContractDocument extends StoredDocumentMetadata {
  text: string;
  fetchedAt: number;
}

export interface TradeRepublicContractImportSummary {
  matching: number;
  newlyStored: number;
  available: number;
  unreadable: number;
  error?: string;
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function loadPdfParser(): typeof import('pdf-parse') {
  // Keep the PDF.js dependency unloaded when contract retrieval is not requested.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('pdf-parse');
}

async function extractPdfText(data: Buffer): Promise<string> {
  const { PDFParse } = loadPdfParser();
  const parser = new PDFParse({ data });
  try { return (await parser.getText()).text; }
  finally { await parser.destroy(); }
}

export function isBitcoinContractCandidate(metadata: string, documentText: string): boolean {
  const explicitCryptoTermsUpdate = /CRYPTO_TNC_UPDATE/i.test(metadata);
  if (explicitCryptoTermsUpdate) return true;
  if (!cryptoTerms.test(metadata) || !agreementTerms.test(metadata) || excludedDocumentTypes.test(metadata)) return false;
  return cryptoTerms.test(documentText) && agreementTerms.test(documentText);
}

function validMetadata(value: unknown): value is StoredDocumentMetadata {
  const entry = object(value);
  return !!entry && typeof entry.hash === 'string' && /^[a-f0-9]{64}$/.test(entry.hash)
    && entry.fileName === `${entry.hash}.pdf`
    && typeof entry.title === 'string' && entry.title.length > 0 && entry.title.length <= 500
    && typeof entry.eventType === 'string' && entry.eventType.length <= 200
    && (entry.eventDate === null || typeof entry.eventDate === 'string' && Number.isFinite(Date.parse(entry.eventDate)))
    && typeof entry.storedAt === 'string' && Number.isFinite(Date.parse(entry.storedAt));
}

function eventDate(value: unknown): string | null {
  const timestamp = text(value);
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function documentEntries(events: unknown): { event: Record<string, unknown>; document: Record<string, unknown> }[] {
  if (!Array.isArray(events)) throw new Error('Die Trade-Republic-Dokumentliste ist ungültig.');
  const result: { event: Record<string, unknown>; document: Record<string, unknown> }[] = [];
  for (const eventValue of events) {
    const event = object(eventValue);
    const details = object(event?.details);
    if (!event || !Array.isArray(details?.sections)) continue;
    for (const sectionValue of details.sections) {
      const section = object(sectionValue);
      if (section?.type !== 'documents' || !Array.isArray(section.data)) continue;
      for (const documentValue of section.data) {
        const document = object(documentValue);
        if (document) result.push({ event, document });
      }
    }
  }
  return result;
}

export class TradeRepublicContractDocumentStore {
  private readonly directory: string;
  private readonly manifestFile: string;

  constructor(userDataPath: string, private readonly parsePdfText = extractPdfText) {
    this.directory = path.join(userDataPath, 'trade-republic-bitcoin-contracts');
    this.manifestFile = path.join(this.directory, 'manifest.json');
  }

  private readManifest(): Manifest {
    if (!fs.existsSync(this.manifestFile)) return { version: 1, documents: [] };
    const saved = object(JSON.parse(fs.readFileSync(this.manifestFile, 'utf8')));
    if (saved?.version !== 1 || !Array.isArray(saved.documents) || !saved.documents.every(validMetadata))
      throw new Error('Der lokale Bestand der Trade-Republic-Vertragsunterlagen ist beschädigt.');
    return { version: 1, documents: saved.documents };
  }

  private writeManifest(manifest: Manifest): void {
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = `${this.manifestFile}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(manifest), { mode: 0o600 });
      fs.renameSync(temporary, this.manifestFile);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }

  async importFromPytrExport(exportDirectory: string): Promise<TradeRepublicContractImportSummary> {
    const eventFile = path.join(exportDirectory, 'events_with_documents.json');
    if (!fs.existsSync(eventFile)) throw new Error('pytr hat keine Dokumentenliste für den Vertragsabruf bereitgestellt.');
    let events: unknown;
    try { events = JSON.parse(fs.readFileSync(eventFile, 'utf8')); }
    catch { throw new Error('Die von pytr exportierte Dokumentenliste konnte nicht gelesen werden.'); }

    const manifest = this.readManifest();
    const existing = new Map(manifest.documents.map(document => [document.hash, document]));
    const exportRoot = path.resolve(exportDirectory) + path.sep;
    let matching = 0;
    let newlyStored = 0;
    let unreadable = 0;
    const storedAt = new Date().toISOString();

    for (const { event, document } of documentEntries(events)) {
      const eventType = text(event.eventType).slice(0, 200);
      const metadata = [eventType, event.title, event.subtitle, document.title, document.detail]
        .map(text).join(' ');
      if (!cryptoTerms.test(metadata) || !agreementTerms.test(metadata) && !/CRYPTO_TNC_UPDATE/i.test(eventType)
        || excludedDocumentTypes.test(metadata) && !/CRYPTO_TNC_UPDATE/i.test(eventType)) continue;

      const sourcePath = text(document.local_filepath);
      const resolvedPath = path.resolve(sourcePath);
      if (!sourcePath || !resolvedPath.startsWith(exportRoot) || path.extname(resolvedPath).toLowerCase() !== '.pdf') {
        unreadable++;
        continue;
      }

      let contents: Buffer;
      let documentText: string;
      try {
        const stat = fs.statSync(resolvedPath);
        if (!stat.isFile() || stat.size < PDF_MAGIC.length || stat.size > MAX_PDF_BYTES) {
          unreadable++;
          continue;
        }
        contents = fs.readFileSync(resolvedPath);
        if (!contents.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
          unreadable++;
          continue;
        }
        documentText = await this.parsePdfText(contents);
      } catch {
        unreadable++;
        continue;
      }
      if (!isBitcoinContractCandidate(metadata, documentText)) continue;

      matching++;
      const hash = crypto.createHash('sha256').update(contents).digest('hex');
      if (existing.has(hash)) continue;

      const fileName = `${hash}.pdf`;
      fs.mkdirSync(this.directory, { recursive: true });
      const destination = path.join(this.directory, fileName);
      const temporary = `${destination}.tmp`;
      try {
        fs.writeFileSync(temporary, contents, { mode: 0o600 });
        fs.renameSync(temporary, destination);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
      const metadataEntry: StoredDocumentMetadata = {
        hash, fileName,
        title: [text(event.title), text(event.subtitle), text(document.title)].filter(Boolean).join(' · ').slice(0, 500)
          || 'Trade-Republic-Kryptovertragsunterlage',
        eventType,
        eventDate: eventDate(event.timestamp),
        storedAt,
      };
      manifest.documents.push(metadataEntry);
      existing.set(hash, metadataEntry);
      newlyStored++;
    }

    if (newlyStored) this.writeManifest(manifest);
    return { matching, newlyStored, available: manifest.documents.length, unreadable };
  }

  getStoredCount(): number {
    return this.readManifest().documents.length;
  }

  async loadForRiskReview(): Promise<LoadedTradeRepublicContractDocument[]> {
    const manifest = this.readManifest();
    const loaded: LoadedTradeRepublicContractDocument[] = [];
    for (const entry of manifest.documents) {
      const file = path.join(this.directory, entry.fileName);
      const contents = fs.readFileSync(file);
      const hash = crypto.createHash('sha256').update(contents).digest('hex');
      if (hash !== entry.hash || contents.length > MAX_PDF_BYTES || !contents.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC))
        throw new Error('Eine gespeicherte Trade-Republic-Vertragsunterlage ist beschädigt.');
      loaded.push({ ...entry, text: await this.parsePdfText(contents), fetchedAt: Date.parse(entry.storedAt) });
    }
    return loaded;
  }

  clear(): void {
    fs.rmSync(this.directory, { recursive: true, force: true });
  }
}
