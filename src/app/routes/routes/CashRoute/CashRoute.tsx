
import { useAppSelector } from '../../../hooks';
import CashCreation from './components/CashCreation';
import CashListItem from './components/CashListItem';
import Table from '../../../components/Table/Table';
import TableHeaderRow from '../../../components/Table/TableHeaderRow/TableHeaderRow';

export default function CashRoute() {
  const cash = useAppSelector(state => state.cash);

  // compute totals for amount and fee
  const totalAmount = cash.reduce((sum, entry) => sum + (entry.amount || 0), 0);
  const totalFee = cash.reduce((sum, entry) => sum + (entry.fee || 0), 0);

  const columns = [
    { header: { content: '#' } },
    { header: { content: 'Date' } },
    { header: { content: 'Type' } },
    { header: { content: 'Amount' } },
    { header: { content: 'Fee' } },
    { header: { content: 'Comment' } },
    { header: { content: '' } },
  ];

  return (
    <div id="CashRoute" data-testid="CashRoute">
      <h1 className="text-2xl font-bold mb-4">Cash Management</h1>
      <div id="Main" className="flex p-3 overflow-auto">
        <div className="flex grow justify-center align-center">
          <Table>
            <TableHeaderRow columns={columns} />
            <tbody>
              <CashCreation />
                            {/* totals row */}
              <tr data-testid="cash-totals-row" className="font-bold">
                <td></td>
                <td></td>
                <td>Totals</td>
                <td>{totalAmount}</td>
                <td>{totalFee}</td>
                <td></td>
                <td></td>
              </tr>
              {cash.map((entry, i) => (
                <CashListItem key={`cash-${entry.ID}`} i={i + 1} cash={entry} />
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </div>
  );
}