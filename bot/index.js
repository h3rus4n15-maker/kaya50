import { Telegraf } from 'telegraf';
import { db, initDB } from '../lib/db.js';
import crypto from 'crypto';

const bot = new Telegraf(process.env.BOT_TOKEN);

const userState = new Map();

function genRefCode() {
  return 'R' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function genLicenseCode() {
  return 'LIC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

bot.start(async (ctx) => {
  const tgId = ctx.from.id;
  const existing = await db.execute({ sql: 'SELECT * FROM resellers WHERE telegram_id = ?', args: [tgId] });
  
  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    return ctx.reply(
      `✅ Kamu sudah terdaftar sebagai reseller!\n\n` +
      `🔗 Link: https://abi.aipronusa.com/?ref=${r.ref_code}\n` +
      `🔑 Password: ${r.custom_password}\n` +
      `💰 Komisi: ${r.komisi_persen}%\n\n` +
      `Gunakan /laporan untuk cek penghasilan.`
    );
  }

  ctx.reply('👋 Selamat datang! Daftar jadi Reseller KAYA50\n\nIsi data berikut:');
  userState.set(tgId, { step: 'nama' });
  ctx.reply('1️⃣ Nama lengkap:');
});

bot.on('text', async (ctx) => {
  const tgId = ctx.from.id;
  const state = userState.get(tgId);
  if (!state) return;

  switch (state.step) {
    case 'nama':
      state.nama = ctx.message.text;
      state.step = 'wa';
      return ctx.reply('2️⃣ Nomor WA (contoh: 08123456789):');
    
    case 'wa':
      state.wa = ctx.message.text;
      state.step = 'password';
      return ctx.reply('3️⃣ Password custom untuk pembeli (contoh: MAKMUR2025):');
    
    case 'password':
      state.password = ctx.message.text;
      
      const ref = genRefCode();
      await db.execute({
        sql: `INSERT INTO resellers (telegram_id, username, nama, wa, ref_code, custom_password) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [tgId, ctx.from.username || '', state.nama, state.wa, ref, state.password]
      });

      for (let i = 0; i < 10; i++) {
        await db.execute({
          sql: `INSERT INTO licenses (license_code, ref_code, password) VALUES (?, ?, ?)`,
          args: [genLicenseCode(), ref, state.password]
        });
      }

      userState.delete(tgId);
      return ctx.reply(
        `✅ Berhasil daftar reseller!\n\n` +
        `👤 Nama: ${state.nama}\n` +
        `📱 WA: ${state.wa}\n` +
        `🔗 Link: https://abi.aipronusa.com/?ref=${ref}\n` +
        `🔑 Password pembeli: ${state.password}\n` +
        `💰 Komisi: 30% (Rp3.000/jual)\n\n` +
        `📦 10 license sudah siap dijual.\n` +
        `Gunakan /laporan untuk cek penghasilan.`
      );
  }
});

bot.command('laporan', async (ctx) => {
  const tgId = ctx.from.id;
  const reseller = await db.execute({ sql: 'SELECT * FROM resellers WHERE telegram_id = ?', args: [tgId] });
  if (reseller.rows.length === 0) return ctx.reply('❌ Kamu belum daftar reseller.');

  const r = reseller.rows[0];
  const licenses = await db.execute({ sql: 'SELECT status, komisi_amount FROM licenses WHERE ref_code = ?', args: [r.ref_code] });
  const used = licenses.rows.filter(l => l.status === 'used');
  const total = used.reduce((s, l) => s + (l.komisi_amount || 0), 0);

  ctx.reply(
    `📊 Laporan Reseller: ${r.nama}\n` +
    `🔗 Ref: ${r.ref_code}\n` +
    `✅ Terjual: ${used.length} license\n` +
    `💰 Total Komisi: Rp${total.toLocaleString('id-ID')}\n` +
    `📦 Sisa license: ${licenses.rows.length - used.length}`
  );
});

bot.command('generate', async (ctx) => {
  if (ctx.from.id !== Number(process.env.ADMIN_TG_ID)) return ctx.reply('❌ Admin only.');
  const args = ctx.message.text.split(' ').slice(1);
  const ref = args[0];
  const count = parseInt(args[1]) || 10;
  
  const reseller = await db.execute({ sql: 'SELECT custom_password FROM resellers WHERE ref_code = ?', args: [ref] });
  if (reseller.rows.length === 0) return ctx.reply('❌ Reseller tidak ditemukan.');

  const pass = reseller.rows[0].custom_password;
  for (let i = 0; i < count; i++) {
    await db.execute({ sql: 'INSERT INTO licenses (license_code, ref_code, password) VALUES (?, ?, ?)', args: [genLicenseCode(), ref, pass] });
  }
  ctx.reply(`✅ Generated ${count} license untuk ${ref}`);
});

await initDB();
bot.launch();
console.log('🤖 Bot running...');