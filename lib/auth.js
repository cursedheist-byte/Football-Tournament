// Authentication: single organizer password (from the ADMIN_PASSWORD environment variable, never in code/Git),
// stateless HMAC-signed session cookie (HttpOnly, SameSite=Strict), login rate limiting, CSRF checks.
const crypto = require('crypto');

const COOKIE = 'dh_admin';
const SESSION_SECONDS = 12 * 3600;
const MAX_FAILS = 8, WINDOW_MS = 15 * 60 * 1000;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const b64 = (buf) => Buffer.from(buf).toString('base64url');

function makeAuth({ store, adminPassword, trustProxy }) {
  const fails = new Map(); // ip -> { n, first }
  let keyPromise;

  // Signing key = HMAC(server secret, sha256(password)) – changing ADMIN_PASSWORD logs everyone out.
  function key() {
    if (!keyPromise) keyPromise = (async () => {
      let secret = process.env.SESSION_SECRET;
      if (!secret) {
        secret = await store.get('session_secret');
        if (!secret) { secret = crypto.randomBytes(32).toString('hex'); await store.set('session_secret', secret); }
      }
      return crypto.createHmac('sha256', secret).update(sha(adminPassword || '')).digest();
    })();
    return keyPromise;
  }

  const sign = async (payload) => {
    const body = b64(JSON.stringify(payload));
    return body + '.' + b64(crypto.createHmac('sha256', await key()).update(body).digest());
  };
  async function verify(token) {
    if (!token || token.length > 400) return null;
    const [body, mac] = token.split('.');
    if (!body || !mac) return null;
    const good = b64(crypto.createHmac('sha256', await key()).update(body).digest());
    if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString());
      return p && p.exp > Date.now() / 1000 ? p : null;
    } catch (_) { return null; }
  }

  function parseCookies(req) {
    const out = {};
    String(req.headers.cookie || '').split(';').forEach((c) => {
      const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = c.slice(i + 1).trim();
    });
    return out;
  }

  function clientIp(req) {
    if (trustProxy) {
      const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
      if (xff.length) return xff[xff.length - 1]; // the address the nearest trusted proxy saw
    }
    return req.socket.remoteAddress || 'unknown';
  }

  const isSecure = (req) => req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  const cookieStr = (req, value, maxAge) =>
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` + (isSecure(req) ? '; Secure' : '');

  return {
    configured: () => !!adminPassword,
    async isAuthed(req) { return !!(adminPassword && (await verify(parseCookies(req)[COOKIE]))); },

    retryAfter(req) {
      const r = fails.get(clientIp(req));
      if (!r) return 0;
      if (Date.now() - r.first > WINDOW_MS) { fails.delete(clientIp(req)); return 0; }
      return r.n >= MAX_FAILS ? Math.ceil((WINDOW_MS - (Date.now() - r.first)) / 1000) : 0;
    },
    async login(req, password) {
      const ip = clientIp(req);
      const ok = typeof password === 'string' && password.length <= 200 && safeEqual(password, adminPassword);
      if (!ok) {
        const r = fails.get(ip);
        if (!r || Date.now() - r.first > WINDOW_MS) fails.set(ip, { n: 1, first: Date.now() }); else r.n++;
        return null;
      }
      fails.delete(ip);
      const token = await sign({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, n: crypto.randomBytes(8).toString('hex') });
      return cookieStr(req, token, SESSION_SECONDS);
    },
    logoutCookie: (req) => cookieStr(req, '', 0),

    // CSRF defence in depth (on top of SameSite=Strict): custom header + same-origin Origin header.
    csrfOk(req) {
      if (req.headers['x-requested-with'] !== 'dh-admin') return false;
      const origin = req.headers.origin;
      if (origin) { try { if (new URL(origin).host !== req.headers.host) return false; } catch (_) { return false; } }
      return true;
    },
  };
}
module.exports = { makeAuth };
