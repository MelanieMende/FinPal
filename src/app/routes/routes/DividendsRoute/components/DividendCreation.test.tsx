import { screen, waitFor, fireEvent, getByTestId } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import DividendCreation from './DividendCreation';

describe('DividendCreation component', () => {

	it('renders', async () => {
		const { getAllById } = render(<table><tbody><DividendCreation /></tbody></table>);
		await waitFor(() => {
			expect(getAllById('DividendCreation').length).toEqual(1);
		});
	});

	it('updates date input on change', async () => {
		render(<table><tbody><DividendCreation /></tbody></table>);
		const dateInput = screen.getByTestId('dateInput') as HTMLInputElement;
		fireEvent.change(dateInput, { target: { value: '2023-01-01' } });
		await waitFor(() => {
			expect(dateInput.value).toBe('2023-01-01');
		});
	});
/*
	it('updates asset input on change', async () => {
		render(<table><tbody><DividendCreation /></tbody></table>);
		const assetInput = screen.getByTestId('assetInput') as HTMLSelectElement;
		fireEvent.change(assetInput, { target: { value: 'asset1' } });
		await waitFor(() => {
			expect(assetInput.value).toBe('asset1');
		});
	});
*/
	it('updates income input on change', async () => {
		render(<table><tbody><DividendCreation /></tbody></table>);
		const incomeInput = screen.getByTestId('incomeInput') as HTMLInputElement;
		fireEvent.change(incomeInput, { target: { value: '1000' } });
		await waitFor(() => {
			expect(incomeInput.value).toBe('1000');
		});
	});
/*
	it('calls blur handlers on input blur', async () => {
		const { getByLabelText } = render(<table><tbody><DividendCreation /></tbody></table>);
		const dateInput = getByLabelText('dateInput');
		const assetInput = getByLabelText('assetInput');
		const incomeInput = getByLabelText('incomeInput');

		fireEvent.blur(dateInput);
		fireEvent.blur(assetInput);
		fireEvent.blur(incomeInput);

		// Add assertions for blur handler effects if applicable
		await waitFor(() => {
			expect(true).toBe(true); // Placeholder for actual assertions
		});
	});
	*/
});