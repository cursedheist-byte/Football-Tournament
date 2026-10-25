// Server-side validation. Every admin write goes through here; nothing from the client is trusted.
const Fmt = require('../shared/format');

const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim();
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function str(errors, key, v, { min = 1, max = 100, label }) {
  const s = clean(v);
  if (s.length < min) errors[key] = `${label} is required` + (min > 1 ? ` (at least ${min} characters)` : '');
  else if (s.length > max) errors[key] = `${label} must be at most ${max} characters`;
  return s;
}
function int(errors, key, v, { min, max, label }) {
  const n = typeof v === 'number' ? v : /^\s*\d+\s*$/.test(String(v)) ? parseInt(v, 10) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) { errors[key] = `${label} must be a whole number between ${min} and ${max}`; return null; }
  return n;
}

function validateSettings(input) {
  const e = {};
  if (!isObj(input)) return { ok: false, errors: { _: 'Invalid request body' } };
  const out = {};
  out.tournamentName = str(e, 'tournamentName', input.tournamentName, { min: 3, max: 80, label: 'Tournament name' });
  out.prizePool = str(e, 'prizePool', input.prizePool, { min: 1, max: 40, label: 'Prize pool' });

  out.contactNumber = str(e, 'contactNumber', input.contactNumber, { min: 1, max: 24, label: 'Contact number' });
  if (!e.contactNumber && !Fmt.isPlaceholder(out.contactNumber) && !Fmt.isRealPhone(out.contactNumber))
    e.contactNumber = 'Enter a valid phone number (7–15 digits, optional +, spaces or dashes) or keep the XXXXXXXXXX placeholder';

  out.matchDate = clean(input.matchDate);
  if (!Fmt.parseISO(out.matchDate)) e.matchDate = 'Enter a valid date';

  out.venue = str(e, 'venue', input.venue, { min: 2, max: 80, label: 'Venue name' });
  out.locality = str(e, 'locality', input.locality, { min: 2, max: 80, label: 'Locality / city' });
  out.region = str(e, 'region', input.region, { min: 2, max: 80, label: 'State / country' });

  out.entryFee = int(e, 'entryFee', input.entryFee, { min: 0, max: 1000000, label: 'Entry fee' });
  out.ageMin = int(e, 'ageMin', input.ageMin, { min: 3, max: 99, label: 'Minimum age' });
  out.ageMax = int(e, 'ageMax', input.ageMax, { min: 3, max: 99, label: 'Maximum age' });
  if (out.ageMin != null && out.ageMax != null && out.ageMin > out.ageMax) e.ageMax = 'Maximum age must be at least the minimum age';
  out.playersPerSide = int(e, 'playersPerSide', input.playersPerSide, { min: 2, max: 11, label: 'Players per side' });

  out.mapUrl = clean(input.mapUrl);
  if (out.mapUrl) {
    let u = null;
    try { u = new URL(out.mapUrl); } catch (_) {}
    if (!u || u.protocol !== 'https:' || out.mapUrl.length > 500) e.mapUrl = 'Enter a full https:// link (max 500 characters) or leave empty';
  }
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: out };
}

function validateFaqs(input) {
  const list = isObj(input) ? input.faqs : input;
  if (!Array.isArray(list)) return { ok: false, errors: { _: 'Expected a list of FAQs' } };
  if (list.length > 40) return { ok: false, errors: { _: 'At most 40 FAQs are allowed' } };
  const e = {}, out = [];
  list.forEach((f, i) => {
    if (!isObj(f)) { e[`faq.${i}`] = 'Invalid FAQ'; return; }
    const q = clean(f.question), a = String(f.answer ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (q.length < 3 || q.length > 200) e[`faq.${i}.question`] = 'Question must be 3–200 characters';
    if (a.length < 1 || a.length > 2000) e[`faq.${i}.answer`] = 'Answer must be 1–2000 characters';
    out.push({ id: 'f' + (i + 1), question: q, answer: a });
  });
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: out };
}

function validateAnnouncements(input) {
  const list = isObj(input) ? input.announcements : input;
  if (!Array.isArray(list)) return { ok: false, errors: { _: 'Expected a list of announcements' } };
  if (list.length > 40) return { ok: false, errors: { _: 'At most 40 announcements are allowed' } };
  const e = {}, out = [];
  list.forEach((a, i) => {
    if (!isObj(a)) { e[`ann.${i}`] = 'Invalid announcement'; return; }
    const title = clean(a.title), body = String(a.body ?? '').replace(/\r/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    const date = clean(a.date);
    if (title.length < 2 || title.length > 120) e[`ann.${i}.title`] = 'Title must be 2–120 characters';
    if (body.length > 1000) e[`ann.${i}.body`] = 'Text must be at most 1000 characters';
    if (date && !Fmt.parseISO(date)) e[`ann.${i}.date`] = 'Enter a valid date or leave empty';
    out.push({ id: 'a' + (i + 1), title, body, date, published: a.published === true });
  });
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: out };
}

function validateTeams(input) {
  const list = isObj(input) ? input.teams : input;
  if (!Array.isArray(list)) return { ok: false, errors: { _: 'Expected a list of teams' } };
  if (list.length > 64) return { ok: false, errors: { _: 'At most 64 teams are allowed' } };
  const e = {}, out = [], seen = new Set();
  list.forEach((t, i) => {
    if (!isObj(t)) { e[`team.${i}`] = 'Invalid team'; return; }
    const name = clean(t.name), from = clean(t.from);
    if (name.length < 2 || name.length > 60) e[`team.${i}.name`] = 'Team name must be 2–60 characters';
    else if (seen.has(name.toLowerCase())) e[`team.${i}.name`] = 'Duplicate team name';
    seen.add(name.toLowerCase());
    if (from.length > 60) e[`team.${i}.from`] = 'Must be at most 60 characters';
    out.push({ id: 't' + (i + 1), name, from });
  });
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, value: out };
}

module.exports = { validateSettings, validateFaqs, validateAnnouncements, validateTeams };
