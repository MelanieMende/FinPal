import { screen, waitFor, within } from '@testing-library/react'
import { render } from '../../../../../testing/test-utils'
import DividendCalendar from './DividendCalendar';

describe('DividendCalendar component', () => {

	it('renders', async() => {
    const {getAllById} = render(<DividendCalendar />) 
		await waitFor(() => {
			expect(getAllById('DividendCalendar').length).toEqual(1);
		})
	});

  it('renders dividends', async() => {

    const dividends = [
      {ID: 1, date: "2024-01-01", asset_ID: 14, income: 0.39}
    ] as Dividend[]

    const {getAllById} = render(<DividendCalendar />, { preloadedState: { dividends: dividends } })

    await waitFor(() => {
      const { getAllByTestId } = within(getAllById('DividendCalendar')[0])
      expect(getAllByTestId('TableCell').length).toEqual(24)
      expect(getAllById('2024-0')[0].textContent).toEqual("0.39 €")
    })
  });

})