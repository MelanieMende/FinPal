import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TradeRepublicContractDocumentStore, isBitcoinContractCandidate } from './tradeRepublicContractDocuments';

it('matches crypto terms but excludes account statements and transactions', () => {
  expect(isBitcoinContractCandidate('CRYPTO_TNC_UPDATE_2025', 'Trade Republic Bank GmbH')).toBe(true);
  expect(isBitcoinContractCandidate(
    'CRYPTO_TNC_UPDATE_2025 Crypto terms',
    'Terms and conditions for crypto-assets. Custody and execution rules apply.',
  )).toBe(true);
  expect(isBitcoinContractCandidate(
    'Crypto annual statement',
    'Crypto annual statement and tax report for the account holder.',
  )).toBe(false);
  expect(isBitcoinContractCandidate(
    'Bitcoin transaction confirmation',
    'Bitcoin purchase transaction confirmation.',
  )).toBe(false);
});

it('stores only matching local PDFs, deduplicates them and reloads them for risk review', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-tr-contracts-'));
  try {
    const exportDirectory = path.join(root, 'export');
    const userDataPath = path.join(root, 'user-data');
    fs.mkdirSync(exportDirectory, { recursive: true });
    const contractPath = path.join(exportDirectory, 'contract.pdf');
    const statementPath = path.join(exportDirectory, 'statement.pdf');
    fs.writeFileSync(contractPath, Buffer.from('%PDF-1.4\ncontract'));
    fs.writeFileSync(statementPath, Buffer.from('%PDF-1.4\nstatement'));
    fs.writeFileSync(path.join(exportDirectory, 'events_with_documents.json'), JSON.stringify([
      { eventType: 'CRYPTO_TNC_UPDATE_2025', title: 'Crypto terms updated', timestamp: '2025-01-15T12:00:00Z',
        details: { sections: [{ type: 'documents', data: [
          { title: 'Crypto Terms and Conditions', local_filepath: contractPath },
        ] }] } },
      { eventType: 'CRYPTO_ANNUAL_STATEMENT', title: 'Crypto annual statement', timestamp: '2025-12-31T12:00:00Z',
        details: { sections: [{ type: 'documents', data: [
          { title: 'Annual statement', local_filepath: statementPath },
        ] }] } },
    ]));

    const store = new TradeRepublicContractDocumentStore(userDataPath, async contents =>
      contents.toString().includes('contract')
        ? 'Trade Republic Bank GmbH'
        : 'Crypto annual statement and tax report for the account holder.');
    const imported = await store.importFromPytrExport(exportDirectory);
    expect(imported).toMatchObject({ matching: 1, newlyStored: 1, available: 1, unreadable: 0 });
    expect(store.getStoredCount()).toBe(1);
    expect(await store.loadForRiskReview()).toMatchObject([{
      title: 'Crypto terms updated · Crypto Terms and Conditions',
      eventDate: '2025-01-15T12:00:00.000Z',
      text: 'Trade Republic Bank GmbH',
    }]);
    expect(await store.importFromPytrExport(exportDirectory)).toMatchObject({
      matching: 1, newlyStored: 0, available: 1, unreadable: 0,
    });
    store.clear();
    expect(store.getStoredCount()).toBe(0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('surfaces local storage failures instead of reporting them as unreadable PDFs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'finpal-tr-contract-storage-'));
  try {
    const exportDirectory = path.join(root, 'export');
    const blockedUserDataPath = path.join(root, 'user-data');
    fs.mkdirSync(exportDirectory, { recursive: true });
    fs.writeFileSync(blockedUserDataPath, 'not a directory');
    const contractPath = path.join(exportDirectory, 'contract.pdf');
    fs.writeFileSync(contractPath, Buffer.from('%PDF-1.4\ncontract'));
    fs.writeFileSync(path.join(exportDirectory, 'events_with_documents.json'), JSON.stringify([{
      eventType: 'CRYPTO_TNC_UPDATE_2025', title: 'Crypto terms updated',
      details: { sections: [{ type: 'documents', data: [{ title: 'Crypto Terms and Conditions', local_filepath: contractPath }] }] },
    }]));
    const store = new TradeRepublicContractDocumentStore(blockedUserDataPath, async () =>
      'Terms and conditions for crypto-assets. Custody and execution rules apply.');

    await expect(store.importFromPytrExport(exportDirectory)).rejects.toThrow();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
