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

export default sql