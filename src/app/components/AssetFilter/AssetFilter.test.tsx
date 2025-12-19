import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '../../../testing/test-utils'
import { act } from 'react-dom/test-utils';
import AssetFilter from './AssetFilter';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';

const mockStore = configureStore([]);
const mockOnChange = jest.fn();

describe('AssetFilter component', () => {

  const onChange = jest.fn()

  let store:any;

  beforeEach(() => {
    store = mockStore({
      assets: [
        { ID: 1, name: 'Asset A' },
        { ID: 2, name: 'Asset B' },
      ],
    });
  });

  it('renders the AssetFilter button', async () => {

    await act( async () => render(
      <Provider store={store}>
        <AssetFilter filter={[]} onChange={mockOnChange} />
      </Provider>)
    );

    expect(screen.getByTestId('asset-filter-button')).toBeInTheDocument();
  });

  it('renders the asset filter popup with items', async () => {
    
    await act( async () => render(
      <Provider store={store}>
        <AssetFilter filter={[1]} onChange={mockOnChange} />
      </Provider>
    ))

    await act( async () => {
      fireEvent.click(screen.getByTestId('asset-filter-button'));
    }) 

    expect(screen.getByTestId('asset-filter-popup-content')).toBeInTheDocument();
    expect(screen.getByTestId('asset-filter-item-1')).toBeInTheDocument();
    expect(screen.getByTestId('asset-filter-item-2')).toBeInTheDocument();
  });

  it('renders sorted assets in ascending order', async () => {
    const assets = [
      { ID: 2, name: 'B Asset', symbol: 'symbol_b', isin: 'isin_b' },
      { ID: 1, name: 'A Asset', symbol: 'symbol_a', isin: 'isin_a' },
    ];

    render(<AssetFilter filter={[]} onChange={mockOnChange} />, {
      preloadedState: { assets },
    });

    act(() => {
      fireEvent.click(screen.getByTestId('asset-filter-button'));
    });

    await waitFor(() => {
      const labels = screen
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.nextSibling?.textContent);
      expect(labels).toEqual(['A Asset', 'B Asset']);
    });
  });

  it('displays the correct checkbox state based on the filter prop', async () => {
    await act(async () =>
      render(
        <Provider store={store}>
          <AssetFilter filter={[1]} onChange={mockOnChange} />
        </Provider>
      )
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('asset-filter-button'));
    });

    const checkbox1 = screen.getByTestId('asset-filter-checkbox-1');
    const checkbox2 = screen.getByTestId('asset-filter-checkbox-2');

    expect(checkbox1).toBeChecked();
    expect(checkbox2).not.toBeChecked();
  });

  it('renders no items when the assets list is empty', async () => {
    store = mockStore({ assets: [] });

    await act(async () =>
      render(
        <Provider store={store}>
          <AssetFilter filter={[]} onChange={mockOnChange} />
        </Provider>
      )
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId('asset-filter-button'));
    });

    expect(screen.queryByTestId('asset-filter-popup-content')).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
