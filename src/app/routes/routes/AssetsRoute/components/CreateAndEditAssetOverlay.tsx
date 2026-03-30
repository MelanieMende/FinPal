import React from 'react';
import { Button, Dialog, DialogBody, DialogFooter, FormGroup, InputGroup, Intent, OverlaysProvider, Icon, Divider, H3, SegmentedControl } from '@blueprintjs/core';
import { useAppSelector, useAppDispatch } from './../../../../hooks'

import * as appStateReducer from '../../../../store/appState/appState.reducer';
import * as assetCreationReducer from '../../../../store/assetCreation/assetCreation.reducer';

export default function AssetOverlay() {
	const dispatch = useAppDispatch();
	const appState = useAppSelector(state => state.appState)
	
	const isOpen = useAppSelector(state => state.appState.showAssetOverlay)
  const ID = useAppSelector(state => state.assetCreation.ID)
	const nameInput = useAppSelector(state => state.assetCreation.nameInput)
  const symbolInput = useAppSelector(state => state.assetCreation.symbolInput)
  const isinInput = useAppSelector(state => state.assetCreation.isinInput)
	const kgvInput = useAppSelector(state => state.assetCreation.kgvInput)
  const link = "https://finance.yahoo.com/quote/" + symbolInput + "/"

  function handleOnClose() {
    dispatch(appStateReducer.setShowAssetOverlay(false))
  }

	return (
    <OverlaysProvider>
      <Dialog 
        className="glass-card shadow-2xl p-0 bp5-dark" 
        isOpen={isOpen} 
        onClose={() => handleOnClose()}
				canOutsideClickClose={true}
				style={{ width: '500px', backgroundColor: 'transparent' }}
			>
				<div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
					<div className="flex items-center gap-3">
						<div className="p-2 bg-blue-500/20 rounded-lg">
							<Icon icon={appState.assetOverlayType == appStateReducer.AssetOverlayType.NEW ? "plus" : "edit"} className="text-blue-400" size={20} />
						</div>
						<H3 className="m-0 text-xl font-bold text-white">
							{appState.assetOverlayType == appStateReducer.AssetOverlayType.NEW ? "Add New Asset" : "Edit Asset Details"}
						</H3>
					</div>
					<Button minimal icon="cross" onClick={() => handleOnClose()} className="text-gray-500 hover:text-white" />
				</div>

        <DialogBody className="p-6 space-y-6">
					<div className="grid grid-cols-2 gap-4">
						<FormGroup label="Asset Name" labelInfo="(required)" className="col-span-2">
							<InputGroup 
								placeholder="e.g. Apple Inc." 
								value={nameInput} 
								onChange={(e) => dispatch(assetCreationReducer.setNameInput(e.target.value))}
								className="glass-input"
								large
							/>
						</FormGroup>

						<FormGroup label="Asset Type" className="col-span-2">
							<SegmentedControl 
								value={useAppSelector(state => state.assetCreation.typeInput)}
								onValueChange={(value) => dispatch(assetCreationReducer.setTypeInput(value as any))}
								options={[
									{ label: 'Aktie', value: 'Stock' },
									{ label: 'ETF', value: 'ETF' },
									{ label: 'Anleihe', value: 'Bond' },
									{ label: 'Krypto', value: 'Crypto' },
									{ label: 'Rohstoff', value: 'Commodity' },
									{ label: 'Immobilie', value: 'RealEstate' },
									{ label: 'Geldmarkt', value: 'CashEquivalent' }
								]}
								fill
								className="glass-segmented-control"
							/>
						</FormGroup>

						<FormGroup label="Ticker Symbol" labelInfo="(required)">
							<InputGroup 
								placeholder="e.g. AAPL" 
								value={symbolInput} 
								onChange={(e) => dispatch(assetCreationReducer.setSymbolInput(e.target.value))}
								className="glass-input"
							/>
						</FormGroup>

						<FormGroup label="ISIN" labelInfo="(12 chars)">
							<InputGroup 
								placeholder="e.g. US0378331005" 
								value={isinInput} 
								maxLength={12}
								onChange={(e) => dispatch(assetCreationReducer.setISINInput(e.target.value))}
								className="glass-input"
							/>
						</FormGroup>

						<FormGroup label="Current Price/Earnings (KGV)" helperText="Optional valuation metric">
							<InputGroup 
								placeholder="0.00" 
								value={kgvInput} 
								onChange={(e) => dispatch(assetCreationReducer.setKGVInput(e.target.value))}
								className="glass-input"
							/>
						</FormGroup>

						<FormGroup label="Asset ID" helperText="System identifier (read-only)">
							<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-gray-400 h-[30px] flex items-center">
								#{ID}
							</div>
						</FormGroup>
					</div>

          {appState.assetOverlayType == appStateReducer.AssetOverlayType.EDIT && (
						<>
							<Divider className="my-6 opacity-10" />
							<div className="flex items-center justify-between p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
								<div className="flex items-center gap-3">
									<Icon icon="globe-network" className="text-blue-400" />
									<a target="_blank" href={link} className="text-sm font-semibold text-blue-400 hover:underline">
										View {symbolInput} on Yahoo Finance
									</a>
								</div>
								<Button 
									intent={Intent.PRIMARY} 
									minimal 
									small 
									rightIcon="chevron-right"
									text="Go to Transactions" 
									onClick={() => {
										handleOnClose();
										dispatch(appStateReducer.changeSelectedTab("transactionsTab"));
										dispatch(appStateReducer.transactions_AssetFilter_ToggleAsset(ID));
									}} 
								/>
							</div>
						</>
          )}
        </DialogBody>

        <DialogFooter className="p-6 bg-white/5 border-t border-white/10" actions={
          <div className="flex gap-3">
            <Button 
							minimal 
							text="Cancel" 
							onClick={() => handleOnClose()} 
							className="text-gray-400 hover:text-white"
						/>
            <Button 
							intent={Intent.SUCCESS} 
							large 
							icon="floppy-disk"
							text="Save Asset" 
							onClick={() => dispatch(assetCreationReducer.validateAndSave())} 
							className="px-6 rounded-lg shadow-lg hover:shadow-emerald-500/20 transition-all font-bold"
						/>
          </div>} />
      </Dialog>
    </OverlaysProvider>
	);
}