import React, { useState, useEffect } from 'react';
import { Button, Card, H3, HTMLTable, Icon, Intent, NonIdealState, Spinner, Callout, Tag, Alert } from '@blueprintjs/core';
import { useAppDispatch, useAppSelector } from './../../../hooks';
import { loadFiles, clearImport, removeRecord } from './../../../store/import/import.reducer';
import * as assetsReducer from './../../../store/assets/assets.reducer';
import * as transactionsReducer from './../../../store/transactions/transactions.reducer';
import * as dividendsReducer from './../../../store/dividends/dividends.reducer';

export default function ImportRoute() {
    const dispatch = useAppDispatch();
    const assets = useAppSelector(state => state.assets);
    const { pendingRecords, isLoading, error } = useAppSelector(state => state.import);
    const [mappings, setMappings] = useState<{ [key: string]: number }>({});
    const [importing, setImporting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [showSuccessAlert, setShowSuccessAlert] = useState(false);
    const [showErrorAlert, setShowErrorAlert] = useState(false);

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
            .map(file => window.API.getPathForFile(file))
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
                const foundAsset = assets.find(a => a.isin === record.isin || a.name.toLowerCase() === record.assetName.toLowerCase());
                if (foundAsset) {
                    newMappings[index] = foundAsset.ID;
                }
            }
        });
        setMappings(newMappings);
    }, [pendingRecords, assets]);

    const handleSelectFiles = async () => {
        const files = await window.API.openFiles();
        if (files && files.length > 0) {
            dispatch(loadFiles(files));
        }
    };

    const handleImportAll = async () => {
        setImporting(true);
        const importedAssetIds = new Set<number>();
        try {
            for (let i = 0; i < pendingRecords.length; i++) {
                const record = pendingRecords[i];
                const assetID = mappings[i];
                
                if (!assetID) continue;
                importedAssetIds.add(assetID);

                if (record.type === 'Dividend') {
                    const sql = `INSERT INTO dividends (date, asset_ID, income) VALUES ('${record.date}', ${assetID}, ${record.totalAmount})`;
                    await window.API.sendToDB(sql);
                } else {
                    const type = record.type === 'Buy' ? 'Buy' : 'Sell';
                    const sql = `INSERT INTO transactions (date, type, asset_ID, amount, price_per_share, fee, solidarity_surcharge) VALUES ('${record.date}', '${type}', ${assetID}, ${record.shares}, ${record.pricePerShare}, ${record.fee}, ${record.tax})`;
                    await window.API.sendToDB(sql);
                }
            }
            
            const assetIDs = Array.from(importedAssetIds);

            // Reload only affected data
            await dispatch(assetsReducer.loadAssets({ assetIDs }));
            await dispatch(transactionsReducer.loadTransactions({ assetIDs }));
            await dispatch(dividendsReducer.loadDividends());
            
            dispatch(clearImport());
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
                            Import {pendingRecords.length} Items
                        </Button>
                    )}
                </div>
            </div>

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
                        <div className="p-4 border-b border-white/5 bg-white/5">
                            <H3 className="m-0 text-sm font-bold uppercase tracking-wider text-gray-300">Review Transactions</H3>
                        </div>
                        <HTMLTable interactive striped className="w-full text-left">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Type</th>
                                    <th>Asset (from PDF)</th>
                                    <th>ISIN</th>
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
                                {pendingRecords.map((record, index) => {
                                    const mappedAsset = assets.find(a => a.ID === mappings[index]);
                                    const isAutoMatched = !!mappedAsset;

                                    return (
                                        <tr key={index}>
                                            <td className="text-gray-400 font-mono text-xs">{record.date}</td>
                                            <td>
                                                <Tag 
                                                    intent={record.type === 'Buy' ? Intent.SUCCESS : record.type === 'Sell' ? Intent.DANGER : Intent.PRIMARY}
                                                    minimal
                                                    round
                                                >
                                                    {record.type}
                                                </Tag>
                                            </td>
                                            <td className="font-semibold text-white">{record.assetName}</td>
                                            <td className="text-gray-400 font-mono text-xs">{record.isin}</td>
                                            <td>
                                                {isAutoMatched ? (
                                                    <div className="flex items-center gap-2">
                                                        <Tag intent={Intent.SUCCESS} minimal icon="tick-circle">
                                                            {mappedAsset.name}
                                                        </Tag>
                                                        <Button icon="edit" minimal small />
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
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-blue-300">{record.shares ? record.shares.toFixed(6) : '-'}</td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-gray-300">{record.pricePerShare ? record.pricePerShare.toFixed(2) + ' €' : '-'}</td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-orange-300">{record.fee ? record.fee.toFixed(2) + ' €' : '0,00 €'}</td>
                                            <td style={{ textAlign: 'right' }} className="font-mono text-red-300">{record.tax ? record.tax.toFixed(2) + ' €' : '0,00 €'}</td>
                                            <td style={{ textAlign: 'right' }} className="font-bold text-white font-mono">{record.totalAmount.toFixed(2)} €</td>
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
        </div>
    );
}
