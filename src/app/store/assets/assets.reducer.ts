import { createAsyncThunk, createSlice, type Dispatch } from '@reduxjs/toolkit'
import { quoteTime, restoreQuote, saveQuote, clearCachedQuote, type QuoteMetadata, type EuroExchangeRates } from '../../utils/quoteMetadata';
import type { TradeRepublicQuote } from '../../utils/tradeRepublicSync';
import { calendarDate, todayDate, upcomingForecasts, isDividendForecastAsset, needsDividendForecast, type DividendForecast } from '../../utils/dividendForecasts';
import { recordMarketPriceUpdate } from '../../utils/syncTimestamps';
import { readBondHolding, type BondHolding } from '../../utils/bondHoldings';

export const initialState = [] as Asset[]

export interface LoadPricesOptions {
	assetIDs?: number[];
	preferTradeRepublicPrice?: boolean;
	includeDividends?: boolean;
}

export const loadAssets = createAsyncThunk<void, { assetIDs?: number[] } | void>(
  'assets/loadAssets',
  async (props, thunkAPI) => {
		console.log('loading assets from DB...')
		let sql = 'SELECT * FROM assets_v'
		if (props && props.assetIDs && props.assetIDs.length > 0) {
			sql += ` WHERE ID IN (${props.assetIDs.join(',')})`
		}
		let assets = await window.API.sendToDB(sql)
		console.log('assets result: ', assets)
		
		if (!Array.isArray(assets)) {
			console.error('Failed to load assets from DB: ', assets)
			thunkAPI.dispatch(setAssets([]))
			return
		}

		for(const asset of assets) {
			asset.currencySymbol = '€'
			restoreQuote(asset)
		}
		thunkAPI.dispatch(setAssets(assets))
		if (assets.length === 0) return
		thunkAPI.dispatch(loadPricesAndDividends({
			assetIDs: props ? props.assetIDs : undefined,
			preferTradeRepublicPrice: false,
		}))
  }
)

export const loadAsset = createAsyncThunk(
  'assets/loadAsset',
  async (props: {assetID:number}, thunkAPI) => {
		console.log('loading asset with ID ' + props.assetID + ' from DB...')
		let sql = 'SELECT * FROM assets_v WHERE ID = ' + props.assetID
		let assets = await window.API.sendToDB(sql)
		console.log('result: ', assets)
		for(const asset of assets) {
			asset.currencySymbol = '€'
			restoreQuote(asset)
			console.log('loaded asset: ', asset)
			thunkAPI.dispatch(setAsset(asset))
		}
		thunkAPI.dispatch(loadPricesAndDividends({ assetIDs: [props.assetID], preferTradeRepublicPrice: false }))
  }
)

