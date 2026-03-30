import { useAppSelector } from '../../../hooks';
import CashCreation from './components/CashCreation';
import CashListItem from './components/CashListItem';
import Table from '../../../components/Table/Table';
import TableCell from '../../../components/Table/TableCell/TableCell';
import { Card, H3, Icon } from '@blueprintjs/core';

export default function CashRoute() {
  const cash = useAppSelector(state => state.cash);
  const transactions = useAppSelector(state => state.transactions) || [];
  const dividends = useAppSelector(state => state.dividends) || [];

  // compute totals
  const totalFee = cash.reduce((sum, entry) => sum + (entry.fee || 0), 0);
  
  const totalDeposits = cash
    .filter(entry => entry.type === 'Deposit')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);
    
  const totalWithdrawals = cash
    .filter(entry => entry.type === 'Withdrawal')
    .reduce((sum, entry) => sum + (entry.amount || 0), 0);

  const totalTransactionFlow = transactions.reduce((sum, t) => sum + (t.in_out || 0), 0);
  const totalDividends = dividends.reduce((sum, d) => sum + (d.income || 0), 0);

  const totalLiquidity = totalDeposits - totalWithdrawals - totalFee + totalTransactionFlow + totalDividends;

  const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

  return (
    <div id="CashRoute" className="w-full p-4 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="mb-8 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
        <div>
          <H3 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-500">
            Cash Management
          </H3>
          <p className="text-gray-400 font-medium">Track your deposits, withdrawals, and liquidity.</p>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20 flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <Icon icon="plus" className="text-blue-400" size={14} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-blue-400/70 tracking-widest">Total Deposits</div>
              <div className="text-lg font-bold text-white tracking-tight">{euroFormatter.format(totalDeposits || 0)}</div>
            </div>
          </div>

          <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 flex items-center gap-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Icon icon="minus" className="text-red-400" size={14} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-red-400/70 tracking-widest">Total Withdrawals</div>
              <div className="text-lg font-bold text-white tracking-tight">{euroFormatter.format(totalWithdrawals || 0)}</div>
            </div>
          </div>

          <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Icon icon="layout-grid" className="text-emerald-400" size={14} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-emerald-400/70 tracking-widest">Total Liquidity</div>
              <div className="text-lg font-bold text-white tracking-tight">{euroFormatter.format(totalLiquidity || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Card */}
      <Card className="glass-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table className="w-full">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="p-3 text-left w-12 text-[10px] uppercase font-bold text-gray-500 tracking-wider">#</th>
                <th className="p-3 text-left text-[10px] uppercase font-bold text-gray-400 tracking-wider">Date</th>
                <th className="p-3 text-left text-[10px] uppercase font-bold text-gray-400 tracking-wider">Type</th>
                <th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">Amount</th>
                <th className="p-3 text-right text-[10px] uppercase font-bold text-gray-400 tracking-wider">Fee</th>
                <th className="p-3 text-left text-[10px] uppercase font-bold text-gray-400 tracking-wider min-w-[200px]">Comment</th>
                <th className="p-3 text-center text-[10px] uppercase font-bold text-gray-400 tracking-wider w-12 italic">Actions</th>
              </tr>
            </thead>
            <tbody>
              <CashCreation />

              {/* Summary Row */}
              <tr data-testid="cash-totals-row" className="bg-white/10 font-bold border-b border-white/20">
                <TableCell className="p-3 text-center"><Icon icon="calculator" size={12} className="text-gray-500" /></TableCell>
                <TableCell className="p-3">—</TableCell>
                <TableCell className="p-3 font-bold text-emerald-400">Σ TOTALS</TableCell>
                <TableCell className="p-3 text-right text-white font-black text-base">{euroFormatter.format(totalLiquidity || 0)}</TableCell>
                <TableCell className="p-3 text-right text-gray-400">{euroFormatter.format(totalFee || 0)}</TableCell>
                <TableCell className="p-3 text-left pl-3">
                  <span className="text-blue-400 text-[10px] bg-blue-400/10 px-2 py-0.5 rounded-full mr-2">In/Out: {euroFormatter.format(totalDeposits - totalWithdrawals || 0)}</span>
                  <span className="text-emerald-400 text-[10px] bg-emerald-400/10 px-2 py-0.5 rounded-full mr-2">Asset Flow: {euroFormatter.format(totalTransactionFlow || 0)}</span>
                  <span className="text-purple-400 text-[10px] bg-purple-400/10 px-2 py-0.5 rounded-full">Dividends: {euroFormatter.format(totalDividends || 0)}</span>
                </TableCell>
                <TableCell className="p-3">—</TableCell>
              </tr>

              {cash.map((entry, i) => (
                <CashListItem key={`cash-${entry.ID}`} i={i + 1} cash={entry} />
              ))}
            </tbody>
          </Table>
        </div>
      </Card>
    </div>
  );
}