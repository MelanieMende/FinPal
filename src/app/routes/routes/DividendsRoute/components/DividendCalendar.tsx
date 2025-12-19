import Table from '../../../../components/Table/Table';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import TableHeaderCell from '../../../../components/Table/TableHeaderCell/TableHeaderCell';
import { useAppSelector } from './../../../../hooks'

export default function DividendCalendar() {

	const dividends = useAppSelector(state => state.dividends)
  const years = [...new Set(dividends.map(dividend => new Date(dividend.date).getFullYear()))]

	return (
		<div id="DividendCalendar">
      <div>
        <div className="flex flex-row">
          {years.map((year, i) => {
            return(
              <DividendsInYear key={i} year={year} dividends={dividends} />
            )
          })}
        </div>
      </div>
    </div>
	);
}

export function DividendsInYear(props:{year:number, dividends:Dividend[]}) {
  
  const dividends_in_year = props.dividends.filter((dividend, i) => new Date(dividend.date).getFullYear() == props.year)

  let sum = 0
  dividends_in_year.forEach(dividend => sum += dividend.income)

  const monthNames = [ "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December" ];
  const months: [{sum: number, tooltip: string}] = [{sum: 0, tooltip: ''}]

  for(let month = 0; month < 12; month++) {
    months[month] = {sum: 0, tooltip: ''}
  }
  
  for(let month = 0; month < 12; month++) {
    const dividends_in_month = dividends_in_year.filter((dividend, i) => new Date(dividend.date).getMonth() == month)
    dividends_in_month.forEach(dividend => {
      months[month].sum += dividend.income
      months[month].tooltip += dividend.asset_name + '\n'
    })
  }

  return(
    <Table>
      <thead>
        <tr>
          <TableHeaderCell>{props.year}</TableHeaderCell>
          <TableHeaderCell>{(Math.round(sum * 100) / 100).toFixed(2)} €</TableHeaderCell>
        </tr>
      </thead>
      <tbody>
        {months.map((month, i) => {
          return(
            <tr key={props.year + '-' + i}>
              <TableCell tooltip={month.tooltip}>{monthNames[i]}</TableCell>
              <TableCell 
                id={props.year + "-" + i} 
                additionalClassNames={"text-right " + (month.sum <= 0 ? "text-slate-500" : "inherit")}
                tooltip={month.tooltip}>
                  {(Math.round(month.sum * 100) / 100).toFixed(2)} €
              </TableCell>
            </tr>   
          )
        })}
      </tbody>
    </Table>
  )
}