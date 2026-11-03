// exit 0 — bazada foydalanuvchi yo'q (seed kerak), 1 — bor
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query('SELECT count(*)::int AS n FROM users');
await client.end();
process.exit(rows[0].n === 0 ? 0 : 1);