export const loadPricesAndDividends = createAsyncThunk(
  'assets/loadPrices',
  async (props: LoadPricesOptions | undefined, thunkAPI) => {

		let state = thunkAPI.getState() as State

		// One FX snapshot per refresh, fetched only when a foreign quote needs it.
		let fxPromise: Promise<EuroExchangeRates> | undefined
		const getFX = () => fxPromise ??= window.API.getEuroExchangeRates
			? window.API.getEuroExchangeRates()
			: Promise.reject(new Error('Wechselkurszugriff fehlt. Bitte FinPal neu starten.'))
		const publishQuote = (asset: Asset, price: number | null, quote: QuoteMetadata) => {
			saveQuote(asset, price, quote)
			thunkAPI.dispatch(setPrice({ asset, price: price ?? undefined }))
			thunkAPI.dispatch(setQuote({ asset, quote }))
		}

		let assetsToRefresh = state.assets.filter(a => props?.assetIDs?.length ? props.assetIDs.includes(a.ID) : a.is_watched)
		if (props?.assetIDs && props.assetIDs.length > 0) {
			assetsToRefresh = assetsToRefresh.filter(a => props.assetIDs.includes(a.ID))
		}
		let tradeRepublicQuotes: TradeRepublicQuote[] = []
		let tradeRepublicQuotesFetchedAt: string | undefined
		let marketPriceRecorded = false
		try {
			const quoteCache = await window.API.getTradeRepublicQuotes?.()
			tradeRepublicQuotes = quoteCache?.quotes ?? []
			tradeRepublicQuotesFetchedAt = quoteCache?.fetchedAt
		} catch (error) {
			console.error('Failed to load cached Trade Republic quotes:', error)
		}

		for(const asset of assetsToRefresh) {
			
			console.log(asset.name, '-', asset.symbol)

			let resultYahooFinance:any = null;
			let priceQuote: QuoteMetadata | undefined
			try {
				const tradeRepublicQuote = findTradeRepublicQuote(asset, tradeRepublicQuotes)
				const confirmedHolding = asset.type === 'Bond' ? await readBondHolding(asset) : undefined
				const bondHolding = confirmedHolding ? { ...confirmedHolding,
					...(tradeRepublicQuote ? { brokerQuantity: tradeRepublicQuote.quantity,
						quantityConflict: Math.abs(tradeRepublicQuote.quantity - confirmedHolding.nominal) > 0.01 } : {}),
				} : undefined
				if (asset.type === 'Bond') thunkAPI.dispatch(setBondHolding({ asset, bondHolding }))
				if (bondHolding) {
					clearCachedQuote(asset)
					thunkAPI.dispatch(setPrice({ asset, price: undefined }))
					thunkAPI.dispatch(setQuote({ asset, quote: undefined }))
				}
				const cachedPrice = tradeRepublicQuote?.price
				const usableTradeRepublicQuote = Number.isFinite(cachedPrice) && cachedPrice > 0
				const canUseBrokerHolding = !bondHolding || !bondHolding.quantityConflict
				resultYahooFinance = canUseBrokerHolding && props?.preferTradeRepublicPrice !== false && tradeRepublicQuote
					? { price: { regularMarketPrice: tradeRepublicQuote.price, currency: 'EUR' }, source: 'trade-republic' }
					: await callYahooFinanceAPI(asset).catch((error): null => {
						console.error(`Failed to fetch market price for ${asset.symbol}:`, error)
						return null
					})
				const marketPrice = resultYahooFinance?.price?.regularMarketPrice
				if ((!Number.isFinite(marketPrice) || marketPrice <= 0) && usableTradeRepublicQuote && canUseBrokerHolding) {
					resultYahooFinance = { price: { regularMarketPrice: cachedPrice, currency: 'EUR' }, source: 'trade-republic' }
				}
				console.log(asset.name, '- Price:', resultYahooFinance)
				if (bondHolding && (resultYahooFinance?.source === 'trade-republic'
					? !canUseBrokerHolding
					: (!(marketPrice > 0) || resultYahooFinance.tradedInPercent !== true || resultYahooFinance.price.currency !== bondHolding.currency))) {
					// A mismatched broker quantity cannot establish a price per confirmed nominal unit.
					thunkAPI.dispatch(setPrice({ asset, price: undefined }))
					continue
				}

				if (resultYahooFinance && resultYahooFinance.price) {
					let price = resultYahooFinance.price.regularMarketPrice
					const rawCurrency = resultYahooFinance.price.currency
					const currency = typeof rawCurrency === 'string' && /^(?:[A-Z]{3}|GBp|ZAc)$/.test(rawCurrency) ? rawCurrency : 'unknown'
					const fetchedAt = new Date().toISOString()
					const trQuote = (): QuoteMetadata => ({
						originalPrice: tradeRepublicQuote.price, originalCurrency: 'EUR', valuationCurrency: 'EUR',
						source: 'trade-republic', quoteAsOf: quoteTime(tradeRepublicQuote.quoteAsOf),
						...(tradeRepublicQuote.exchange ? { exchange: tradeRepublicQuote.exchange } : {}),
						fetchedAt: tradeRepublicQuotesFetchedAt || fetchedAt, convertedAt: null,
						fxRateToEUR: 1, fxSource: null, fxAsOf: null, fxFetchedAt: null,
					})
					priceQuote = resultYahooFinance.source === 'trade-republic' ? trQuote() : {
						originalPrice: price, originalCurrency: currency, valuationCurrency: 'EUR',
						source: resultYahooFinance.source || 'yahoo-finance',
						quoteAsOf: quoteTime(resultYahooFinance.price.regularMarketTime), fetchedAt,
						...(typeof (resultYahooFinance.exchange ?? resultYahooFinance.price.exchangeName) === 'string'
							? { exchange: resultYahooFinance.exchange ?? resultYahooFinance.price.exchangeName } : {}),
						...(typeof resultYahooFinance.tradedInPercent === 'boolean' ? { tradedInPercent: resultYahooFinance.tradedInPercent } : {}),
						convertedAt: null, fxRateToEUR: 1, fxSource: null, fxAsOf: null, fxFetchedAt: null,
					}
					if (Number.isFinite(price) && price > 0 && currency !== 'EUR') {
						try {
							const fx = await getFX()
							const minorUnits: Record<string, string> = { GBp: 'GBP', GBX: 'GBP', ZAc: 'ZAR', ILA: 'ILS' }
							const rate = fx.rates[minorUnits[currency] || currency] * (minorUnits[currency] ? 0.01 : 1)
							if (!Number.isFinite(rate) || rate <= 0) throw new Error(`Kein EUR-Wechselkurs für ${currency}.`)
							price *= rate
							priceQuote = { ...priceQuote, convertedAt: new Date().toISOString(), fxRateToEUR: rate,
								fxSource: fx.source, fxAsOf: fx.asOf, fxFetchedAt: fx.fetchedAt }
						} catch (error) {
							priceQuote = { ...priceQuote, valuationCurrency: 'unknown', fxRateToEUR: null,
								error: error instanceof Error ? error.message : 'Wechselkurs fehlt.' }
							publishQuote(asset, null, priceQuote)
							price = NaN
						}
					}
					
					if (Number.isFinite(price) && price > 0) {
						let bondPriceHandled = false
						if (bondHolding && asset.current_shares > 0) {
							// Confirmed nominal currency and percentage notation establish the units.
							// Price drift against an old broker snapshot is not an identity check.
							const marketTime = Date.parse(priceQuote.quoteAsOf ?? '')
							const brokerTime = Date.parse(tradeRepublicQuote?.quoteAsOf ?? '')
							const useMarketPrice = resultYahooFinance.source !== 'trade-republic'
								&& Number.isFinite(marketTime) && marketTime <= Date.now()
								&& (!Number.isFinite(brokerTime) || marketTime >= brokerTime)
							const brokerPrice = canUseBrokerHolding && tradeRepublicQuote
								? getBondPricePerRecordedShare(asset, tradeRepublicQuote) : undefined
							const bondQuote = useMarketPrice ? priceQuote : brokerPrice !== undefined ? trQuote() : undefined
							const bondPrice = useMarketPrice
								? price * bondHolding.nominal / (100 * asset.current_shares) : brokerPrice
							if (bondQuote && bondPrice !== undefined) {
								const unitFactor = bondPrice / (bondQuote.originalPrice * bondQuote.fxRateToEUR)
								publishQuote(asset, bondPrice, { ...bondQuote, unitFactor })
								if (useMarketPrice && !marketPriceRecorded) { recordMarketPriceUpdate(); marketPriceRecorded = true }
							}
							bondPriceHandled = true
						}
						if (!bondHolding && asset.type === 'Bond' && tradeRepublicQuote && asset.current_shares > 0) {
							const marketPricePerNominal = resultYahooFinance.tradedInPercent ? price / 100 : price
							const bondPrice = getBondPricePerRecordedShare(
								asset, tradeRepublicQuote,
								resultYahooFinance.source === 'trade-republic' ? undefined : marketPricePerNominal,
							)
							if (bondPrice !== undefined) {
								const compatible = marketPricePerNominal >= tradeRepublicQuote.price * 0.9 && marketPricePerNominal <= tradeRepublicQuote.price * 1.1
								const bondQuote = resultYahooFinance.source === 'trade-republic' || !compatible ? trQuote() : priceQuote
								publishQuote(asset, bondPrice, { ...bondQuote,
									unitFactor: bondPrice / (bondQuote.originalPrice * bondQuote.fxRateToEUR),
									...(tradeRepublicQuotesFetchedAt ? { bondUnits: {
										brokerQuantity: tradeRepublicQuote.quantity, recordedQuantity: asset.current_shares,
										source: 'trade-republic' as const, fetchedAt: tradeRepublicQuotesFetchedAt,
									} } : {}),
								})
								bondPriceHandled = true
								if (resultYahooFinance.source !== 'trade-republic' &&
									marketPricePerNominal >= tradeRepublicQuote.price * 0.9 &&
									marketPricePerNominal <= tradeRepublicQuote.price * 1.1 && !marketPriceRecorded) {
									recordMarketPriceUpdate()
									marketPriceRecorded = true
								}
							}
						}
						if (!bondPriceHandled) {
							const cacheAge = Date.now() - Date.parse(tradeRepublicQuotesFetchedAt ?? '')
							const recentTradeRepublicQuote = tradeRepublicQuote?.price > 0 && cacheAge >= 0 && cacheAge < 24 * 60 * 60 * 1000
							const differsStrongly = recentTradeRepublicQuote && (price > tradeRepublicQuote.price * 1.5 || price < tradeRepublicQuote.price / 1.5)
							const usedTradeRepublicQuote = resultYahooFinance.source === 'trade-republic' || differsStrongly
							if (differsStrongly) {
								console.warn(`Ignoring implausible market price for ${asset.symbol}; using recent Trade Republic quote.`)
								price = tradeRepublicQuote.price
								priceQuote = trQuote()
							}
							publishQuote(asset, price, priceQuote)
							if (!usedTradeRepublicQuote && !marketPriceRecorded) {
								recordMarketPriceUpdate()
								marketPriceRecorded = true
							}
							if (asset.type !== 'Bond' && tradeRepublicQuote?.averageBuyIn > 0) {
								thunkAPI.dispatch(setAveragePricePaid({ asset, averageBuyIn: tradeRepublicQuote.averageBuyIn }))
							}
							thunkAPI.dispatch(setDividendYield({ asset, dividendYield: resultYahooFinance.summaryDetail?.dividendYield })) // dividend per share
						}
					}
				}
			} catch (err) {
				console.error(`Failed to fetch Yahoo Finance data for ${asset.symbol}:`, err)
			}

			if (props?.includeDividends === false) continue

			await refreshAssetDividends(asset, thunkAPI.dispatch, getFX)
		}
  }
)

