import React from 'react';
import { useAppDispatch } from '../../../../hooks';
import TableCell from '../../../../components/Table/TableCell/TableCell';
import { Button, Icon, Intent } from '@blueprintjs/core';

interface Props {
  i: number,
  cash: CashTransaction
}

export default function CashListItem({ i, cash }: Props) {
  const dispatch = useAppDispatch();
  const euroFormatter = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
  const isDeposit = cash.type === 'Deposit';

  function deleteEntry() {
    if (window.confirm("Are you sure you want to delete this cash entry?")) {
      window.API.sendToDB('DELETE FROM cash WHERE ID = ' + cash.ID).then(() => {
        // We might need a refresh logic here if the store doesn't auto-update
        // In this app, many routes just re-fetch on change.
        window.location.reload(); // Simple refresh for now to ensure data consistency
      });
    }
  }

  return (
    <tr data-testid={`cash-item-${cash.ID}`} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors group">
      <TableCell className="p-3 text-gray-500 font-mono text-xs">{i}</TableCell>
      <TableCell className="p-3 text-sm text-gray-300">{cash.date}</TableCell>
      <TableCell className="p-3">
        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 border ${isDeposit ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
          <Icon icon={isDeposit ? "plus" : "minus"} size={8} />
          {cash.type}
        </div>
      </TableCell>
      <TableCell className="p-3 text-right font-bold text-white">
        {euroFormatter.format(cash.amount || 0)}
      </TableCell>
      <TableCell className="p-3 text-right text-gray-400 text-xs">
        {euroFormatter.format(cash.fee || 0)}
      </TableCell>
      <TableCell className="p-3 text-sm text-gray-400 italic">
        {cash.comment || '—'}
      </TableCell>
      <TableCell className="p-3 text-center">
        <Button 
          intent={Intent.DANGER} 
          minimal 
          small
          icon="trash" 
          onClick={deleteEntry} 
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </TableCell>
    </tr>
  );
}
