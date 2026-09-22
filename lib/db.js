import { createClient } from '@libsql/client';

export const db = createClient({
  url: process.env.POSTGRES_URL || process.env.TURSO_DATABASE_URL,
  authToken: process.env.POSTGRES_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
});

export async function initDB() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS resellers (
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
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS licenses (
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
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_licenses_ref_pass ON licenses(ref_code, password);`);
}