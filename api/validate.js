import { db, initDB } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await initDB();

  const { ref, password, buyer_name, buyer_wa } = req.body;
  if (!ref || !password) return res.status(400).json({ success: false, message: 'Ref dan password wajib diisi' });

  // Password global — tidak terikat pada license tertentu, bisa dipakai berulang
  const result = await db.execute({
    sql: `SELECT * FROM licenses WHERE ref_code = ? AND password = ? LIMIT 1`,
    args: [ref, password]
  });

  if (result.rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Password salah' });
  }

  const license = result.rows[0];

  // Catat pembeli (tidak mengubah status license)
  await db.execute({
    sql: `UPDATE licenses SET buyer_name = ?, buyer_wa = ? WHERE id = ?`,
    args: [buyer_name || '', buyer_wa || '', license.id]
  }).catch(() => {});

  const reseller = await db.execute({
    sql: `SELECT komisi_persen FROM resellers WHERE ref_code = ?`,
    args: [ref]
  });

  return res.json({
    success: true,
    license: license.license_code,
    message: 'Premium terbuka! Selamat lanjut assessment 21-50.',
    komisi: reseller.rows[0]?.komisi_persen || 30
  });
}