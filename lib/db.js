const rawUrl = process.env.POSTGRES_URL || process.env.TURSO_DATABASE_URL || '';
const authToken = process.env.POSTGRES_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '';

console.log('DB config:', {
  hasUrl: !!rawUrl,
  urlPrefix: rawUrl ? rawUrl.substring(0, 12) : 'EMPTY',
  hasToken: !!authToken,
});

let db;
let initDB;

if (rawUrl.startsWith('libsql://') || rawUrl.startsWith('https://') || rawUrl.startsWith('http://')) {
  const { createClient } = await import('@libsql/client');
  db = createClient({ url: rawUrl, authToken });
  initDB = async () => {
    await db.execute(`CREATE TABLE IF NOT EXISTS resellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      nama TEXT NOT NULL,
      wa TEXT NOT NULL,
      ref_code TEXT UNIQUE NOT NULL,
      custom_password TEXT NOT NULL,
      komisi_persen INTEGER DEFAULT 30,
      status TEXT DEFAULT 'aktif',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );`);
    await db.execute(`CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_code TEXT UNIQUE NOT NULL,
      ref_code TEXT NOT NULL,
      password TEXT NOT NULL,
      status TEXT DEFAULT 'unused',
      buyer_name TEXT,
      buyer_wa TEXT,
      unlocked_at DATETIME,
      komisi_amount INTEGER DEFAULT 3000,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ref_code) REFERENCES resellers(ref_code)
    );`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_licenses_ref_pass ON licenses(ref_code, password);`);
  };
} else if (rawUrl.startsWith('postgres://') || rawUrl.startsWith('postgresql://')) {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: rawUrl });
  db = {
    execute: async ({ sql, args }) => {
      const result = await pool.query(sql, args);
      return { rows: result.rows };
    }
  };
  initDB = async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS resellers (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username TEXT,
      nama TEXT NOT NULL,
      wa TEXT NOT NULL,
      ref_code TEXT UNIQUE NOT NULL,
      custom_password TEXT NOT NULL,
      komisi_persen INTEGER DEFAULT 30,
      status TEXT DEFAULT 'aktif',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );`);
    await pool.query(`CREATE TABLE IF NOT EXISTS licenses (
      id SERIAL PRIMARY KEY,
      license_code TEXT UNIQUE NOT NULL,
      ref_code TEXT NOT NULL,
      password TEXT NOT NULL,
      status TEXT DEFAULT 'unused',
      buyer_name TEXT,
      buyer_wa TEXT,
      unlocked_at TIMESTAMPTZ,
      komisi_amount INTEGER DEFAULT 3000,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      FOREIGN KEY (ref_code) REFERENCES resellers(ref_code)
    );`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_licenses_ref_pass ON licenses(ref_code, password);`);
  };
} else {
  console.error('No valid database URL configured');
  process.exit(1);
}

export { db, initDB };