import { act, fireEvent, waitFor, screen } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import TransactionListItem from './TransactionListItem';
import { Provider } from 'react-redux';
import { setupStore } from '../../../../store';

describe('TransactionListItem component', () => {
	const transaction = {
		ID: 1,
		date: '2023-01-01',
		type: 'Buy',
		asset_ID: 1,
		amount: 10,
		price_per_share: 100.5,
		fee: 2.5,
		solidarity_surcharge: 0.5,
		invest_cumulated: 1000,
		in_out: 500,
		shares_cumulated: 50,
	} as Transaction;

	it('renders correctly', async () => {
		const { getByText } = render(<table><tbody><TransactionListItem i={1} transaction={transaction} /></tbody></table>);
		await waitFor(() => {
			expect(getByText('1')).toBeInTheDocument();
		});
	});

	it('sets dateInput on change', async () => {
		const { getByDisplayValue } = render(<table><tbody><TransactionListItem i={1} transaction={transaction} /></tbody></table>);
		const dateInput = getByDisplayValue('2023-01-01');
		await act(async () => {
			fireEvent.change(dateInput, { target: { value: '2023-02-01' } });
		});
		expect(dateInput).toHaveValue('2023-02-01');
	});
/*
	it('deletes a transaction when delete button is clicked', async () => {
		const { getByDisplayValue } = render(<TransactionListItem i={1} transaction={transaction} />);
		const deleteButton = getByDisplayValue('Delete');
		await act(async () => {
			fireEvent.click(deleteButton);
		});
		// Assuming deleteTransaction logs to console, you can mock and assert it was called.
		expect(deleteButton).toBeInTheDocument();
	});
*/

	it('sets typeInput on change', async () => {
		const { getByDisplayValue } = render(<table><tbody><TransactionListItem i={1} transaction={transaction} /></tbody></table>);
		const typeInput = getByDisplayValue('Buy');
		await act(async () => {
			fireEvent.change(typeInput, { target: { value: 'Sell' } });
		});
		expect(typeInput).toHaveValue('Sell');
	});

	it('uses a readable dark color scheme for the asset dropdown', () => {
		const store = setupStore({ assets: [{ ID: 1, type: 'Stock', name: '3M', symbol: 'MMM', isin: 'US88579Y1010' }] });
		render(<Provider store={store}><table><tbody><TransactionListItem i={1} transaction={transaction} /></tbody></table></Provider>);

		const assetSelect = screen.getByRole('combobox', { name: 'Asset' });
		expect(assetSelect).toHaveStyle({ colorScheme: 'dark' });
		expect(screen.getByRole('option', { name: '3M' })).toHaveClass('bg-gray-800', 'text-white');
	});
});