export const loadDividendForecasts = createAsyncThunk('assets/loadDividendForecasts', async (options: { onlyMissing?: boolean } | void, thunkAPI) => {
  const allAssets = (thunkAPI.getState() as State).assets;
  const assets = allAssets.filter(options && options.onlyMissing ? needsDividendForecast : isDividendForecastAsset);
  for (const asset of allAssets) {
    if (!isDividendForecastAsset(asset) && asset.dividendForecastError) thunkAPI.dispatch(setDividendForecastError({ asset, error: undefined }));
  }
  let fx: Promise<EuroExchangeRates> | undefined;
  const getFX = () => fx ??= window.API.getEuroExchangeRates ? window.API.getEuroExchangeRates() : Promise.reject(new Error('Wechselkurszugriff fehlt.'));
  for (const asset of assets) await refreshAssetDividends(asset, thunkAPI.dispatch, getFX);
});

const dividendRequests = new WeakMap<Dispatch, Map<number, object>>();

async function refreshAssetDividends(asset: Asset, dispatch: Dispatch, getFX: () => Promise<EuroExchangeRates>) {
  if (!isDividendForecastAsset(asset)) {
    dispatch(setDividendForecastError({ asset, error: undefined }));
    return;
  }
  let requests = dividendRequests.get(dispatch);
  if (!requests) { requests = new Map(); dividendRequests.set(dispatch, requests); }
  const request = {};
  requests.set(asset.ID, request);
  dispatch(setDividendForecastRequested({ asset }));
  const isLatest = () => requests!.get(asset.ID) === request;
  try {
    const json = await callDivvyDiaryAPI(asset.isin);
    if (!json || !Array.isArray(json.dividends)) throw new Error('Keine gültigen Dividendendaten erhalten.');
    const upcoming = upcomingForecasts(json.dividends);
    const transactions = upcoming.length ? await window.API.sendToDB('SELECT date, type, amount FROM transactions WHERE asset_ID = ' + asset.ID + ' ORDER BY date, ID') : [];
    const forecasts: DividendForecast[] = [];
    for (const dividend of upcoming) {
      const currency = dividend.currency || json.currency;
      let amountEUR: number | undefined;
      if (currency === 'EUR') amountEUR = dividend.amount;
      else if (currency) {
        try { const rate = (await getFX()).rates[currency]; if (Number.isFinite(rate) && rate > 0) amountEUR = dividend.amount * rate; } catch { /* Display the original currency instead of inventing EUR. */ }
      }
      const exDate = calendarDate(dividend.exDate);
      let eligibleShares: number | undefined;
      if (exDate && exDate <= todayDate() && Array.isArray(transactions) && transactions.length) {
        eligibleShares = transactions.filter(row => calendarDate(row.date) && calendarDate(row.date)! < exDate)
          .reduce((shares, row) => shares + (row.type === 'Buy' ? Number(row.amount) : row.type === 'Sell' ? -Number(row.amount) : 0), 0);
      } else if (exDate && exDate > todayDate()) eligibleShares = asset.current_shares;
      forecasts.push({ ...dividend, currency, amountEUR, eligibleShares });
    }
    if (!isLatest()) return;
    dispatch(setDividends({ asset, dividends: forecasts }));
    dispatch(setDividendForecastError({ asset, error: undefined }));
    const next = forecasts[0];
    dispatch(setPayDividendDate({ asset, payDividendDate: next?.payDate }));
    dispatch(setNextEstimatedDividendPerShare({ asset, next_estimated_dividend_per_share: next?.amountEUR }));
    dispatch(setDividendFrequency({ asset, dividendFrequency: json.dividendFrequency }));
    if (next?.exDate) {
      dispatch(setExDividendDate({ asset, exDividendDate: next.exDate }));
      if (next.eligibleShares !== undefined) dispatch(setDividendEligibleShares({ asset, shares: next.eligibleShares }));
    }
  } catch (error) {
    if (isLatest()) dispatch(setDividendForecastError({ asset, error: error instanceof Error ? error.message : 'Dividenden konnten nicht geladen werden.' }));
  }
}

