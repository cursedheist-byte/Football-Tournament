// Dev Homes Football Tournament – zero-dependency Node server (static files + SSR page + JSON API).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { createStore } = require('./lib/store');
const { makeContent } = require('./lib/content');
const { makeAuth } = require('./lib/auth');
const { makeRenderer } = require('./lib/render');
const { validateSettings, validateFaqs, validateAnnouncements, validateTeams } = require('./lib/validate');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = parseInt(process.env.PORT, 10) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' https://fonts.googleapis.com", "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:", "connect-src 'self'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'none'", "object-src 'none'",
].join('; ');

function baseHeaders(req, extra) {
  const h = {
    'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' || req.socket.encrypted)
    h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return Object.assign(h, extra);
}
function send(req, res, status, body, headers) {
  res.writeHead(status, baseHeaders(req, headers));
  res.end(req.method === 'HEAD' ? undefined : body);
}
const sendJson = (req, res, status, obj, extra) => send(req, res, status, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra));

function readJson(req, limit = 100 * 1024) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] || ''))
    return Promise.reject(Object.assign(new Error('Content-Type must be application/json'), { status: 415 }));
  // Vercel's Node.js runtime parses request bodies before calling the function.
  if (req.body !== undefined && req.body !== null) {
    const body = req.body;
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    if (raw.length > limit) return Promise.reject(Object.assign(new Error('Request too large'), { status: 413 }));
    try { return Promise.resolve(Buffer.isBuffer(body) || typeof body === 'string' ? JSON.parse(raw.toString('utf8') || 'null') : body); }
    catch (_) { return Promise.reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
  }
  return new Promise((resolve, reject) => {
    let size = 0, tooBig = false; const chunks = [];
    req.on('data', (c) => { if (tooBig) return; size += c.length; if (size > limit) { tooBig = true; chunks.length = 0; reject(Object.assign(new Error('Request too large'), { status: 413 })); } else chunks.push(c); });
    req.on('end', () => { if (tooBig) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch (_) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch (_) { return send(req, res, 400, 'Bad request'); }
  if (rel.includes('\0')) return send(req, res, 400, 'Bad request');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return send(req, res, 403, 'Forbidden');
  serveFile(req, res, file, rel);
}

function serveFile(req, res, file, rel) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(req, res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    const ext = path.extname(file).toLowerCase();
    const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    const immutable = rel.startsWith('/frames/');
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag, 'Last-Modified': st.mtime.toUTCString(),
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' };
    if (req.headers['if-none-match'] === etag) return send(req, res, 304, '', headers);
    res.writeHead(200, baseHeaders(req, Object.assign(headers, { 'Content-Length': st.size })));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

async function createHandler() {
  const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
  const store = await createStore({ dataDir, databaseUrl: process.env.DATABASE_URL });
  const content = makeContent(store);
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (adminPassword && IS_PROD && adminPassword.length < 10) console.warn('[auth] ADMIN_PASSWORD is shorter than 10 characters – please use a stronger one.');
  const auth = makeAuth({ store, adminPassword, trustProxy: process.env.TRUST_PROXY === '1' || process.env.VERCEL === '1' });

  let frames = 192;
  try { frames = fs.readdirSync(path.join(PUBLIC, 'frames/d')).filter((f) => f.endsWith('.webp')).length || frames; } catch (_) {}
  const assetFiles = [path.join(PUBLIC, 'css/site.css'), path.join(PUBLIC, 'js/site.js'), path.join(PUBLIC, 'js/ball.js'), path.join(ROOT, 'shared/format.js')];
  const assetVersion = String(Math.floor(Math.max(...assetFiles.map((f) => { try { return fs.statSync(f).mtimeMs; } catch (_) { return 0; } })) / 1000));
  const renderer = makeRenderer({ publicDir: PUBLIC, viewsDir: path.join(ROOT, 'views'), frames, assetVersion });

  const handler = async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const p = url.pathname;
      const m = req.method;

      // ---------- public ----------
      if ((m === 'GET' || m === 'HEAD') && p === '/') {
        return send(req, res, 200, renderer.render(await content.all()), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      }
      if ((m === 'GET' || m === 'HEAD') && p === '/api/content') {
        const c = await content.all();
        return sendJson(req, res, 200, { settings: c.settings, faqs: c.faqs, teams: c.teams, announcements: c.announcements.filter((a) => a.published) });
      }
      if ((m === 'GET' || m === 'HEAD') && p === '/healthz') return sendJson(req, res, 200, { ok: true });
      if ((m === 'GET' || m === 'HEAD') && p === '/js/format.js') return serveFile(req, res, path.join(ROOT, 'shared', 'format.js'), p); // same file the server uses

      // ---------- admin API ----------
      if (p.startsWith('/api/admin/')) {
        const route = p.slice('/api/admin/'.length);
        if (m === 'GET' && route === 'session') return sendJson(req, res, 200, { configured: auth.configured(), authenticated: await auth.isAuthed(req) });

        if (m === 'POST' && route === 'login') {
          if (!auth.csrfOk(req)) return sendJson(req, res, 403, { error: 'Forbidden' });
          if (!auth.configured()) return sendJson(req, res, 503, { error: 'Admin login is disabled: the ADMIN_PASSWORD environment variable is not set on the server.' });
          const wait = auth.retryAfter(req);
          if (wait) return sendJson(req, res, 429, { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` }, { 'Retry-After': String(wait) });
          const body = await readJson(req, 4096);
          const cookie = await auth.login(req, body && body.password);
          if (!cookie) { await new Promise((r) => setTimeout(r, 600)); return sendJson(req, res, 401, { error: 'Incorrect password' }); }
          return sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': cookie });
        }
        if (m === 'POST' && route === 'logout') {
          if (!auth.csrfOk(req)) return sendJson(req, res, 403, { error: 'Forbidden' });
          return sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': auth.logoutCookie(req) });
        }

        // everything below requires a valid session (enforced on the server)
        if (!(await auth.isAuthed(req))) return sendJson(req, res, 401, { error: 'Not signed in' });

        if (m === 'GET' && route === 'content') {
          const c = await content.all();
          return sendJson(req, res, 200, { ...c, defaults: content.defaults });
        }
        const writers = { settings: [validateSettings, content.saveSettings], faqs: [validateFaqs, content.saveFaqs], announcements: [validateAnnouncements, content.saveAnnouncements], teams: [validateTeams, content.saveTeams] };
        if (m === 'PUT' && writers[route]) {
          if (!auth.csrfOk(req)) return sendJson(req, res, 403, { error: 'Forbidden' });
          const [validate, save] = writers[route];
          const r = validate(await readJson(req));
          if (!r.ok) return sendJson(req, res, 422, { error: 'Please fix the highlighted fields', errors: r.errors });
          await save(r.value);
          return sendJson(req, res, 200, { ok: true, value: r.value });
        }
        return sendJson(req, res, 404, { error: 'Not found' });
      }
      if (p.startsWith('/api/')) return sendJson(req, res, 404, { error: 'Not found' });

      // ---------- admin UI ----------
      if ((m === 'GET' || m === 'HEAD') && (p === '/admin' || p === '/admin/')) return serveStatic(req, res, '/admin/index.html');

      // ---------- static ----------
      if (m === 'GET' || m === 'HEAD') {
        return serveStatic(req, res, p);
      }
      return send(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    } catch (err) {
      if (err && err.status) return sendJson(req, res, err.status, { error: err.message });
      console.error('[error]', err);
      if (!res.headersSent) sendJson(req, res, 500, { error: 'Server error' });
    }
  };

  return { handler, store, adminPassword };
}

async function main() {
  const app = await createHandler();
  const server = http.createServer(app.handler);
  server.listen(PORT, () => {
    console.log(`Dev Homes tournament site running on http://localhost:${PORT}`);
    console.log(`  storage : ${app.store.kind}`);
    console.log(`  admin   : ${app.adminPassword ? 'enabled at /admin' : 'DISABLED (set ADMIN_PASSWORD to enable)'}`);
  });
  const stop = () => server.close(() => app.store.close().finally(() => process.exit(0)));
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { createHandler };
