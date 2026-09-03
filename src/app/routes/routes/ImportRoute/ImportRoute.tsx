import React, { useState, useEffect } from 'react';
import { Button, Card, H3, HTMLTable, Icon, Intent, NonIdealState, Spinner, Callout, Tag, Alert } from '@blueprintjs/core';
import { useAppDispatch, useAppSelector } from './../../../hooks';
import { loadFiles, removeRecord, setPendingRecords } from './../../../store/import/import.reducer';
import * as assetsReducer from './../../../store/assets/assets.reducer';
import * as transactionsReducer from './../../../store/transactions/transactions.reducer';
import * as dividendsReducer from './../../../store/dividends/dividends.reducer';
import * as assetCreationReducer from './../../../store/assetCreation/assetCreation.reducer';
import * as appStateReducer from './../../../store/appState/appState.reducer';
import CreateAndEditAssetOverlay from '../AssetsRoute/components/CreateAndEditAssetOverlay';

export default function ImportRoute() {
    const pendingImportStorageKey = 'finpal.pendingTradeRepublicImport.v1';
    const dispatch = useAppDispatch();
    const assets = useAppSelector(state => state.assets);
    const transactions = useAppSelector(state => state.transactions);
    const dividends = useAppSelector(state => state.dividends);
    const { pendingRecords, isLoading, error } = useAppSelector(state => state.import);
    const [mappings, setMappings] = useState<{ [key: string]: number }>({});
    const [importing, setImporting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showSuccessAlert, setShowSuccessAlert] = useState(false);
    const [showErrorAlert, setShowErrorAlert] = useState(false);
    const [trStatus, setTrStatus] = useState<{ runnerAvailable: boolean; hasSavedCredentials: boolean } | null>(null);
    const [trPhone, setTrPhone] = useState('');
    const [trPin, setTrPin] = useState('');
    const [rememberTr, setRememberTr] = useState(true);
    const [syncingTr, setSyncingTr] = useState(false);
    const [trMessage, setTrMessage] = useState<string | null>(null);
    const [pendingCacheReady, setPendingCacheReady] = useState(false);
    const [showDuplicates, setShowDuplicates] = useState(false);
    useEffect(() => {
        if (pendingRecords.length > 0) return;
        try {
            const storedRecords = JSON.parse(localStorage.getItem(pendingImportStorageKey) || '[]');
            if (Array.isArray(storedRecords) && storedRecords.length > 0) dispatch(setPendingRecords(storedRecords));
        } catch {
            localStorage.removeItem(pendingImportStorageKey);
        } finally {
            setPendingCacheReady(true);
        }
    }, []);

    useEffect(() => {
        if (!pendingCacheReady) return;
        if (pendingRecords.length > 0) localStorage.setItem(pendingImportStorageKey, JSON.stringify(pendingRecords));
        else localStorage.removeItem(pendingImportStorageKey);
    }, [pendingRecords, pendingCacheReady]);

    useEffect(() => {
        window.API.getTradeRepublicStatus?.().then(setTrStatus).catch(() => setTrStatus({ runnerAvailable: false, hasSavedCredentials: false }));
    }, []);

    const isDuplicate = (record: typeof pendingRecords[number], assetID?: number) => {
        if (!assetID) return false;
        if (record.type === 'Dividend') {
            return dividends.some(d => d.date === record.date && d.asset_ID === assetID && Math.abs(d.income - record.totalAmount) < 0.01);
        }
        return transactions.some(t =>
            t.date === record.date && t.asset_ID === assetID && t.type === record.type &&
            Math.abs(Math.abs(t.in_out) - record.totalAmount) < 0.05
        );
    };

    const importableCount = pendingRecords.filter((record, index) =>
        !!mappings[index] && !isDuplicate(record, mappings[index])
    ).length;
    const duplicateCount = pendingRecords.filter((record, index) =>
        isDuplicate(record, mappings[index])
    ).length;

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = Array.from(e.dataTransfer.files)
            .filter(file => file.name.toLowerCase().endsWith('.pdf'))
            .map(file => window.API.getPathForFile?.(file) ?? '')
            .filter(path => !!path);

        if (files.length > 0) {
            dispatch(loadFiles(files));
        }
    };

    // Initial mapping based on ISIN or Name
    useEffect(() => {
        const newMappings = { ...mappings };
        pendingRecords.forEach((record, index) => {
            if (newMappings[index] === undefined) {
                const foundAsset = assets.find(a => (a.isin && a.isin === record.isin) || (a.name?.toLowerCase() === record.assetName?.toLowerCase() && a.name));
                if (foundAsset) {
                    newMappings[index] = foundAsset.ID;
                }
            }
        });
        setMappings(newMappings);
    }, [pendingRecords, assets]);

    const handleSelectFiles = async () => {
        const files = await window.API.openFiles?.() ?? [];
        if (files && files.length > 0) {
            dispatch(loadFiles(files));
        }
    };

    const handleTradeRepublicSync = async () => {
        setSyncingTr(true);
        setTrMessage('FinPal richtet beim ersten Mal die Synchronisierung ein. Bestätige anschließend die Anmeldung in deiner Trade-Republic-App.');
        try {
            if (!window.API.syncTradeRepublic) throw new Error('Die Trade-Republic-Schnittstelle ist nicht verfügbar.');
            const result = await window.API.syncTradeRepublic({
                phone: trStatus?.hasSavedCredentials && !trPhone && !trPin ? undefined : trPhone,
                pin: trStatus?.hasSavedCredentials && !trPhone && !trPin ? undefined : trPin,
                remember: rememberTr,
            });
            if (!result.records.length) {
                throw new Error(`Keine importierbaren Transaktionen empfangen (${result.skipped} Buchungen übersprungen). Die bisherige Liste bleibt erhalten.`);
            }
            // Persist before updating Redux so a renderer reload between both
            // operations cannot lose an otherwise successful broker response.
            localStorage.setItem(pendingImportStorageKey, JSON.stringify(result.records));
            dispatch(setPendingRecords(result.records));
            setTrPin('');
            setTrStatus({ runnerAvailable: true, hasSavedCredentials: rememberTr || !!trStatus?.hasSavedCredentials });
            setTrMessage(`${result.records.length} Transaktion(en) geladen${result.skipped ? `, ${result.skipped} nicht unterstützte Buchung(en) übersprungen` : ''}.`);
        } catch (syncError) {
            setTrMessage(syncError instanceof Error ? syncError.message : 'Synchronisierung fehlgeschlagen.');
        } finally {
            setSyncingTr(false);
        }
    };

    const forgetTradeRepublicCredentials = async () => {
        await window.API.forgetTradeRepublicCredentials?.();
        setTrStatus(current => ({ runnerAvailable: current?.runnerAvailable ?? true, hasSavedCredentials: false }));
        setTrMessage('Gespeicherte Zugangsdaten wurden gelöscht.');
    };

    const handleImportAll = async () => {
        if (!importableCount) {
            setShowErrorAlert(true);
            return;
        }
        setImporting(true);
        try {
            const importedIndices = new Set<number>();
            for (let i = 0; i < pendingRecords.length; i++) {
                const record = pendingRecords[i];
                const assetID = mappings[i];
                
                if (!assetID || isDuplicate(record, assetID)) continue;

                if (record.type === 'Dividend') {
                    const sql = `INSERT INTO dividends (date, asset_ID, income) VALUES ('${record.date}', ${assetID}, ${record.totalAmount})`;
                    const result = await window.API.sendToDB(sql);
                    if (typeof result === 'string') throw new Error(result);
                } else {
                    const mappedAsset = assets.find(a => a.ID === assetID);
                    const isBond = mappedAsset?.type === 'Bond';
                    const finalShares = isBond ? 1 : record.shares;
                    const finalPrice = isBond ? record.totalAmount : record.pricePerShare;

                    const type = record.type === 'Buy' ? 'Buy' : 'Sell';
                    const sql = `INSERT INTO transactions (date, type, asset_ID, amount, price_per_share, fee, solidarity_surcharge) VALUES ('${record.date}', '${type}', ${assetID}, ${finalShares}, ${finalPrice}, ${record.fee}, ${record.tax})`;
                    const result = await window.API.sendToDB(sql);
                    if (typeof result === 'string') throw new Error(result);
                }
                importedIndices.add(i);
            }

            // Reload global data to reflect new transactions
            await dispatch(assetsReducer.loadAssets(undefined));
            await dispatch(transactionsReducer.loadTransactions(undefined));
            await dispatch(dividendsReducer.loadDividends());
            
            dispatch(setPendingRecords(pendingRecords.filter((_record, index) => !importedIndices.has(index))));
            setMappings({});
            setShowSuccessAlert(true);
        } catch (e) {
            console.error('Import failed:', e);
            setShowErrorAlert(true);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div 
            id="ImportRoute" 
            className="relative w-full h-full p-4 animate-in fade-in duration-500"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {isDragging && (
                <div className="absolute inset-4 z-50 flex flex-col items-center justify-center bg-blue-600/20 backdrop-blur-md border-2 border-dashed border-blue-400 rounded-2xl pointer-events-none animate-in zoom-in duration-300">
                    <Icon icon="cloud-upload" size={64} className="text-blue-400 mb-4" />
                    <H3 className="text-white">Drop PDFs here to import</H3>
                    <p className="text-blue-200">Release to start parsing Trade Republic documents</p>
                </div>
            )}
            <div className="mb-8 flex justify-between items-center">
                <div>
                    <H3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                        Import Data
                    </H3>
                    <p className="text-gray-400 font-medium">Upload your Trade Republic PDFs to sync your transactions.</p>
                </div>
                <div className="flex gap-2">
                    <Button 
                        icon="document-open" 
                        large 
                        intent={Intent.PRIMARY} 
                        onClick={handleSelectFiles}
                        className="glass-button"
                    >
                        Select PDFs
                    </Button>
                    {pendingRecords.length > 0 && (
                        <Button 
                            icon="cloud-upload" 
                            large 
                            intent={Intent.SUCCESS} 
                            onClick={handleImportAll}
                            loading={importing}
                            className="glass-button"
                        >
                            {importableCount} importieren
                        </Button>
                    )}
                </div>
            </div>

            <Card className="glass-card mb-6 p-5">
                <div className="flex flex-wrap justify-between gap-4">
                    <div className="min-w-64 flex-1">
                        <H3 className="m-0 mb-1 text-lg">Trade Republic automatisch synchronisieren</H3>
                        <p className="text-gray-400 mb-4">FinPal lädt die strukturierten Umsatzdaten direkt über den lokalen pytr-Client. PDFs sind nicht erforderlich.</p>
                        {trStatus?.runnerAvailable === false && <Callout intent={Intent.WARNING}>Diese Funktion wird derzeit nur unter Windows x64 unterstützt.</Callout>}
                        {trStatus?.runnerAvailable && <p className="text-xs text-gray-500">Die benötigte Laufzeitkomponente wird beim ersten Start automatisch und geprüft eingerichtet.</p>}
                        {trMessage && <Callout className="mt-3" intent={trMessage.includes('fehl') || trMessage.includes('Bitte Telefonnummer') ? Intent.DANGER : Intent.PRIMARY}>{trMessage}</Callout>}
                    </div>
                    <div className="w-full max-w-md space-y-3">
                        {!trStatus?.hasSavedCredentials && (
                            <>
                                <input aria-label="Trade Republic Telefonnummer" type="tel" placeholder="Telefonnummer, z. B. +491701234567" value={trPhone} onChange={event => setTrPhone(event.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2" />
                                <input aria-label="Trade Republic PIN" type="password" placeholder="PIN" value={trPin} onChange={event => setTrPin(event.target.value)} className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2" />
                                <label className="flex items-center gap-2 text-sm text-gray-300">
                                    <input type="checkbox" checked={rememberTr} onChange={event => setRememberTr(event.target.checked)} />
                                    Lokal mit Windows-DPAPI verschlüsselt speichern
                                </label>
                            </>
                        )}
                        <div className="flex gap-2 justify-end">
                            {trStatus?.hasSavedCredentials && <Button minimal intent={Intent.DANGER} onClick={forgetTradeRepublicCredentials}>Zugangsdaten löschen</Button>}
                            <Button icon="refresh" intent={Intent.SUCCESS} loading={syncingTr} disabled={syncingTr} onClick={handleTradeRepublicSync}>
                                Jetzt synchronisieren
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64">
                    <Spinner size={50} />
                    <p className="mt-4 text-gray-400">Parsing documents...</p>
                </div>
            ) : pendingRecords.length === 0 ? (
                <Card className="glass-card flex flex-col items-center justify-center p-12 text-center">
                    <NonIdealState
                        icon="document"
                        title="No files selected"
                        description="Select one or more Trade Republic PDF statements to begin the import process."
                        action={<Button icon="plus" text="Add Files" onClick={handleSelectFiles} />}
                    />
                </Card>
            ) : (
                <div className="space-y-4">
                    {error && <Callout intent={Intent.DANGER} icon="error" title="Error">{error}</Callout>}
                    
                    <Card className="glass-card p-0 overflow-hidden">
                        <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between gap-3">
                            <H3 className="m-0 text-sm font-bold uppercase tracking-wider text-gray-300">Review Transactions</H3>
                            <Button
                                small
                                minimal
                                icon={showDuplicates ? 'eye-off' : 'eye-open'}
                                active={!showDuplicates}
                                disabled={duplicateCount === 0}
                                onClick={() => setShowDuplicates(value => !value)}
                            >
                                {showDuplicates ? `Duplikate ausblenden (${duplicateCount})` : `Duplikate einblenden (${duplicateCount})`}
                            </Button>
                        </div>
                        <HTMLTable interactive striped className="w-full text-left">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>ISIN</th>
                                    <th>Asset (from PDF)</th>
                                    <th>Mapped To</th>
                                    <th style={{ textAlign: 'right' }}>Shares</th>
                                    <th style={{ textAlign: 'right' }}>Price</th>
                                    <th style={{ textAlign: 'right' }}>Fee</th>
                                    <th style={{ textAlign: 'right' }}>Tax</th>
                                    <th style={{ textAlign: 'right' }}>Total</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingRecords.map((record, index) => ({ record, index }))
                                    .filter(({ record, index }) => showDuplicates || !isDuplicate(record, mappings[index]))
                                    .map(({ record, index }) => {
                                    const mappedAsset = assets.find(a => a.ID === mappings[index]);
                                    const isAutoMatched = !!mappedAsset;
                                    
                                    // Duplicate Detection
                                    const assetID = mappings[index];
                                    const duplicate = isDuplicate(record, assetID);

                                    return (
                                        <tr key={index} className={duplicate ? "bg-orange-500/10 border-l-4 border-orange-500/50" : ""}>
                                            <td className="p-3 text-gray-400 font-mono text-sm">
                                                <div className="flex flex-col gap-1 items-start text-nowrap">
                                                    {record.date}
                                                    {duplicate && (
                                                        <Tag 
                                                            intent={Intent.WARNING} 
                                                            minimal 
                                                            round 
                                                            large
                                                            className="animate-pulse shadow-sm"
                                                        >
                                                            <Icon icon="duplicate" size={10} className="mr-1" />
                                                            DUPLICATE
                                                        </Tag>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <Tag 
                                                    intent={record.type === 'Buy' ? Intent.SUCCESS : record.type === 'Sell' ? Intent.DANGER : Intent.PRIMARY}
                                                    minimal
                                                    round
                                                >
                                                    {record.type}
                                                </Tag>
                                            </td>
                                            <td className="text-gray-400 font-mono text-sm">{record.isin}</td>
                                            <td className="font-semibold text-white">{record.assetName}</td>
                                            <td>
                                                {isAutoMatched ? (
                                                    <div className="flex items-center gap-2">
                                                        <Tag intent={Intent.SUCCESS} minimal icon="tick-circle">
                                                            {mappedAsset.name}
                                                        </Tag>
                                                        <select
                                                            aria-label="Asset-Zuordnung ändern"
                                                            value={mappings[index] || ''}
                                                            className="bg-gray-800 border border-gray-600 rounded text-xs p-1"
                                                            onChange={(e) => setMappings({ ...mappings, [index]: Number(e.target.value) })}
                                                        >
                                                            {assets.map(a => <option key={a.ID} value={a.ID}>{a.name}</option>)}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <Tag intent={Intent.WARNING} minimal icon="warning-sign">
                                                            Needs Mapping
                                                        </Tag>
                                                        <select 
                                                            className="bg-gray-800 border border-gray-600 rounded text-xs p-1"
                                                            onChange={(e) => setMappings({ ...mappings, [index]: parseInt(e.target.value) })}
                                                        >
                                                            <option value="">Select Asset...</option>
                                                            {assets.map(a => <option key={a.ID} value={a.ID}>{a.name}</option>)}
                                                        </select>
                                                        <Button 
                                                            icon="plus" 
                                                            minimal 
                                                            small 
                                                            intent={Intent.PRIMARY}
                                                            onClick={() => {
                                                                dispatch(assetCreationReducer.prefillFromISIN({ isin: record.isin, fallbackName: record.assetName }));
                                                                dispatch(appStateReducer.setAssetOverlayType(appStateReducer.AssetOverlayType.NEW));
                                                                dispatch(appStateReducer.setShowAssetOverlay(true));
                                                            }}
                                                        >
                                                            Create
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-blue-300">{mappedAsset?.type === 'Bond' ? '1.000000' : (record.shares ? record.shares.toFixed(6) : '-')}</td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-gray-300 text-nowrap">{mappedAsset?.type === 'Bond' ? record.totalAmount.toFixed(2) + ' €' : (record.pricePerShare ? record.pricePerShare.toFixed(2) + ' €' : '-')}</td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-orange-300 text-nowrap">{record.fee ? record.fee.toFixed(2) + ' €' : '0,00 €'}</td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-red-300 text-nowrap">{record.tax ? record.tax.toFixed(2) + ' €' : '0,00 €'}</td>
                                            <td style={{ textAlign: 'right' }} className="font-bold text-white font-mono text-nowrap">{record.totalAmount.toFixed(2)} €</td>
                                            <td className="text-right">
                                                <Button icon="trash" intent={Intent.DANGER} minimal onClick={() => dispatch(removeRecord(index))} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </HTMLTable>
                    </Card>
                </div>
            )}

            <Alert
                isOpen={showSuccessAlert}
                onClose={() => setShowSuccessAlert(false)}
                intent={Intent.SUCCESS}
                icon="tick-circle"
                confirmButtonText="Great!"
                className="glass-card !p-8"
            >
                <div className="text-center py-4">
                    <H3 className="text-emerald-400 mb-2">Import Successful</H3>
                    <p className="text-gray-300">Your Trade Republic transactions have been successfully added to your portfolio.</p>
                </div>
            </Alert>

            <Alert
                isOpen={showErrorAlert}
                onClose={() => setShowErrorAlert(false)}
                intent={Intent.DANGER}
                icon="error"
                confirmButtonText="Dismiss"
                className="glass-card !p-8"
            >
                <div className="text-center py-4">
                    <H3 className="text-red-400 mb-2">Import Failed</H3>
                    <p className="text-gray-300">Something went wrong while importing your transactions. Please check the console for logs.</p>
                </div>
            </Alert>
            <CreateAndEditAssetOverlay />
        </div>
    );
}
