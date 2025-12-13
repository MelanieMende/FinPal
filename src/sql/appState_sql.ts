const sql = `
CREATE TABLE IF NOT EXISTS app_state (
	"key" TEXT NOT NULL,
	value TEXT NOT NULL,
	CONSTRAINT app_state_pk PRIMARY KEY ("key")
);
`

export default sql