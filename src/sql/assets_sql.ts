const sql = `
CREATE TABLE IF NOT EXISTS assets (
  "ID" INTEGER,
  "name" TEXT NOT NULL,
  "symbol" TEXT NOT NULL,
  "isin" TEXT NOT NULL,
  "kgv",
  "exDividendDate" TEXT,
  "is_watched" INTEGER DEFAULT 1,
  "type" TEXT DEFAULT 'Stock',
  "reserved_amount" REAL DEFAULT 0,
  "reserved_since" TEXT,
  "property_location" TEXT,
  "property_market_value" REAL,
  "property_ownership_share" REAL DEFAULT 100,
  "property_mortgage_balance" REAL DEFAULT 0,
  "property_purchase_date" TEXT,
  "property_purchase_price" REAL,
  "property_monthly_rent" REAL DEFAULT 0,
  "property_monthly_costs" REAL DEFAULT 0,
  CONSTRAINT assets_pk PRIMARY KEY("ID" AUTOINCREMENT)
);

CREATE UNIQUE INDEX asset_name_unique_index ON assets(name);
CREATE UNIQUE INDEX asset_symbol_unique_index ON assets(symbol);
CREATE UNIQUE INDEX asset_isin_unique_index ON assets(isin);
`

export default sql
