import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '../../../../testing/test-utils';
import RealEstateRoute from './RealEstateRoute';

it('lists only real estate and opens the new-asset form with the property type selected', async () => {
	const { store } = render(<RealEstateRoute />, { preloadedState: {
		assets: [
			{ ID: 1, type: 'RealEstate', name: 'Wohnung', property_market_value: 250000 } as Asset,
			{ ID: 2, type: 'Stock', name: 'Aktie', symbol: 'ABC', current_shares: 1, price: 20 } as Asset,
		],
		transactions: [],
	} });

	expect(screen.getByTestId('RealEstateRoute')).toBeInTheDocument();
	expect(screen.getByTestId('asset-row-1')).toBeInTheDocument();
	expect(screen.queryByTestId('asset-row-2')).not.toBeInTheDocument();

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
