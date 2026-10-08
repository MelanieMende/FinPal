import Table from '../../../../components/Table/Table';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import { selectUpcomingPayments } from '../../../../utils/dividendForecasts';
import { useAppSelector } from './../../../../hooks'

export default function UpcomingDividends() {

	const assets = useAppSelector(state => state.assets)
  const sorted_dividends = selectUpcomingPayments(assets)
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
          {!sorted_dividends.length && <tr><td colSpan={5} className="p-3 text-xs text-gray-400">Keine kommenden Zahlungen geladen.</td></tr>}
          {sorted_dividends.map((dividend:any, i) => {
            return(
              <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                <TableCell className="py-3 text-gray-500 font-mono text-xs">{i+1}</TableCell>
                <TableCell className="py-3">
									<div className="font-semibold text-white">{new Date(dividend.payDate).toLocaleDateString("de-DE", options)}</div>
									<div className="text-[10px] text-gray-500 uppercase">Pay Date</div>
								</TableCell>
                <TableCell className="py-3 text-xs text-gray-400">
									{dividend.exDate ? new Date(dividend.exDate).toLocaleDateString("de-DE", options) : '\u2014'}
								</TableCell>
                <TableCell className="py-3">
									<div className="flex items-center">
										<div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[8px] font-bold mr-2">
											{(dividend.asset.symbol || dividend.asset.name || '??').substring(0, 2)}
										</div>
										<span className="text-sm font-medium">{dividend.asset ? dividend.asset.name : ''}</span>
									</div>
								</TableCell>
                <TableCell className="py-3 text-right">
									<div className="font-bold text-emerald-400">
										{dividend.currency && /^[A-Z]{3}$/.test(dividend.currency) ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: dividend.currency }).format(dividend.value) : new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(dividend.value) + ' (Währung unbekannt)'}
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