export const setIsWatched = createAsyncThunk(
  'assets/setIsWatched',
  async (props: {asset: Asset, is_watched: boolean}, thunkAPI) => {
		let state = thunkAPI.getState() as State
		for(const asset of state.assets) {
			if(asset.ID === props.asset.ID) {
				let sql = 'UPDATE assets SET is_watched = ' + props.is_watched + ' WHERE ID = ' + props.asset.ID
				console.log(sql)
				let result = await window.API.sendToDB(sql)
				console.log('result: ', result)
				thunkAPI.dispatch(setAsset({ asset: props.asset, is_watched: props.is_watched }))
			}
		}
  }
)

async function callYahooFinanceAPI(asset:Asset) {
	var result = await window.API.sendToYahooFinanceAPI({symbol:getYahooFinanceSymbol(asset), isin:asset.isin, type:asset.type})
	return result
}

export function getYahooFinanceSymbol(asset: Pick<Asset, 'symbol' | 'type'>) {
	const symbol = asset.symbol.trim()
	if (asset.type === 'Crypto' && !symbol.includes('-')) {
		return `${symbol.toUpperCase()}-EUR`
	}
	return symbol
}

export function findTradeRepublicQuote(asset: Pick<Asset, 'isin' | 'name'>, quotes: TradeRepublicQuote[]) {
	const isin = asset.isin?.trim().toUpperCase()
	if (isin) {
		const byIsin = quotes.find(quote => quote.isin === isin)
		if (byIsin) return byIsin
	}
	const name = asset.name?.trim().toLocaleLowerCase()
	return name ? quotes.find(quote => quote.name.trim().toLocaleLowerCase() === name) : undefined
}

