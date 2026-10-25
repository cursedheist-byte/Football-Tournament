// Tiny async key/value store with three interchangeable backends:
//   1. PostgreSQL  – when DATABASE_URL is set (use this on hosts with an ephemeral filesystem)
//   2. SQLite      – node:sqlite file in DATA_DIR (needs a persistent disk/volume, or a VPS)
//   3. JSON file   – automatic fallback if node:sqlite is unavailable
// Content is stored as JSON under the keys: settings, faqs, announcements, session_secret.
const fs = require('fs');
const path = require('path');

async function createStore({ dataDir, databaseUrl }) {
  if (databaseUrl) return pgStore(databaseUrl);
  fs.mkdirSync(dataDir, { recursive: true });
  try {
    return sqliteStore(path.join(dataDir, 'tournament.sqlite'));
  } catch (err) {
    console.warn('[store] node:sqlite unavailable (' + err.message + ') – falling back to JSON file store');
    return jsonStore(path.join(dataDir, 'tournament.json'));
  }
}

function sqliteStore(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  const sel = db.prepare('SELECT value FROM kv WHERE key = ?');
  const up = db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  return {
    kind: 'sqlite:' + file,
    async get(key) { const r = sel.get(key); return r ? JSON.parse(r.value) : null; },
    async set(key, val) { up.run(key, JSON.stringify(val)); },
    async close() { db.close(); },
  };
}

function jsonStore(file) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  return {
    kind: 'json:' + file,
    async get(key) { return key in data ? data[key] : null; },
    async set(key, val) {
      data[key] = val;
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file); // atomic replace
    },
    async close() {},
  };
}

// NOTE: written against the documented `pg` API but not exercised in the build sandbox (no network/DB there).
async function pgStore(url) {
  let Pool;
  try { ({ Pool } = require('pg')); } catch (_) { throw new Error('DATABASE_URL is set but the "pg" package is not installed. Run: npm install'); }
  const local = /@(localhost|127\.0\.0\.1)/.test(url) || process.env.PGSSL === 'disable';
  const pool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
  await pool.query('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value JSONB NOT NULL)');
  return {
    kind: 'postgres',
    async get(key) { const r = await pool.query('SELECT value FROM kv WHERE key = $1', [key]); return r.rows[0] ? r.rows[0].value : null; },
    async set(key, val) {
      await pool.query('INSERT INTO kv (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, JSON.stringify(val)]);
    },
    async close() { await pool.end(); },
  };
}

module.exports = { createStore };
