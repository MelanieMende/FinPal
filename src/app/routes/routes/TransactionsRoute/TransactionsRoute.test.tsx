import { screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import TransactionsRoute from './TransactionsRoute';

describe('TransactionsRoute component', () => {

	it('renders', async() => {
    const {getAllById} = render(<TransactionsRoute />) 
		await waitFor(() => {
			expect(getAllById('TransactionsRoute').length).toEqual(1);
		})
	});

})