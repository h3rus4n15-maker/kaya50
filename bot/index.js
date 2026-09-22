import { Telegraf } from 'telegraf';
import { db, initDB } from '../lib/db.js';
import crypto from 'crypto';

const DOMAIN = process.env.DOMAIN || 'https://kaya50.vercel.app';
const GLOBAL_PASSWORD = process.env.GLOBAL_PASSWORD || 'JAYA123';
const ADMIN_TG_ID = process.env.ADMIN_TG_ID ? Number(process.env.ADMIN_TG_ID) : null;
const bot = new Telegraf(process.env.BOT_TOKEN);

console.log('Env check:', {
  BOT_TOKEN: process.env.BOT_TOKEN ? 'SET' : 'MISSING',
  DOMAIN: process.env.DOMAIN,
  GLOBAL_PASSWORD: process.env.GLOBAL_PASSWORD ? 'SET' : 'DEFAULT',
  ADMIN_TG_ID: ADMIN_TG_ID || 'NOT SET',
  TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL ? 'SET' : 'MISSING',
  TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN ? 'SET' : 'MISSING',
});

process.on('unhandledRejection', (r) => console.error('Unhandled rejection:', r));
process.on('uncaughtException', (e) => { console.error('Uncaught exception:', e.message); process.exit(1); });

const userState = new Map();

function genRefCode() {
  return 'R' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function genLicenseCode() {
  return 'LIC-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function isAdmin(ctx) {
  return ADMIN_TG_ID && ctx.from.id === ADMIN_TG_ID;
}

function onlyAdmin(ctx, next) {
  if (!isAdmin(ctx)) return ctx.reply('❌ Bot ini hanya untuk admin.');
  next();
}

// /start — admin dapat link + password global
bot.start(async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply('❌ Bot ini hanya untuk admin. Hubungi admin untuk dapat akses.');
  }

  // Cek apakah admin sudah punya reseller
  const existing = await db.execute({ sql: 'SELECT * FROM resellers WHERE telegram_id = ?', args: [ctx.from.id] });

  if (existing.rows.length > 0) {
    const r = existing.rows[0];
    return ctx.reply(
      `✅ Kamu sudah terdaftar sebagai reseller!\n\n` +
      `🔗 Link: ${DOMAIN}/?ref=${r.ref_code}\n` +
      `🔑 Password: ${r.custom_password}\n` +
      `💰 Komisi: ${r.komisi_persen}%\n\n` +
      `Gunakan /daftar untuk buat reseller baru.\n` +
      `Gunakan /laporan untuk cek penghasilan.`
    );
  }

  const ref = genRefCode();
  await db.execute({
    sql: `INSERT INTO resellers (telegram_id, username, nama, wa, ref_code, custom_password) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [ctx.from.id, ctx.from.username || '', 'Admin', '08123456789', ref, GLOBAL_PASSWORD]
  });

  for (let i = 0; i < 10; i++) {
    await db.execute({
      sql: `INSERT INTO licenses (license_code, ref_code, password) VALUES (?, ?, ?)`,
      args: [genLicenseCode(), ref, GLOBAL_PASSWORD]
    });
  }

  return ctx.reply(
    `✅ Link siap!\n\n` +
    `🔗 Link: ${DOMAIN}/?ref=${ref}\n` +
    `🔑 Password: ${GLOBAL_PASSWORD}\n` +
    `💰 Komisi: 30%\n\n` +
    `Gunakan /daftar untuk buat reseller baru.\n` +
    `Gunakan /laporan untuk cek penghasilan.`
  );
});

// /daftar — admin daftar reseller baru (nama, WA, password)
bot.command('daftar', onlyAdmin, (ctx) => {
  userState.set(ctx.from.id, { step: 'nama' });
  return ctx.reply('1️⃣ Nama lengkap reseller:');
});

bot.on('text', onlyAdmin, async (ctx) => {
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

      try {
        const ref = genRefCode();
        // telegram_id NULL untuk reseller yang dibuat via /daftar (admin bisa buat banyak)
        await db.execute({
          sql: `INSERT INTO resellers (telegram_id, username, nama, wa, ref_code, custom_password) VALUES (NULL, ?, ?, ?, ?, ?)`,
          args: [ctx.from.username || '', state.nama, state.wa, ref, state.password]
        });

        for (let i = 0; i < 10; i++) {
          await db.execute({
            sql: `INSERT INTO licenses (license_code, ref_code, password) VALUES (?, ?, ?)`,
            args: [genLicenseCode(), ref, state.password]
          });
        }

        userState.delete(tgId);
        return ctx.reply(
          `✅ Reseller terdaftar!\n\n` +
          `👤 Nama: ${state.nama}\n` +
          `📱 WA: ${state.wa}\n` +
          `🔗 Link: ${DOMAIN}/?ref=${ref}\n` +
          `🔑 Password: ${state.password}\n` +
          `💰 Komisi: 30% (Rp3.000/jual)\n\n` +
          `📦 10 license sudah siap dijual.\n` +
          `Gunakan /laporan untuk cek penghasilan.`
        );
      } catch (e) {
        console.error('Daftar error:', e.message);
        userState.delete(tgId);
        return ctx.reply('❌ Gagal daftar: ' + e.message);
      }
  }
});

// /laporan — admin cek penghasilan
bot.command('laporan', onlyAdmin, async (ctx) => {
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

// /generate — admin generate license
bot.command('generate', onlyAdmin, async (ctx) => {
  const args = ctx.message.text.split(' ').slice(1);
  const ref = args[0];
  const count = parseInt(args[1]) || 10;

  if (!ref) return ctx.reply('❌ Format: /generate <ref> <count>');

  const reseller = await db.execute({ sql: 'SELECT custom_password FROM resellers WHERE ref_code = ?', args: [ref] });
  if (reseller.rows.length === 0) return ctx.reply('❌ Reseller tidak ditemukan.');

  const pass = reseller.rows[0].custom_password;
  for (let i = 0; i < count; i++) {
    await db.execute({ sql: 'INSERT INTO licenses (license_code, ref_code, password) VALUES (?, ?, ?)', args: [genLicenseCode(), ref, pass] });
  }
  ctx.reply(`✅ Generated ${count} license untuk ${ref}`);
});

await initDB().catch(e => { console.error('DB init failed:', e.message); });
bot.launch().catch(e => { console.error('Bot launch failed:', e.message); });
console.log('🤖 Bot running...');