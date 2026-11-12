import React from 'react';
import { Button, Dialog, DialogBody, DialogFooter, FormGroup, InputGroup, Intent, OverlaysProvider, Icon, Divider, H3, SegmentedControl } from '@blueprintjs/core';
import { useAppSelector, useAppDispatch } from './../../../../hooks'

import * as appStateReducer from '../../../../store/appState/appState.reducer';
import * as assetCreationReducer from '../../../../store/assetCreation/assetCreation.reducer';

export default function AssetOverlay() {
	const dispatch = useAppDispatch();
	const appState = useAppSelector(state => state.appState)
	
	const isOpen = useAppSelector(state => state.appState.showAssetOverlay)
	const typeInput = useAppSelector(state => state.assetCreation.typeInput)
  const ID = useAppSelector(state => state.assetCreation.ID)
	const nameInput = useAppSelector(state => state.assetCreation.nameInput)
  const symbolInput = useAppSelector(state => state.assetCreation.symbolInput)
  const isinInput = useAppSelector(state => state.assetCreation.isinInput)
	const kgvInput = useAppSelector(state => state.assetCreation.kgvInput)
	const propertyLocationInput = useAppSelector(state => state.assetCreation.propertyLocationInput)
	const propertyMarketValueInput = useAppSelector(state => state.assetCreation.propertyMarketValueInput)
	const propertyOwnershipShareInput = useAppSelector(state => state.assetCreation.propertyOwnershipShareInput)
	const propertyMortgageBalanceInput = useAppSelector(state => state.assetCreation.propertyMortgageBalanceInput)
	const propertyPurchaseDateInput = useAppSelector(state => state.assetCreation.propertyPurchaseDateInput)
	const propertyPurchasePriceInput = useAppSelector(state => state.assetCreation.propertyPurchasePriceInput)
	const propertyMonthlyRentInput = useAppSelector(state => state.assetCreation.propertyMonthlyRentInput)
	const propertyMonthlyCostsInput = useAppSelector(state => state.assetCreation.propertyMonthlyCostsInput)
	const isRealEstate = typeInput === 'RealEstate'
  const link = "https://finance.yahoo.com/quote/" + symbolInput + "/"

  function handleOnClose() {
    dispatch(appStateReducer.setShowAssetOverlay(false))
  }

	return (
    <OverlaysProvider>
      <Dialog 
        className="glass-card shadow-2xl p-0 bp5-dark" 
        isOpen={isOpen} 
				usePortal={false}
        onClose={() => handleOnClose()}
				canOutsideClickClose={true}
				style={{ width: 'min(500px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', backgroundColor: 'transparent' }}
			>
				<div id="AssetOverlay" className="p-6 border-b border-white/10 flex items-center justify-between gap-3 bg-white/5">
					<div className="flex min-w-0 items-center gap-3">
						<div className="shrink-0 p-2 bg-blue-500/20 rounded-lg">
							<Icon icon={appState.assetOverlayType == appStateReducer.AssetOverlayType.NEW ? "plus" : "edit"} className="text-blue-400" size={20} />
						</div>
						<H3 className="m-0 min-w-0 flex-1 break-words text-base font-bold leading-tight text-white sm:text-xl">
							{appState.assetOverlayType == appStateReducer.AssetOverlayType.NEW ? "Vermögenswert hinzufügen" : "Vermögenswert bearbeiten"}
						</H3>
					</div>
					<Button id="CloseButton" aria-label="Schließen" minimal icon="cross" onClick={() => handleOnClose()} className="shrink-0 text-gray-500 hover:text-white" />
				</div>

        <DialogBody className="p-6 space-y-6 max-h-[calc(100vh-260px)] overflow-y-auto">
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<FormGroup label={isRealEstate ? 'Name der Immobilie' : 'Name des Vermögenswerts'} labelInfo="(erforderlich)" className="col-span-full">
							<InputGroup 
								id="nameInput"
								placeholder={isRealEstate ? 'z. B. unser Eigenheim' : 'z. B. Apple Inc.'}
								value={nameInput} 
								onChange={(e) => dispatch(assetCreationReducer.setNameInput(e.target.value))}
								className="glass-input"
								large
							/>
						</FormGroup>

						<FormGroup label="Anlagetyp" className="col-span-full">
							<SegmentedControl 
								value={typeInput}
								onValueChange={(value) => {
									if (value === 'RealEstate' || typeInput === 'RealEstate') {
										dispatch(assetCreationReducer.setSymbolInput(''))
										dispatch(assetCreationReducer.setISINInput(''))
									}
									dispatch(assetCreationReducer.setTypeInput(value as Asset['type']))
								}}
								options={[
									{ label: 'Aktie', value: 'Stock' },
									{ label: 'ETF', value: 'ETF' },
									{ label: 'Fonds', value: 'Fund' },
									{ label: 'Anleihe', value: 'Bond' },
									{ label: 'Krypto', value: 'Crypto' },
									{ label: 'Rohstoff', value: 'Commodity' },
									{ label: 'Immobilie', value: 'RealEstate' },
									{ label: 'Geldmarkt', value: 'CashEquivalent' },
									{ label: 'IPO', value: 'IPO' }
								]}
								fill
								className="glass-segmented-control"
							/>
						</FormGroup>

						{isRealEstate ? (
							<>
								<FormGroup label="Lage (optional)" className="col-span-full">
									<InputGroup
										id="propertyLocationInput"
										placeholder="Ort oder Region; keine vollständige Adresse nötig"
										value={propertyLocationInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyLocationInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
								<FormGroup label="Geschätzter aktueller Immobilienwert" labelInfo="(erforderlich)">
									<InputGroup
										id="propertyMarketValueInput"
										type="text"
										inputMode="decimal"
										placeholder="z. B. 450000"
										value={propertyMarketValueInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyMarketValueInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
								<FormGroup label="Euer Eigentumsanteil am Objekt (%)">
									<InputGroup
										id="propertyOwnershipShareInput"
										type="text"
										inputMode="decimal"
										placeholder="100"
										value={propertyOwnershipShareInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyOwnershipShareInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
								<FormGroup label="Restschuld (Anteil eures Haushalts)">
									<InputGroup
										id="propertyMortgageBalanceInput"
										type="text"
										inputMode="decimal"
										placeholder="0"
										value={propertyMortgageBalanceInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyMortgageBalanceInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
								<FormGroup label="Kaufpreis (optional)">
									<InputGroup
										id="propertyPurchasePriceInput"
										type="text"
										inputMode="decimal"
										placeholder="z. B. 400000"
										value={propertyPurchasePriceInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyPurchasePriceInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
								<FormGroup label="Kaufdatum (optional)">
									<InputGroup
										id="propertyPurchaseDateInput"
										type="date"
										value={propertyPurchaseDateInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyPurchaseDateInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
								<FormGroup label="Monatliche Mieteinnahmen (optional)">
									<InputGroup
										id="propertyMonthlyRentInput"
										type="text"
										inputMode="decimal"
										placeholder="0"
										value={propertyMonthlyRentInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyMonthlyRentInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
								<FormGroup label="Monatliche laufende Kosten (optional)" helperText="Ohne Darlehensrate">
									<InputGroup
										id="propertyMonthlyCostsInput"
										type="text"
										inputMode="decimal"
										placeholder="0"
										value={propertyMonthlyCostsInput}
										onChange={e => dispatch(assetCreationReducer.setPropertyMonthlyCostsInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
							</>
						) : (
							<>
								<FormGroup label="Ticker-Symbol" labelInfo="(erforderlich)">
									<InputGroup
										id="symbolInput"
										placeholder="z. B. AAPL"
										value={symbolInput}
										onChange={(e) => dispatch(assetCreationReducer.setSymbolInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>

								<FormGroup label="ISIN" labelInfo="(12 Zeichen)">
									<InputGroup
										id="isinInput"
										placeholder="z. B. US0378331005"
										value={isinInput}
										maxLength={12}
										onChange={(e) => dispatch(assetCreationReducer.setISINInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>

								<FormGroup label="Kurs-Gewinn-Verhältnis (KGV)" helperText="Optionale Bewertungskennzahl">
									<InputGroup
										id="kgvInput"
										placeholder="0,00"
										value={kgvInput}
										onChange={(e) => dispatch(assetCreationReducer.setKGVInput(e.target.value))}
										className="glass-input"
									/>
								</FormGroup>
							</>
						)}

						<FormGroup label="Asset-ID" helperText="Systemkennung (schreibgeschützt)">
							<div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-gray-400 h-[30px] flex items-center">
								#{ID}
							</div>
						</FormGroup>
					</div>

          {appState.assetOverlayType == appStateReducer.AssetOverlayType.EDIT && !isRealEstate && (
						<>
							<Divider className="my-6 opacity-10" />
							<div className="flex items-center justify-between p-4 bg-blue-500/5 rounded-xl border border-blue-500/10">
								<div className="flex items-center gap-3">
									<Icon icon="globe-network" className="text-blue-400" />
									<a target="_blank" href={link} className="text-sm font-semibold text-blue-400 hover:underline">
										{symbolInput} auf Yahoo Finance ansehen
									</a>
								</div>
								<Button 
									intent={Intent.PRIMARY} 
									minimal 
									small 
									rightIcon="chevron-right"
									text="Zu den Transaktionen"
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
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button 
							id="SaveButton"
							minimal 
							text="Abbrechen"
							onClick={() => handleOnClose()} 
							className="!ml-0 w-full text-gray-400 hover:text-white sm:w-auto"
						/>
            <Button 
							intent={Intent.SUCCESS} 
							large 
							icon="floppy-disk"
							text="Vermögenswert speichern"
							onClick={() => dispatch(assetCreationReducer.validateAndSave())} 
							className="!ml-0 w-full rounded-lg px-6 font-bold shadow-lg transition-all hover:shadow-emerald-500/20 sm:w-auto"
						/>
          </div>} />
      </Dialog>
    </OverlaysProvider>
	);
}
