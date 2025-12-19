export const get_current_shares_textColor = (asset:Asset) => (asset.current_shares == 0 ? "text-slate-500" : "inherit")
export const get_current_invest_textColor = (asset:Asset) => (asset.current_invest == 0 ? "text-slate-500" : "inherit")
export const get_current_value = (asset:Asset) => (asset.current_shares * asset.price)
export const get_current_value_textColor = (asset:Asset) => (get_current_value(asset) == 0 ? "text-slate-500" : "inherit")
export const get_current_profit_loss = (asset:Asset) => (asset.current_shares * asset.price) + asset.current_invest
export const get_current_profit_loss_percentage = (asset:Asset) => (asset.current_invest != 0 ? -1 * get_current_profit_loss(asset)/asset.current_invest * 100 : 0)
export const get_current_profit_loss_bgColor = (asset:Asset) => (get_current_profit_loss(asset) > 0 ? "bg-teal-600" : (get_current_profit_loss(asset) == 0 ? "transparent" : "bg-custom-red"))
export const get_current_profit_loss_textColor = (asset:Asset) => (get_current_profit_loss(asset) == 0 ? "text-slate-500" : "inherit")
export const get_current_sum_in_out_bgColor = (current_sum_in_out:number) => (current_sum_in_out > 0 ? "bg-teal-600" : (current_sum_in_out < 0 ? "bg-custom-red" : "inherit"))
export const get_ex_dividend_date_textColor = (asset:Asset) => (new Date(asset.exDividendDate) < new Date() ? "text-slate-500" : "inherit")
export const get_pay_dividend_date_textColor = (asset:Asset) => (new Date(asset.payDividendDate) < new Date() ? "text-slate-500" : "inherit")
export const get_dividends_earned_textColor = (asset:Asset) => (asset.dividends_earned <= 0 ? "text-slate-500" : "inherit")

export function get_upcoming_dividends(asset:Asset) {
	let upcoming_div = { value: 0, is_estimated: true }
	if(asset.current_shares_before_ex_date > 0) {
		upcoming_div.value = asset.next_estimated_dividend_per_share ? asset.next_estimated_dividend_per_share * asset.current_shares_before_ex_date: 0
		upcoming_div.is_estimated = false
	}
	else {
		0
	}
	return upcoming_div
}

export const get_upcoming_dividends_textColor = (asset:Asset) => (get_upcoming_dividends(asset).value <= 0 ? "text-slate-500" : (get_upcoming_dividends(asset).is_estimated ? "text-pink-600" : "inherit"))
export const get_upcoming_dividends_per_share_textColor = (asset:Asset) => (asset.next_estimated_dividend_per_share <= 0 || isNaN(asset.next_estimated_dividend_per_share) ? "text-slate-500" : "inherit")


export function get_estimated_dividends_per_year(asset:Asset) {
	let divs = 0
	if(get_upcoming_dividends(asset).value > 0) {
		if(asset.dividendFrequency == 'annually') 
			divs = get_upcoming_dividends(asset).value
		else if(asset.dividendFrequency == 'biannually')
			divs = get_upcoming_dividends(asset).value * 2
		else if(asset.dividendFrequency == 'quarterly')
			divs = get_upcoming_dividends(asset).value * 4
	}
	return divs
}

export const get_dividend_yield_formatted = (asset:Asset) => (asset.dividendYield ? (Math.round(asset.dividendYield * 10000) / 100).toFixed(2) + ' %' : '')

export function selectAssetsWithUpcomingDividends(state: Asset[]) {
	const assets_with_current_shares_before_ex_date = state != undefined ? state.filter((asset:Asset) => asset.current_shares_before_ex_date > 0) : []
	const assets_with_upcoming_dividends = assets_with_current_shares_before_ex_date.filter((asset) => asset.next_estimated_dividend_per_share > 0 && new Date(asset.payDividendDate) >= new Date())
	return assets_with_upcoming_dividends
}

export function selectAssetsSortedByProfitLoss(state: Asset[], direction:'asc'|'desc') {
  const active = state.filter((asset:Asset) => asset.current_shares != 0 && asset.current_shares != null)
	const inactive = state.filter((asset:Asset) => asset.current_shares == 0 || asset.current_shares == null)
	const sorted = active.slice().sort((a:Asset, b:Asset) => sortBy(a, b, 'current_profit_loss_percentage', direction))
	const all = sorted.concat(inactive)
  return all
}

export function selectAssetsSortedByName(state: Asset[], direction:'asc'|'desc') {
  return state != undefined ? state.slice().sort((a:Asset, b:Asset) => sortBy(a, b, 'name', direction)) : []
}

export function selectAssetsSortedByDividendPayDate(state: Asset[], direction:'asc'|'desc') {
  return state != undefined ? state.slice().sort((a:Asset, b:Asset) => sortBy(a, b, 'dividendPayDate', direction)) : []
}

export function sortBy(a:Asset, b:Asset, property:string, direction:'asc'|'desc') {
	if(property == 'name') {
		if(direction == 'asc')
			return a.name.localeCompare(b.name)
		else
			return b.name.localeCompare(a.name)
	}
	else if(property == 'dividendPayDate') {
		if(direction == 'asc')
			return a.payDividendDate.localeCompare(b.payDividendDate)
		else
			return b.payDividendDate.localeCompare(a.payDividendDate)
	}
	else if(property == 'current_profit_loss_percentage') {
		if(direction == 'asc')
			if(get_current_profit_loss_percentage(a) < get_current_profit_loss_percentage(b))
				return -1
			else return 1
		else
			if(get_current_profit_loss_percentage(b) < get_current_profit_loss_percentage(a))
				return -1
			else return 1
	}
}