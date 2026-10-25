// End-to-end API checks against a running server.
// Usage: BASE=http://localhost:3111 PW=<admin password> node scripts/test-api.mjs
// WARNING: overwrites settings/teams/FAQs/announcements on the target server – run against a throwaway data dir.
const BASE = process.env.BASE || 'http://localhost:3000', PW = process.env.PW;
let pass = 0, fail = 0, cookie = '';
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const call = async (method, path, body, { auth = true, csrf = true, headers = {} } = {}) => {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (csrf) h['X-Requested-With'] = 'dh-admin';
  if (auth && cookie) h.Cookie = cookie;
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch (_) { j = t; }
  return { s: r.status, j, r };
};
const page = async () => (await fetch(BASE + '/')).text();

let r = await call('PUT', '/api/admin/settings', {}, { auth: false });          ok(r.s === 401, 'unauthenticated PUT settings -> 401');
r = await call('PUT', '/api/admin/teams', [], { auth: false });                 ok(r.s === 401, 'unauthenticated PUT teams -> 401');
r = await call('GET', '/api/admin/content', undefined, { auth: false });        ok(r.s === 401, 'unauthenticated GET admin content -> 401');
r = await call('POST', '/api/admin/login', { password: 'wrong' }, { auth: false }); ok(r.s === 401, 'wrong password -> 401');
r = await call('POST', '/api/admin/login', { password: PW }, { auth: false, csrf: false }); ok(r.s === 403, 'login without CSRF header -> 403');
r = await call('POST', '/api/admin/login', { password: PW }, { auth: false });
ok(r.s === 200, 'correct password -> 200');
const sc = r.r.headers.get('set-cookie') || ''; cookie = sc.split(';')[0];
ok(/HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc), 'session cookie is HttpOnly + SameSite=Strict');
r = await call('PUT', '/api/admin/settings', {}, { csrf: false }); ok(r.s === 403, 'authed PUT without CSRF header -> 403');
r = await call('PUT', '/api/admin/settings', {}, { headers: { Origin: 'https://evil.example' } }); ok(r.s === 403, 'cross-origin PUT -> 403');
r = await call('GET', '/api/admin/content'); ok(r.s === 200 && r.j.settings.prizePool === 'XXXX' && r.j.teams.length === 0, 'authed GET content returns defaults (prize XXXX, 0 teams)');

