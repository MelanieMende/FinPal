import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render } from '../../../../../testing/test-utils';
import DividendList from './DividendList';

describe('DividendList component', () => {

	it('renders', async () => {
    render(<DividendList />); 
    await waitFor(() => {
      expect(screen.getAllByTestId('DividendList').length).toEqual(1);
    });
	});

  it('renders dividends', async() => {

    const dividends = [
      {ID: 1, date: "2024-11-01", asset_ID: 14, income: 0.39}
    ] as Dividend[]

    render(<DividendList />, { preloadedState: { dividends: dividends } })

    await waitFor(() => {
      expect(screen.getByTestId('DividendListItem_1')).toBeDefined()
      expect(screen.getByTestId('dateInput_1').getAttribute("value")).toEqual('2024-11-01')
    })
  });

  it('renders filtered dividends', async() => {

    const assets = [14]

    const dividends = [
      {ID: 1, date: "2024-01-01", asset_ID: 14, income: 0.39},
      {ID: 2, date: "2024-02-01", asset_ID: 15, income: 0.79}
    ] as Dividend[]

    const { getAllByTestId } = render(<DividendList />, { preloadedState: { dividends: dividends, appState: {
      dividends_AssetFilter: assets,
      selectedTab: 'databaseTab',
      theme: '',
      database: '',
      assetOverlayType: undefined,
      showAssetOverlay: false,
      transactions_AssetFilter: []
    } } })

    await waitFor(() => {
      expect(getAllByTestId('dateInput_1')[0].getAttribute("value")).toEqual('2024-01-01')
      expect(screen.queryByText("2024-02-01")).not.toBeInTheDocument()
    })
  });

})