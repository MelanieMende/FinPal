import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '../../../../testing/test-utils';
import RealEstateRoute from './RealEstateRoute';

it('lists only real estate and opens the new-asset form with the property type selected', async () => {
	const { store } = render(<RealEstateRoute />, { preloadedState: {
		assets: [
			{
				ID: 1, type: 'RealEstate', name: 'Wohnung', property_market_value: 250000,
				property_ownership_share: 60, property_mortgage_balance: 100000,
				property_purchase_price: 200000, property_purchase_date: '2010-01-01',
				property_location: 'Berlin', property_monthly_rent: 1200, property_monthly_costs: 350,
			} as Asset,
			{ ID: 2, type: 'Stock', name: 'Aktie', symbol: 'ABC', current_shares: 1, price: 20 } as Asset,
		],
		transactions: [],
	} });

	expect(screen.getByTestId('RealEstateRoute')).toBeInTheDocument();
	const propertyRow = screen.getByTestId('asset-row-1');
	expect(propertyRow).toBeInTheDocument();
	expect(screen.queryByTestId('asset-row-2')).not.toBeInTheDocument();
	expect(screen.getAllByRole('columnheader').map(header => header.textContent?.trim())).toEqual([
		'', 'ID', 'Name', 'KI', 'Haushaltsanteil', 'Kaufpreis', 'Immobilienwert', 'Restschuld',
		'Eigenkapital', 'Miete / Monat', 'Kaufdatum / Lage', 'Laufende Kosten / Monat',
	]);
	const propertyCells = within(propertyRow);
	for (const cellLabel of ['Haushaltsanteil', 'Kaufpreis', 'Immobilienwert', 'Restschuld', 'Eigenkapital', 'Miete / Monat', 'Kaufdatum', 'Kosten / Monat']) {
		expect(propertyCells.queryByText(cellLabel)).not.toBeInTheDocument();
	}
	expect(propertyCells.getByTestId('current-shares-1')).toHaveTextContent('60 %');
	expect(propertyCells.getByTestId('current-value-1')).toHaveTextContent('50.000,00 €');
	const summaryRow = document.getElementById('AssetListSumRow');
	expect(summaryRow).toBeInTheDocument();
	const summaryCells = within(summaryRow as HTMLElement).getAllByRole('cell');
	expect(summaryCells).toHaveLength(12);
	expect(summaryCells[5]).toHaveTextContent('200.000,00 €');
	expect(summaryCells[6]).toHaveTextContent('250.000,00 €');
	expect(summaryCells[7]).toHaveTextContent('100.000,00 €');
	expect(screen.getByTestId('TableCellCurrentValueSum')).toHaveTextContent('50.000,00 €');
	expect(summaryCells[9]).toHaveTextContent('1.200,00 €');
	expect(summaryCells[11]).toHaveTextContent('350,00 €');

	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Immobilie hinzufügen' }));
	});

	await waitFor(() => {
		expect(store.getState().assetCreation.typeInput).toBe('RealEstate');
		expect(store.getState().appState.showAssetOverlay).toBe(true);
	});
	expect(document.getElementById('AssetOverlay')).toBeInTheDocument();
	expect(document.getElementById('propertyMarketValueInput')).toBeInTheDocument();
});

it('recalculates an existing property value when its index button is clicked', async () => {
	const sendToDB = jest.fn().mockResolvedValue([]);
	window.API = {
		...window.API,
		sendToDB,
		getGermanHousePriceIndex: jest.fn().mockResolvedValue([
			{ period: '2013-Q2', value: 108.684 },
			{ period: '2026-Q2', value: 180.1253 },
		]),
	};
	render(<RealEstateRoute />, { preloadedState: {
		assets: [{
			ID: 7, type: 'RealEstate', name: 'Wohnung', property_market_value: 250000,
			property_purchase_price: 200000, property_purchase_date: '2013-06-11',
		} as Asset],
		transactions: [],
	} });

	fireEvent.click(screen.getByRole('button', { name: 'Immobilienwert für Wohnung neu berechnen' }));

	await waitFor(() => {
		expect(screen.getByTestId('current-price-7')).toHaveTextContent('331.466,09 €');
		expect(screen.getByText('Index-Schätzung · Q2 2026')).toBeInTheDocument();
	});
	expect(sendToDB).toHaveBeenCalledWith(expect.stringContaining('UPDATE assets'));
	expect(screen.queryByTestId('asset-transactions-7')).not.toBeInTheDocument();
});

it('saves an edited purchase date from the property form', async () => {
	const property = {
		ID: 8, type: 'RealEstate', name: 'Haus', property_market_value: 250000,
		property_purchase_price: 200000, property_purchase_date: '2013-06-11',
	} as Asset;
	const updatedProperty = { ...property, property_purchase_date: '2013-06-12' };
	const originalAPI = window.API;
	const sendToDB = jest.fn(async (sql: string) => {
		if (sql === 'SELECT MAX(ID) as ID FROM assets') return [{ ID: 8 }];
		if (sql === 'SELECT * FROM assets_v') return [updatedProperty];
		if (sql.startsWith('SELECT * FROM transactions_v')) return [];
		return [];
	});
	window.API = { ...originalAPI, sendToDB };
	const { store } = render(<RealEstateRoute />, { preloadedState: { assets: [property], transactions: [] } });

	await act(async () => {
		fireEvent.click(screen.getByTestId('openOverlayButton_8'));
	});
	await waitFor(() => expect(store.getState().appState.showAssetOverlay).toBe(true));
	const purchaseDateInput = document.getElementById('propertyPurchaseDateInput');
	expect(purchaseDateInput).toBeInTheDocument();
	fireEvent.change(purchaseDateInput as HTMLInputElement, { target: { value: '2013-06-12' } });
	expect(store.getState().assetCreation.propertyPurchaseDateInput).toBe('2013-06-12');

	fireEvent.click(screen.getByRole('button', { name: 'Vermögenswert speichern' }));

	await waitFor(() => {
		expect(sendToDB).toHaveBeenCalledWith(expect.stringContaining("property_purchase_date='2013-06-12'"));
		expect(store.getState().assets[0].property_purchase_date).toBe('2013-06-12');
	});
	window.API = originalAPI;
});
