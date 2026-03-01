import { useAppDispatch, useAppSelector } from '../../../../hooks'
import * as cashTransactionCreationReducer from '../../../../store/cashTransactionCreation/cashTransactionCreation.reducer'
import { useState } from 'react'

export default function CashCreation() {
  const dispatch = useAppDispatch();
  const dateInput = useAppSelector(state => state.cashTransactionCreation.dateInput)
  const typeInput = useAppSelector(state => state.cashTransactionCreation.typeInput)      
  const amountInput = useAppSelector(state => state.cashTransactionCreation.amountInput)
  const feeInput = useAppSelector(state => state.cashTransactionCreation.feeInput)
  const commentInput = useAppSelector(state => state.cashTransactionCreation.commentInput)

  return (
    <tr data-testid="cash-creation-row">
      <td></td>
      <td><input value={dateInput} onChange={e=>dispatch(cashTransactionCreationReducer.setDateInput(e.target.value))} onBlur={() => { dispatch(cashTransactionCreationReducer.handleDateInputGotTouched()) }} type="date" className="border p-1"/></td>
      <td>
        <select value={typeInput} onChange={e=>dispatch(cashTransactionCreationReducer.setTypeInput(e.target.value))} onBlur={() => { dispatch(cashTransactionCreationReducer.handleTypeInputGotTouched()) }} className="border p-1">
          <option>Deposit</option>
          <option>Withdrawal</option>
        </select>
      </td>
      <td><input value={amountInput} onChange={e=>dispatch(cashTransactionCreationReducer.setAmountInput(e.target.value))} onBlur={() => { dispatch(cashTransactionCreationReducer.handleAmountInputGotTouched()) }} className="border p-1"/></td>
      <td><input value={feeInput} onChange={e=>dispatch(cashTransactionCreationReducer.setFeeInput(e.target.value))} onBlur={() => { dispatch(cashTransactionCreationReducer.handleFeeInputGotTouched()) }} className="border p-1" placeholder="0"/></td>
      <td><input value={commentInput} onChange={e=>dispatch(cashTransactionCreationReducer.setCommentInput(e.target.value))} onBlur={() => { dispatch(cashTransactionCreationReducer.handleCommentInputGotTouched()) }} className="border p-1"/></td>
      <td><button onClick={(e) => dispatch(cashTransactionCreationReducer.validateAndSave())} className="bg-blue-500 text-white px-2 py-1">Add</button></td>
    </tr>
  )
}
