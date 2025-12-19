import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import DividendListItem from './DividendListItem';

describe('DividendListItem component', () => {

	it('renders', async () => {
		const dividend = { ID: 1, date: "2024-11-01", asset_ID: 14, asset_name: "AssetName", income: 0.39 };
		render(<DividendListItem i={1} dividend={dividend} />);
		await waitFor(() => {
			expect(screen.getByTestId('DividendListItem_1')).toBeDefined();
			expect(screen.getByTestId('dateInput_1').getAttribute("value")).toEqual('2024-11-01');
		});
	});

	it('updates date input value', async () => {
		const dividend = { ID: 1, date: "2024-11-01", asset_ID: 14, asset_name: "AssetName", income: 0.39 };
		render(<DividendListItem i={1} dividend={dividend} />);
		const dateInput = screen.getByTestId('dateInput_1');
		fireEvent.change(dateInput, { target: { value: '2024-12-01' } });
		await waitFor(() => {
			expect(dateInput.getAttribute("value")).toEqual('2024-12-01');
		});
	});
/*
	it('updates asset select value', async () => {
		const dividend = { ID: 1, date: "2024-11-01", asset_ID: 14, asset_name: "AssetName", income: 0.39 };
		const assets = [{ ID: 14, name: "AssetName" }, { ID: 15, name: "AnotherAsset" }];
		jest.mock('../../../../hooks', () => ({
			useAppSelector: jest.fn(() => assets),
			useAppDispatch: jest.fn(() => jest.fn())
		}));
		render(<DividendListItem i={1} dividend={dividend} />);
		const assetSelect = screen.getByRole('combobox');
		fireEvent.change(assetSelect, { target: { value: '15' } });
		await waitFor(() => {
			expect(assetSelect.value).toEqual('15');
		});
	});
*/
	it('updates income input value', async () => {
		const dividend = { ID: 1, date: "2024-11-01", asset_ID: 14, asset_name: "AssetName", income: 0.39 };
		render(<DividendListItem i={1} dividend={dividend} />);
		const incomeInput = screen.getByDisplayValue('0.39');
		fireEvent.change(incomeInput, { target: { value: '1.23' } });
		await waitFor(() => {
			expect(incomeInput.getAttribute("value")).toEqual('1.23');
		});
	});
/*
	it('dispatches validateAndSave on blur', async () => {
		const dividend = { ID: 1, date: "2024-11-01", asset_ID: 14, asset_name: "AssetName", income: 0.39 };
		const mockDispatch = jest.fn();
		jest.mock('../../../../hooks', () => ({
			useAppSelector: jest.fn(() => []),
			useAppDispatch: jest.fn(() => mockDispatch)
		}));
		render(<DividendListItem i={1} dividend={dividend} />);
		const dateInput = screen.getByTestId('dateInput_1');
		fireEvent.blur(dateInput);
		await waitFor(() => {
			expect(mockDispatch).toHaveBeenCalled();
		});
	});
*/
});