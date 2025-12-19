import Table from '../../../../components/Table/Table';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import TableHeaderRow from '../../../../components/Table/TableHeaderRow/TableHeaderRow';
import * as assetsSelector from '../../../../store/assets/assets.selectors';
import { useAppSelector } from './../../../../hooks'

export default function UpcomingDividends() {

	const assets = useAppSelector(state => state.assets)
  const assets_with_upcoming_dividends = assetsSelector.selectAssetsWithUpcomingDividends(assets)
  const filtered_assets = assets_with_upcoming_dividends.filter((asset) => asset.next_estimated_dividend_per_share > 0 && new Date(asset.payDividendDate) >= new Date())
  var dividends: any[] = []
  filtered_assets.forEach((asset) => {
    let filterd_dividends = asset.dividends.filter((dividend:any) => new Date(dividend.payDate)  >= new Date())
    const mapped_dividends = filterd_dividends.map(dividend => Object.assign({}, dividend, {asset: asset}))
    mapped_dividends.forEach((dividend) => {
      dividends.push(dividend)
    })
  })
  const sorted_dividends = dividends ? dividends.slice().sort((a:any, b:any) => a.payDate ? a.payDate.localeCompare(b.payDate) : 0) : []
  const options = { day: '2-digit', month: '2-digit', year: 'numeric' } as Intl.DateTimeFormatOptions;

  const columns = [
		{
			header: {
				content: '#'
			}
		},
    {
			header: {
				content: 'Pay Date'
			}
		},
    {
			header: {
				content: 'Ex Date'
			}
		},
    {
			header: {
				content: 'Asset'
			}
		},
    {
			header: {
				content: 'Dividend'
			}
		},
  ]

	return (
		<div id="UpcomingDividends">
      <h1>Upcoming</h1>
      <Table>
        <TableHeaderRow columns={columns}/>
        <tbody>
          {sorted_dividends.map((dividend:any, i) => {
            return(
              <tr key={i}>
                <TableCell>{i+1}</TableCell>
                <TableCell>{new Date(dividend.payDate).toLocaleDateString("de-DE", options)}</TableCell>
                <TableCell>{new Date(dividend.exDate).toLocaleDateString("de-DE", options)}</TableCell>
                <TableCell>{dividend.asset ? dividend.asset.name : ''}</TableCell>
                <TableCell>{(Math.round(assetsSelector.get_upcoming_dividends(dividend.asset).value * 1000) / 1000).toFixed(3)} €</TableCell>
              </tr>
            )
          })} 
        </tbody>
      </Table>
    </div>
	);
}
