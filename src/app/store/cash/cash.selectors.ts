import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '..';

export const selectCashTotals = createSelector(
  [(state: RootState) => state.cash, (state: RootState) => state.transactions, (state: RootState) => state.dividends],
  (cash, transactions, dividends) => {
    const totalFee = cash.reduce((sum, entry) => sum + (entry.fee || 0), 0);
    const totalAmount = cash.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalDeposits = cash.filter(entry => entry.type === 'Deposit').reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalWithdrawals = cash.filter(entry => entry.type === 'Withdrawal').reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalInterest = cash.filter(entry => entry.type === 'Interest').reduce((sum, entry) => sum + (entry.amount || 0), 0);
    const totalTransactionFlow = (transactions || []).reduce((sum, entry) => sum + (entry.in_out || 0), 0);
    const totalDividends = (dividends || []).reduce((sum, entry) => sum + (entry.income || 0), 0);
    const totalLiquidity = totalDeposits + totalInterest - totalWithdrawals - totalFee + totalTransactionFlow + totalDividends;
    return { totalFee, totalAmount, totalDeposits, totalWithdrawals, totalInterest, totalTransactionFlow, totalDividends, totalLiquidity };
  }
);

export const selectTotalLiquidity = (state: RootState) => selectCashTotals(state).totalLiquidity;
