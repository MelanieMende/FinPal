const sql = `
CREATE TABLE IF NOT EXISTS dividends (
  ID INTEGER PRIMARY KEY,
  date DATE,
  asset_ID INTEGER NOT NULL,
  income ,
	PRIMARY KEY("ID"),
	FOREIGN KEY("asset_ID") REFERENCES "assets"("ID")
)
`

export default sql