const sql = `
CREATE TABLE IF NOT EXISTS assets (
  "ID" INTEGER,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "isin" TEXT NOT NULL,
  "kgv",
  "exDividendDate" TEXT,
  CONSTRAINT assets_pk PRIMARY KEY("ID" AUTOINCREMENT)
);

CREATE UNIQUE INDEX asset_name_unique_index ON assets(name);
CREATE UNIQUE INDEX asset_symbol_unique_index ON assets(symbol);
CREATE UNIQUE INDEX asset_isin_unique_index ON assets(isin);
`

export default sql