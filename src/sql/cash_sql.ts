const sql = `
CREATE TABLE IF NOT EXISTS cash (
  ID INTEGER PRIMARY KEY,
  date DATE,
  type VARCHAR NOT NULL,
  amount NUMERIC(5,18),
  fee NUMERIC(5,18),
  comment TEXT
);
`

// Only reclassify interest entries explicitly marked by the broker importer.
export const migrateCashInterestSql = `UPDATE cash SET type = 'Interest'
WHERE type = 'Deposit' AND comment = 'Trade Republic: Zinsen'`;

export default sql
