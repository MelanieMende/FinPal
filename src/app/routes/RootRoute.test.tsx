import { act, waitFor } from '@testing-library/react'
import { render } from '../../testing/test-utils'
import RootRoute, { sendToDB } from './RootRoute';
import { setupStore } from '../store';
import { Provider } from 'react-redux';


var API = {
	getConfig: jest.fn(),
	saveTheme: jest.fn(),
	saveSelectedTab: jest.fn(),
	saveDatabase: jest.fn(),
	save_Transactions_AssetFilter: jest.fn(),
	selectFolder: jest.fn(),
	dbFileExists: jest.fn(() => { return true }),
	sendToDB: jest.fn((param) => {
		if(param == 'SELECT MAX(ID) as ID FROM assets') return [{ID: 1}]
		return []
	}),
	sendToFinanceAPI: jest.fn(),
	quit: jest.fn()
}

describe('RootRoute component', () => {

  it.each([false, true])('migrates transaction depots only when the column is missing (exists: %s)', async exists => {
    const sendToDB = jest.fn((sql: string) => sql === 'PRAGMA table_info(transactions)'
      ? [{ name: 'ID' }, ...(exists ? [{ name: 'depot' }] : [])] : []);
    window.API = { ...API, sendToDB, getConfig: jest.fn(() => ({ selectedTab: 'transactionsTab', theme: 'bp5-dark', database: 'test.sqlite3' })) };
    await act(async () => { render(<RootRoute />); });
    await waitFor(() => expect(sendToDB).toHaveBeenCalledWith('DROP VIEW IF EXISTS transactions_v'));
    if (exists) {
      expect(sendToDB).not.toHaveBeenCalledWith('ALTER TABLE transactions ADD COLUMN depot TEXT');
      expect(sendToDB).not.toHaveBeenCalledWith("UPDATE transactions SET depot = 'Trade Republic' WHERE depot IS NULL");
    } else {
      expect(sendToDB).toHaveBeenCalledWith('ALTER TABLE transactions ADD COLUMN depot TEXT');
      expect(sendToDB).toHaveBeenCalledWith("UPDATE transactions SET depot = 'Trade Republic' WHERE depot IS NULL");
    }
  });

	it('renders', async() => {
    const {getAllById} = render(<RootRoute />) 
		await waitFor(() => {
			expect(getAllById('RootRoute').length).toEqual(1);
		})
	});

	describe('Content()', () => {

    it('restores the saved analysis tab when a database is configured', async () => {
      window.API = { ...API, getConfig: jest.fn(() => ({ selectedTab: 'analysisTab', theme: 'bp5-dark', database: 'test.sqlite3' })) };
      const store = setupStore();
      const view = await act(async () => render(<RootRoute />, { store }));
      expect(store.getState().appState.selectedTab).toBe('analysisTab');
      expect(view.getByTestId('AnalysisRoute')).toBeInTheDocument();
    });

		describe('assetsTab', () => {

			it('sets selectedTab to "assetsTab" if "selectedTab":"assetsTab" and a database is set in the config file', async() => {

				window.API = Object.assign({}, API, {
					getConfig: jest.fn(() => { return {"selectedTab":"assetsTab","theme":"bp5-dark","database":"C:\\Users\\melan\\Dropbox\\#1 - Persöhnliche Ordner\\Melle\\Development\\FinPal\\db_test.sqlite3"} }),
				})

				const store = setupStore();
				await act(async() => {
					render(
						<Provider store={store}>
							<RootRoute />
						</Provider>
					)
				})
				await waitFor(() => {
					expect(store.getState().appState.selectedTab).toEqual('assetsTab');
				})
			});

			it('sets selectedTab to "dashboardTab" if "selectedTab":"databaseTab" and a database is set in the config file', async() => {

				window.API = Object.assign({}, API, {
					getConfig: jest.fn(() => { return {"selectedTab":"databaseTab","theme":"bp5-dark","database":"C:\\Users\\melan\\Dropbox\\#1 - Persöhnliche Ordner\\Melle\\Development\\FinPal\\db_test.sqlite3"} }),
				})

				const store = setupStore();
				await act(async() => {
					render(
						<Provider store={store}>
							<RootRoute />
						</Provider>
					)
				})
				await waitFor(() => {
					expect(store.getState().appState.selectedTab).toEqual('dashboardTab');
				})
			});

		})

		describe('dividendsTab', () => {

			beforeEach(() => {
				window.API = Object.assign({}, API, {
					getConfig: jest.fn(() => { return {"selectedTab":"dividendsTab","theme":"bp5-dark","database":"C:\\Users\\melan\\Dropbox\\#1 - Persöhnliche Ordner\\Melle\\Development\\FinPal\\db_test.sqlite3"} }),
				})
			});

			it('sets selectedTab to "dividendsTab" if "selectedTab":"dividendsTab" and a database is set in the config file', async() => {
				const store = setupStore();
				await act(async() => {
					render(
						<Provider store={store}>
							<RootRoute />
						</Provider>
					)
				})
				await waitFor(() => {
					expect(store.getState().appState.selectedTab).toEqual('dividendsTab');
				})
			});

		})

		describe('databaseTab', () => {

			describe('databaseTab - no database is set in the config file', () => {

				beforeEach(() => {
					window.API = Object.assign({}, API, {
						getConfig: jest.fn(() => { return {"selectedTab":"assetsTab"} }),
					})
				});

				it('sets selectedTab to "databaseTab" if no database is set in the config file', async() => {
					const store = setupStore();
					await act(async() => {
						render(
							<Provider store={store}>
								<RootRoute />
							</Provider>
						)
					})
					await waitFor(() => {
						expect(store.getState().appState.selectedTab).toEqual('databaseTab');
					})
				});

			})

		})
	
	})

	describe('setTheme(theme:string)', () => {

		it('sets theme to default "bp5-dark" if it is not set in the config file', async() => {
			const store = setupStore();
			await act(async() => {
				render(
					<Provider store={store}>
						<RootRoute />
					</Provider>
				)
			})
			await waitFor(() => {
        expect(store.getState().appState.theme).toEqual('bp5-dark');
      })
		});
	
	})

	describe('sendToDB(sql:string)', () => {

		beforeEach(() => {
			window.API = Object.assign({}, API, {
					sendToDB: jest.fn((param) => { return 'SQLITE_ERROR: TEST' }),
				})
		});

		it('logs error if sendToDB(sql) fails', async() => {
			const spyOn = jest.spyOn(console, 'error').mockImplementation(() => {})
			await sendToDB('sql')
			await waitFor(() => {
        expect(spyOn).toHaveBeenCalledWith('SQLITE_ERROR: TEST');
      })
			spyOn.mockRestore()
		});
	
	})
/*
	describe('setupTransactions()', () => {

		beforeEach(() => {
			const filePath = path_to_test_configs + 'config.json'
			window.API = Object.assign({}, API, {
				appState:{
					dataPath: path_to_test_configs,
					filePath: filePath,
					load: () => appStateAPI.load(filePath),
				},
				sendToDB: jest.fn((param) => { 
					if(param == 'SELECT MAX(ID) as ID FROM assets') return [{ID: 1}]
					else if(param == 'SELECT MAX(ID) as ID FROM transactions') return [{ID: 1}] 
				}),
			})
		});

		it('sets newID = result[0].ID + 1', async() => {
			const store = setupStore();
			await act(async() => {
				render(
					<Provider store={store}>
						<RootRoute />
					</Provider>
				)
			})
			await waitFor(() => {
        expect(store.getState().transactionCreation.newID).toEqual(2);
      })
		});
	
	})

	describe('setupDividends()', () => {

		beforeEach(() => {
			const filePath = path_to_test_configs + 'config.json'
			window.API = Object.assign({}, API, {
				appState:{
					dataPath: path_to_test_configs,
					filePath: filePath,
					load: () => appStateAPI.load(filePath),
				},
				sendToDB: jest.fn((param) => { 
					if(param == 'SELECT MAX(ID) as ID FROM assets') return [{ID: 1}]
					else if(param == 'SELECT MAX(ID) as ID FROM transactions') return [{ID: 1}]
					else if(param == 'SELECT MAX(ID) as ID FROM dividends') return [{ID: 1}] 
				}),
			})
		});

		it('sets newID = result[0].ID + 1', async() => {
			const store = setupStore();
			await act(async() => {
				render(
					<Provider store={store}>
						<RootRoute />
					</Provider>
				)
			})
			await waitFor(() => {
        expect(store.getState().dividendCreation.newID).toEqual(2);
      })
				
		});
	
	})
*/
})
