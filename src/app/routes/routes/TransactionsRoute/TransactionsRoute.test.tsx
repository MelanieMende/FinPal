import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import TransactionsRoute from './TransactionsRoute';
import * as appStateReducer from '../../../store/appState/appState.reducer';

describe('TransactionsRoute component', () => {

	it('renders', async() => {
    const {getAllById} = render(<TransactionsRoute />) 
		await waitFor(() => {
			expect(getAllById('TransactionsRoute').length).toEqual(1);
		})
	});

	it('filters the transaction list when an asset is selected', async () => {
		const assets = [
			{ ID: 1, type: 'Stock' as const, name: 'Asset A', symbol: 'AAA', isin: 'ISIN1' },
			{ ID: 2, type: 'Stock' as const, name: 'Asset B', symbol: 'BBB', isin: 'ISIN2' },
		];
		const transactions = [
			{ ID: 1, asset_ID: '1', date: '2024-01-01', type: 'Buy' },
			{ ID: 2, asset_ID: '2', date: '2024-01-02', type: 'Buy' },
		] as unknown as Transaction[];
		render(<TransactionsRoute />, {
			preloadedState: {
				assets,
				transactions,
				appState: { ...appStateReducer.initialState, transactions_AssetFilter: [] },
			},
		});

		fireEvent.click(screen.getByTestId('asset-filter-button'));
		fireEvent.click(screen.getByTestId('asset-filter-checkbox-1'));

		await waitFor(() => {
			expect(document.querySelector('#TransactionListItem_1')).toBeInTheDocument();
			expect(document.querySelector('#TransactionListItem_2')).not.toBeInTheDocument();
		});
	});

})
