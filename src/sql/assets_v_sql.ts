const sql = `
CREATE VIEW IF NOT EXISTS assets_v AS
	WITH current_shares AS (
		SELECT
			assets.ID,
			ROUND(SUM(CASE WHEN type = 'Buy' THEN amount ELSE -amount END),10) AS current_shares
	    FROM assets
	  		LEFT JOIN transactions_v as transactions ON transactions.asset_ID = assets.ID
		GROUP BY assets.ID, kgv
	)
  	SELECT
	    assets.ID as ID,
	    assets.name as name,
	    assets.symbol as symbol,
	    assets.isin as isin,
	    kgv,
			assets.is_watched,
	    assets.exDividendDate,
	    AVG(transactions.price_per_share) AS avg_price_paid,
	    SUM(CASE WHEN type = 'Buy' THEN amount * price_per_share ELSE 0 END) AS invested,
	    SUM(CASE WHEN type = 'Sell' THEN amount * price_per_share ELSE 0 END) AS profit,
	    SUM(fee) AS fees,
	    current_shares,
	    SUM(CASE WHEN exDividendDate IS NULL OR (current_shares.current_shares > 0 AND transactions.date < exDividendDate) THEN
	    		CASE WHEN type = 'Buy' THEN amount ELSE amount * -1 END
	    	ELSE 0 END) AS current_shares_before_ex_date,
	    SUM(in_out) AS current_sum_in_out,
	    (SELECT SUM(income) FROM dividends WHERE dividends.asset_ID = assets.ID) AS dividends_earned
	FROM assets
	  LEFT JOIN transactions_v as transactions ON transactions.asset_ID = assets.ID
	  LEFT JOIN current_shares ON current_shares.ID = assets.ID
	GROUP BY assets.ID, kgv;
`

export default sql