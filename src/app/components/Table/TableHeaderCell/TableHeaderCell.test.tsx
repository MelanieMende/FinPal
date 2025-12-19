import { act, screen, waitFor } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import TableHeaderCell from './TableHeaderCell';

describe('TableCell component', () => {

	it('renders', async() => {
    render(<table><tbody><tr><TableHeaderCell /></tr></tbody></table>) 
		await waitFor(() => {
			expect(screen.getAllByTestId('TableHeaderCell').length).toEqual(1);
		})
	});
  
})
