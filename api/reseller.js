import { db, initDB } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await initDB();

  const { ref } = req.query;
  if (!ref) return res.status(400).json({ error: 'Ref required' });

  const result = await db.execute({
    sql: `SELECT nama, wa, custom_password FROM resellers WHERE ref_code = ? AND status = 'aktif'`,
    args: [ref]
  });

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Reseller tidak ditemukan' });
  }

  res.json({ success: true, reseller: result.rows[0] });
}