const base = r.j.settings;
let html = await page();
ok(html.includes('DEV HOMES FOOTBALL TOURNAMENT 2026') && html.includes('XXXXXXXXXX') && !/href="tel:/.test(html), 'public page: tournament name + placeholders, no tel: link');

r = await call('PUT', '/api/admin/settings', { ...base, prizePool: '' });          ok(r.s === 422 && r.j.errors.prizePool, 'empty prize rejected (422)');
r = await call('PUT', '/api/admin/settings', { ...base, contactNumber: 'abc' });   ok(r.s === 422 && r.j.errors.contactNumber, 'invalid phone rejected');
r = await call('PUT', '/api/admin/settings', { ...base, matchDate: '2026-02-31' });ok(r.s === 422 && r.j.errors.matchDate, 'impossible date rejected');
r = await call('PUT', '/api/admin/settings', { ...base, ageMin: 18, ageMax: 13 }); ok(r.s === 422 && r.j.errors.ageMax, 'min age > max age rejected');
r = await call('PUT', '/api/admin/settings', { ...base, mapUrl: 'javascript:alert(1)' }); ok(r.s === 422 && r.j.errors.mapUrl, 'javascript: map URL rejected');
r = await call('PUT', '/api/admin/settings', { ...base, tournamentName: 'Dev Homes Cup 2026', prizePool: '₹25,000', contactNumber: '+91 98765 43210', mapUrl: 'https://maps.google.com/?q=test' });
ok(r.s === 200, 'valid settings saved');
html = await page();
ok(html.includes('Dev Homes Cup 2026') && html.includes('₹25,000') && html.includes('href="tel:+919876543210"') && html.includes('GET DIRECTIONS'), 'public page reflects admin edits immediately (name, prize, tel link, directions)');
ok(html.includes('Prize pool: ₹25,000.') && html.includes('+91 98765 43210.'), 'FAQ tokens follow the settings');

r = await call('PUT', '/api/admin/teams', [{ name: 'Rudrapur <script>x</script> FC', from: 'Dev Homes' }, { name: 'Bindukhera United', from: '' }]);
ok(r.s === 200, 'teams saved');
html = await page();
ok(html.includes('Rudrapur &lt;script&gt;x&lt;/script&gt; FC') && !html.includes('<script>x</script>'), 'teams listed on page, HTML escaped (XSS-safe)');
ok(/<b>02<\/b><span>TEAMS REGISTERED/.test(html), 'team count = 2');
r = await call('PUT', '/api/admin/teams', [{ name: 'A' }]); ok(r.s === 422, 'too-short team name rejected');
r = await call('PUT', '/api/admin/teams', [{ name: 'Same' }, { name: 'same' }]); ok(r.s === 422, 'duplicate team names rejected');
r = await call('PUT', '/api/admin/teams', [{ name: 'Bindukhera United', from: '' }]); ok(r.s === 200, 'team deleted (list saved with 1 team)');
html = await page(); ok(!html.includes('Rudrapur &lt;script') && /<b>01<\/b><span>TEAM REGISTERED/.test(html), 'deleted team gone, count = 1');
r = await call('PUT', '/api/admin/teams', [{ name: 'Bindukhera United', from: '' }, { name: 'New Team', from: 'Colony' }]); ok(r.s === 200, 'team added');
r = await call('PUT', '/api/admin/teams', [{ name: 'Bindukhera Utd (edited)', from: '' }, { name: 'New Team', from: 'Colony' }]); html = await page(); ok(html.includes('Bindukhera Utd (edited)'), 'team edited');

r = await call('PUT', '/api/admin/faqs', [{ question: 'Is parking available?', answer: 'Ask the organizer.' }]); ok(r.s === 200, 'FAQs saved');
html = await page(); ok(html.includes('Is parking available?') && !html.includes('When will the tournament take place?'), 'FAQ edits shown');
r = await call('PUT', '/api/admin/faqs', [{ question: '', answer: 'x' }]); ok(r.s === 422, 'empty FAQ question rejected');
r = await call('PUT', '/api/admin/announcements', [{ title: 'Draft', body: 'hiddentext', date: '', published: false }, { title: 'Live news', body: 'Hello', date: '2026-10-26', published: true }]);
html = await page(); ok(r.s === 200 && html.includes('Live news') && !html.includes('hiddentext') && html.includes('26 OCT 2026'), 'only published announcements shown');

const big = await fetch(BASE + '/api/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dh-admin', Cookie: cookie }, body: JSON.stringify({ x: 'a'.repeat(200000) }) });
ok(big.status === 413, 'oversized body rejected (413)');
const pub = await (await fetch(BASE + '/api/content')).json(); ok(pub.teams.length === 2 && !JSON.stringify(pub).includes('session_secret'), 'public API has no secrets');
let t = await fetch(BASE + '/..%2f..%2fserver.js'); ok(t.status !== 200, 'path traversal blocked');
t = await fetch(BASE + '/data/tournament.sqlite'); ok(t.status === 404, 'database file not web-accessible');
t = await fetch(BASE + '/lib/auth.js'); ok(t.status === 404, 'server source not web-accessible');

await call('POST', '/api/admin/logout'); cookie = '';
r = await call('GET', '/api/admin/session'); ok(r.j.authenticated === false, 'no cookie -> not authenticated');
let last; for (let i = 0; i < 9; i++) last = await call('POST', '/api/admin/login', { password: 'bad' + i }, { auth: false });
ok(last.s === 429, 'login rate-limited after repeated failures (429)');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
