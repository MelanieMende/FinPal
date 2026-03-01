
import { useAppSelector } from '../../../hooks';
import CashCreation from './components/CashCreation';
import CashListItem from './components/CashListItem';
import Table from '../../../components/Table/Table';
import TableHeaderRow from '../../../components/Table/TableHeaderRow/TableHeaderRow';

export default function CashRoute() {
  const cash = useAppSelector(state => state.cash);

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