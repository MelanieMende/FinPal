import React from 'react';
import { useAppDispatch, useAppSelector } from '../../../../hooks'
import * as cashTransactionCreationReducer from '../../../../store/cashTransactionCreation/cashTransactionCreation.reducer'
import TableCell from '../../../../components/Table/TableCell/TableCell';
import { Button, Icon, Intent } from '@blueprintjs/core';

export default function CashCreation() {
  const dispatch = useAppDispatch();
  const dateInput = useAppSelector(state => state.cashTransactionCreation.dateInput);
  const typeInput = useAppSelector(state => state.cashTransactionCreation.typeInput);      
  const amountInput = useAppSelector(state => state.cashTransactionCreation.amountInput);
  const feeInput = useAppSelector(state => state.cashTransactionCreation.feeInput);
  const commentInput = useAppSelector(state => state.cashTransactionCreation.commentInput);

  const isDeposit = typeInput === 'Deposit';

  return (
    <tr data-testid="cash-creation-row" className="bg-blue-500/5 border-b border-blue-500/10">
      <TableCell className="p-3 text-center">
        <Icon icon="plus" className="text-blue-400 animate-pulse" size={12} />
      </TableCell>
      
      <TableCell className="p-3">
        <input 
          type="date" 
          value={dateInput} 
          onChange={e => dispatch(cashTransactionCreationReducer.setDateInput(e.target.value))} 
          onBlur={() => dispatch(cashTransactionCreationReducer.handleDateInputGotTouched())} 
          className="glass-input-minimal text-xs bg-white/5 border border-white/10 rounded px-1 text-white focus:border-blue-500/50 outline-none w-full"
        />
      </TableCell>

      <TableCell className="p-3">
        <div className="relative">
          <select 
            value={typeInput} 
            onChange={e => dispatch(cashTransactionCreationReducer.setTypeInput(e.target.value))} 
            onBlur={() => dispatch(cashTransactionCreationReducer.handleTypeInputGotTouched())} 
            className={`text-[10px] font-bold uppercase rounded-full px-3 py-1 border cursor-pointer appearance-none outline-none transition-all w-full ${isDeposit ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}
          >
            <option value="Deposit">Deposit</option>
            <option value="Withdrawal">Withdrawal</option>
          </select>
          <Icon 
            icon={isDeposit ? "plus" : "minus"} 
            size={8} 
            className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${isDeposit ? 'text-emerald-400' : 'text-red-400'}`} 
          />
        </div>
      </TableCell>

      <TableCell className="p-3 text-right">
        <input 
          type="text" 
          placeholder="0.00"
          value={amountInput} 
          onChange={e => dispatch(cashTransactionCreationReducer.setAmountInput(e.target.value))} 
          onBlur={() => dispatch(cashTransactionCreationReducer.handleAmountInputGotTouched())} 
          className="text-right glass-input-minimal text-sm font-bold bg-white/5 border border-white/10 rounded px-2 text-white w-24 outline-none focus:border-blue-500/50"
        />
      </TableCell>

      <TableCell className="p-3 text-right">
        <input 
          type="text" 
          placeholder="Fee"
          value={feeInput} 
          onChange={e => dispatch(cashTransactionCreationReducer.setFeeInput(e.target.value))} 
          onBlur={() => dispatch(cashTransactionCreationReducer.handleFeeInputGotTouched())} 
          className="text-right glass-input-minimal text-[10px] bg-white/5 border border-white/10 rounded px-2 text-gray-400 w-16 outline-none focus:border-blue-500/50"
        />
      </TableCell>

      <TableCell className="p-3">
        <input 
          type="text" 
          placeholder="Optional comment..."
          value={commentInput} 
          onChange={e => dispatch(cashTransactionCreationReducer.setCommentInput(e.target.value))} 
          onBlur={() => dispatch(cashTransactionCreationReducer.handleCommentInputGotTouched())} 
          className="glass-input-minimal text-xs bg-white/5 border border-white/10 rounded px-2 text-gray-300 w-full outline-none focus:border-blue-500/50 italic"
        />
      </TableCell>

      <TableCell className="p-3 text-center">
        <Button 
          intent={Intent.PRIMARY}
          minimal
          icon="add"
          onClick={() => dispatch(cashTransactionCreationReducer.validateAndSave())}
          className="rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/40"
        />
      </TableCell>
    </tr>
  );
}
