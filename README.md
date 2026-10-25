# Dev Homes Football Tournament 2026

Public tournament site + organizer admin. Plain Node.js (no build step, no runtime dependencies).

## Run locally
```
ADMIN_PASSWORD='something-long' node server.js     # http://localhost:3000   admin: /admin
```
Needs Node 22.13+ (uses built-in SQLite). Data is stored in `./data/` (git-ignored).

## What the organizer can edit at /admin (no code, no redeploy)
- **Tournament**: name, prize pool (XXXX until decided), contact number (XXXXXXXXXX until known), date, venue, entry fee, age range, players per side, optional directions link
- **Teams**: add / edit / delete / reorder → shown in "Currently Participating" with an automatic count
- **FAQs**: add / edit / delete / reorder (tokens like `{{fee}}`, `{{date}}` keep answers in sync with settings)
- **Announcements**: publish/unpublish; the section is hidden when none are published

The contact number only becomes a tap-to-call link once a valid real number is saved.

## Deploy
Set `ADMIN_PASSWORD` (required) and ONE persistence option:
1. **Host with a persistent disk / VPS** – set `DATA_DIR` to the mounted disk path (SQLite file lives there).
2. **Host with ephemeral filesystem (Render free, Heroku, etc.)** – set `DATABASE_URL` to a PostgreSQL URL and run `npm install` (installs `pg`). Tables are created automatically.
Start command: `node server.js` · Health check: `/healthz` · Set `TRUST_PROXY=1` behind a proxy.

### Vercel
Vercel routes dynamic requests through `api/index.js`; public assets remain static. Configure `DATABASE_URL` with a persistent PostgreSQL connection string and set a strong `ADMIN_PASSWORD` in Vercel Project Settings before deploying. Vercel's function filesystem is ephemeral, so the SQLite/JSON fallback is intentionally not used there. Never commit production environment values.

## Security notes
Password only in env var · HttpOnly+SameSite=Strict signed session (12h) · CSRF header + Origin check · server-side validation for every write · login rate limit (8 tries / 15 min) · strict CSP · all output HTML-escaped. Changing `ADMIN_PASSWORD` logs everyone out.

## Tests
`./scripts/dev-restart.sh && BASE=http://localhost:3111 PW=test-pass-12345 node scripts/test-api.mjs`

## Scroll-controlled football animation
The public page uses 192 optimized WebP frames in `public/frames/d` (640px desktop) and `public/frames/m` (400px mobile), regenerated from `_next-phase-scroll-animation/frames/Football_rotating_in_mid-air_20261024234857_frames.zip` with `_next-phase-scroll-animation/make-frames.py`. A fixed canvas is scrubbed from native scroll position; there is no video playback, external animation library, or build step. The pinned three-stage story sequence follows the hero. Desktop/mobile frame selection, Save-Data frame reduction, progressive loading, a bounded decoded-frame cache, reduced-motion fallback, and the existing CSP are supported. Frames are served with immutable caching; the server passes the frame count and asset version into a CSP-safe JSON data block. Page reveals remain visible when JavaScript is unavailable.

## NYXO creator page
The footer credit links to /nyxo.html, a standalone NYXO portfolio landing page with its own visual theme and animations. It is a static page outside the tournament sections and admin editor. The contact CTA calls +91 8859230314 (	el:+918859230314).
