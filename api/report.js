import { db, initDB } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await initDB();

  const { ref, tg_id } = req.query;
  if (!ref || !tg_id) return res.status(400).json({ error: 'Ref dan tg_id required' });

  const reseller = await db.execute({
    sql: `SELECT telegram_id, nama, komisi_persen FROM resellers WHERE ref_code = ?`,
    args: [ref]
  });

  if (reseller.rows.length === 0 || reseller.rows[0].telegram_id != tg_id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const licenses = await db.execute({
    sql: `SELECT status, komisi_amount, unlocked_at, buyer_name FROM licenses WHERE ref_code = ? ORDER BY created_at DESC`,
    args: [ref]
  });

  const used = licenses.rows.filter(r => r.status === 'used');
  const totalKomisi = used.reduce((sum, r) => sum + (r.komisi_amount || 0), 0);

  res.json({
    success: true,
    reseller: reseller.rows[0].nama,
    total_terjual: used.length,
    total_komisi: totalKomisi,
    licenses: licenses.rows
  });
}