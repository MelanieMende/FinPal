const sql = `
CREATE TABLE IF NOT EXISTS transactions (
  ID INTEGER PRIMARY KEY,
  date DATE,
  type VARCHAR NOT NULL,
  asset_ID INTEGER NOT NULL,
  amount NUMERIC(5,18),
  price_per_share NUMERIC(5,18),
  fee NUMERIC(5,18),
	FOREIGN KEY("asset_ID") REFERENCES "assets"("ID")
)
`

export default sql