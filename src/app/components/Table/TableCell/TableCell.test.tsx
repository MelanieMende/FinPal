import { act, screen, waitFor } from '@testing-library/react'
import { render } from '../../../../testing/test-utils'
import TableCell from './TableCell';

describe('TableCell component', () => {

	it('renders', async() => {
    render(<table><tbody><tr><TableCell /></tr></tbody></table>) 
		await waitFor(() => {
			expect(screen.getAllByTestId('TableCell').length).toEqual(1);
		})
	});
  
})
