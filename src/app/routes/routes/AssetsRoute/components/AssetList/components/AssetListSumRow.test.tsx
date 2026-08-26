import { waitFor } from '@testing-library/react'
import { ReactNode } from 'react';
import { render } from '../../../../../../../testing/test-utils'
import AssetListSumRow from './AssetListSumRow';

describe('AssetListSumRow component', () => {

	it('renders', async() => {

    const columns: ReactNode[] = []
    
    const {getAllById} = render(<AssetListSumRow columns={columns} />) 
		
    await waitFor(() => {
			expect(getAllById('AssetListSumRow').length).toEqual(1);
		})
	});

})
