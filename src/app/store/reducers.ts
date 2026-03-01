// @flow
import { combineReducers } from '@reduxjs/toolkit';

import appState from './appState/appState.reducer';
import assets from './assets/assets.reducer';
import assetCreation from './assetCreation/assetCreation.reducer';
import transactions from './transactions/transactions.reducer';
import transactionCreation from './transactionCreation/transactionCreation.reducer'
import dividends from './dividends/dividends.reducer';
import dividendCreation from './dividendCreation/dividendCreation.reducer'
import cash from './cash/cash.reducer'
import cashTransactionCreation from './cashTransactionCreation/cashTransactionCreation.reducer'

const rootReducer = combineReducers({
	appState,
	assets,
	assetCreation,
	transactions,
	transactionCreation,
	dividends,
	dividendCreation,
	cash,
	cashTransactionCreation
});

export type RootState = ReturnType<typeof rootReducer>;
export default rootReducer;