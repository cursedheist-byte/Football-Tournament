// Vercel catch-all entry. The project uses a Node HTTP handler locally and
// reuses the same route handler inside a serverless function in production.
const { createHandler } = require('../server');

let handlerPromise;

function requestedPath(req) {
  let value = req.query && req.query.path;
  if (Array.isArray(value)) value = value.join('/');
  if (typeof value !== 'string' || !value) return '/';
  try { value = decodeURIComponent(value); } catch (_) { return '/'; }
  return value.startsWith('/') ? value : '/' + value;
}

module.exports = async function vercelHandler(req, res) {
  if (!process.env.DATABASE_URL) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: 'Set DATABASE_URL to a persistent PostgreSQL database for this Vercel deployment.' }));
    return;
  }

  try {
    if (!handlerPromise) handlerPromise = createHandler().then((app) => app.handler);
    req.url = requestedPath(req);
    const handler = await handlerPromise;
    return handler(req, res);
  } catch (error) {
    console.error('[vercel handler]', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'Server error' }));
    }
  }
};