export function getBondPricePerRecordedShare(asset: Pick<Asset, 'current_shares'>, quote: TradeRepublicQuote, marketPricePerNominal?: number) {
	if (!(asset.current_shares > 0 && quote.quantity > 0 && quote.price > 0 && quote.netValue > 0)) return undefined
	// Bond imports currently record one share per purchase, while TR reports nominal units.
	// Only use a market quote if it is demonstrably in the same unit as TR's quote.
	const usableMarketPrice = marketPricePerNominal !== undefined && Number.isFinite(marketPricePerNominal) &&
		marketPricePerNominal >= quote.price * 0.9 && marketPricePerNominal <= quote.price * 1.1
	const positionValue = usableMarketPrice ? quote.quantity * marketPricePerNominal : quote.netValue
	return positionValue / asset.current_shares
}

async function callDivvyDiaryAPI(isin:string) {
	var result = await window.API.sendToDivvyDiaryAPI({isin:isin})
	return result
}

export function sortBy(a:Asset, b:Asset, property:string, direction:'asc'|'desc') {
	if(property == 'name') {
		if(direction == 'asc')
			return a.name.localeCompare(b.name)
		else
			return b.name.localeCompare(a.name)
	}
	else if(property == 'KGV') {
		if(direction == 'asc')
			return a.kgv.localeCompare(b.kgv)
		else
			return b.kgv.localeCompare(a.kgv)
	}
	else if(property == 'current_profit_loss_percentage') {
		if(direction == 'asc')
			if(a.current_profit_loss_percentage > b.current_profit_loss_percentage)
				return -1
			else return 1
		else
			if(b.current_profit_loss_percentage < a.current_profit_loss_percentage)
				return -1
			else return 1
	}
}

