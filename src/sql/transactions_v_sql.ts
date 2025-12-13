const sql = `
  CREATE VIEW IF NOT EXISTS transactions_v AS
    WITH pre_calcs AS (
      SELECT 
        ID, 
        asset_ID,
				RANK() OVER (PARTITION BY asset_ID ORDER BY Date) as rank,
			  SUM(CASE WHEN type = 'Buy' THEN amount ELSE amount * -1 END) OVER (PARTITION BY asset_ID ORDER BY date) AS shares_cumulated,
				((CASE WHEN type = 'Sell' THEN 1 ELSE -1 END) * (amount*price_per_share))-fee-IFNULL(solidarity_surcharge,0) as in_out
		  FROM transactions
		)
	  SELECT transactions.*,
		  pre_calcs.rank,
		  ROUND(pre_calcs.shares_cumulated, 10) as shares_cumulated,
			pre_calcs.in_out
	  FROM transactions
			LEFT JOIN pre_calcs ON transactions.ID = pre_calcs.ID
		  LEFT JOIN pre_calcs AS previous ON pre_calcs.asset_ID = previous.asset_ID AND previous.rank = pre_calcs.rank-1
`

export default sql