import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../../../../testing/test-utils'
import NewAssetButton from './NewAssetButton';
import AssetsRoute from '../../../AssetsRoute';

describe('AssetsListItem component', () => {

	it('renders', async() => {
    
    const {getAllById} = render(<NewAssetButton />) 
		
    await waitFor(() => {
			expect(getAllById('newAssetButton').length).toEqual(1);
		})
	});

  it('renders the overlay, after button click', async() => {

    const assets: Asset[] = []

    const {getAllById} = render(<AssetsRoute />, { preloadedState: { assets: assets } })
    
    fireEvent.click(getAllById('newAssetButton')[0]);

    await waitFor(() => {
      expect(getAllById('AssetOverlay').length).toEqual(1);
		})
	});

})