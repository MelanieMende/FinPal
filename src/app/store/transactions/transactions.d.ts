interface Transaction {
	ID: number,
	date: string,
	type: string,
	asset_ID: number,
	rank: number,
	amount: float,
	shares_cumulated: float,
	price_per_share: float,
	fee: float,
	solidarity_surcharge: float,
	invest_cumulated: float,
	in_out: float
}