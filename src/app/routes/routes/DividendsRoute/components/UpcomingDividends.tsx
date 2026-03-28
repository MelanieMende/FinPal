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
		<div id="UpcomingDividends" className="w-full">
      <Table className="w-full">
        <thead>
					<tr className="bg-white/5">
						{columns.map((col, idx) => (
							<th 
								key={idx} 
								className={`p-3 text-[10px] uppercase font-bold text-gray-400 tracking-wider border-b border-white/10 ${col.header.content === 'Dividend' ? 'text-right' : 'text-left'}`}
							>
								{col.header.content}
							</th>
						))}
					</tr>
				</thead>
        <tbody>
          {sorted_dividends.map((dividend:any, i) => {
            return(
              <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <TableCell className="py-3 text-gray-500 font-mono text-xs">{i+1}</TableCell>
                <TableCell className="py-3">
									<div className="font-semibold text-white">{new Date(dividend.payDate).toLocaleDateString("de-DE", options)}</div>
									<div className="text-[10px] text-gray-500 uppercase">Pay Date</div>
								</TableCell>
                <TableCell className="py-3 text-xs text-gray-400">
									{new Date(dividend.exDate).toLocaleDateString("de-DE", options)}
								</TableCell>
                <TableCell className="py-3">
									<div className="flex items-center">
										<div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[8px] font-bold mr-2">
											{dividend.asset ? dividend.asset.symbol.substring(0, 2) : '??'}
										</div>
										<span className="text-sm font-medium">{dividend.asset ? dividend.asset.name : ''}</span>
									</div>
								</TableCell>
                <TableCell className="py-3 text-right">
									<div className="font-bold text-emerald-400">
										{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(assetsSelector.get_upcoming_dividends(dividend.asset).value)}
									</div>
								</TableCell>
              </tr>
            )
          })} 
        </tbody>
      </Table>
    </div>
	);
}
