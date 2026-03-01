interface CashTransaction {
	ID: number,
	date: string,
	type: string,
	amount: number,
	fee?: number,
	comment?: string
}