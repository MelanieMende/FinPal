import Table from '../../../../components/Table/Table';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import TableHeaderCell from '../../../../components/Table/TableHeaderCell/TableHeaderCell';
import { useAppSelector } from './../../../../hooks'

export default function DividendCalendar() {

	const dividends = useAppSelector(state => state.dividends)
  const years = [...new Set(dividends.map(dividend => new Date(dividend.date).getFullYear()))]

	return (
		<div id="DividendCalendar">
			<div className="flex flex-row gap-6 overflow-x-auto pb-4 scrollbar-hide">
				{years.map((year, i) => (
					<DividendsInYear key={i} year={year} dividends={dividends} />
				))}
			</div>
		</div>
	);
}

export function DividendsInYear(props:{year:number, dividends:Dividend[]}) {
  
  const dividends_in_year = props.dividends.filter((dividend) => new Date(dividend.date).getFullYear() == props.year)
  const sum = dividends_in_year.reduce((acc, d) => acc + d.income, 0);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const months = Array.from({ length: 12 }, (_, i) => {
    const dividends_in_month = dividends_in_year.filter(d => new Date(d.date).getMonth() === i);
    const monthSum = dividends_in_month.reduce((acc, d) => acc + d.income, 0);
    const tooltip = dividends_in_month.map(d => `${d.asset_name}: ${d.income.toFixed(2)} €`).join('\n');
    return { sum: monthSum, tooltip };
  });

  return(
    <div className="glass-card min-w-[220px]">
      <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
        <span className="text-xl font-bold text-white">{props.year}</span>
        <span className="text-sm font-bold text-emerald-400">{sum.toFixed(2)} €</span>
      </div>
      <Table className="w-full">
        <tbody>
          {months.map((month, i) => (
            <tr key={`${props.year}-${i}`} className="hover:bg-white/5 transition-colors group">
              <TableCell className="py-2 text-xs text-gray-400 group-hover:text-gray-200" tooltip={month.tooltip}>
                {monthNames[i]}
              </TableCell>
              <TableCell 
                className={`py-2 text-right text-xs font-mono ${month.sum > 0 ? 'text-emerald-400' : 'text-gray-600'}`}
                tooltip={month.tooltip}>
                {month.sum > 0 ? `${month.sum.toFixed(2)} €` : '—'}
              </TableCell>
            </tr>   
          ))}
        </tbody>
      </Table>
    </div>
  )
}