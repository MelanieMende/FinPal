import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../../../../testing/test-utils'
import AssetListSumRow from './AssetListSumRow';

describe('AssetListSumRow component', () => {

	it('renders', async() => {

    const columns: any[] = []
    
    const {getAllById} = render(<AssetListSumRow columns={columns} />) 
		
    await waitFor(() => {
			expect(getAllById('AssetListSumRow').length).toEqual(1);
		})
	});

})