const assetsSlice = createSlice({
	name: 'assets',
	initialState,
	reducers: {
		setAsset(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				const assetData = action.payload.asset ? action.payload.asset : action.payload;
				if(item.ID === assetData.ID) {
					const additionalProps = action.payload.is_watched !== undefined ? { is_watched: action.payload.is_watched } : {};
					return Object.assign({}, item, assetData, additionalProps);
				}
				else {
					return item
				}
			})
			return mapped
		},
		setAssets(state, action:{payload:Asset[]}) {
			return action.payload
		},
		setCurrencySymbol(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { currencySymbol: action.payload.currencySymbol })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setCurrentInvest(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { current_invest: action.payload.current_invest })
				}
				else {
					return item
				}
			})
			return mapped
		},
        setDividendForecastRequested(state, action) {
          const asset = state.find(item => item.ID === action.payload.asset.ID);
          if (asset) asset.dividendForecastRequested = true;
        },
        setDividendForecastError(state, action) {
          const asset = state.find(item => item.ID === action.payload.asset.ID);
          if (asset) asset.dividendForecastError = action.payload.error;
        },
        setDividendEligibleShares(state, action) {
          const asset = state.find(item => item.ID === action.payload.asset.ID);
          if (asset) asset.current_shares_before_ex_date = action.payload.shares;
        },
		setDividends(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { dividends: action.payload.dividends })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setDividendFrequency(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { dividendFrequency: action.payload.dividendFrequency })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setDividendYield(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { dividendYield: action.payload.dividendYield })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setExDividendDate(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { exDividendDate: action.payload.exDividendDate })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setNextEstimatedDividendPerShare(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { next_estimated_dividend_per_share: action.payload.next_estimated_dividend_per_share })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setPayDividendDate(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { payDividendDate: action.payload.payDividendDate })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setPrice(state, action) {
			let mapped = state.map((item:Asset, index:number) => { 
				if(item.ID === action.payload.asset.ID) {
					return Object.assign({}, item, { price: action.payload.price })
				}
				else {
					return item
				}
			})
			return mapped
		},
		setQuote(state, action: { payload: { asset: Asset; quote?: QuoteMetadata } }) {
			return state.map(item => item.ID === action.payload.asset.ID
				? { ...item, quote: action.payload.quote } : item)
		},
		setBondHolding(state, action: { payload: { asset: Asset; bondHolding?: BondHolding } }) {
			return state.map(item => item.ID === action.payload.asset.ID ? { ...item, bondHolding: action.payload.bondHolding } : item)
		},
		setAveragePricePaid(state, action) {
			return state.map((item:Asset) => item.ID === action.payload.asset.ID
				? Object.assign({}, item, { avg_price_paid: action.payload.averageBuyIn })
				: item)
		}
	}
})

// Extract the action creators object and the reducer
const { actions, reducer } = assetsSlice
// Extract and export each action creator by name
export const {
	setAsset,
	setAssets,
	setCurrencySymbol,
	setCurrentInvest,
	setDividendForecastRequested,
	setDividends,
  setDividendForecastError,
  setDividendEligibleShares,
	setDividendFrequency,
	setDividendYield,
	setExDividendDate,
	setNextEstimatedDividendPerShare,
	setPayDividendDate,
	setPrice,
	setQuote,
	setBondHolding,
	setAveragePricePaid
} = actions

export default reducer
