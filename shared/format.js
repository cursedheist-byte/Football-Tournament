/* Shared formatting helpers. Loaded by the Node server (require) and by the browser (window.Fmt). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Fmt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
  const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();

  function parseISO(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y, mo, d };
  }

  function dateParts(iso) {
    const p = parseISO(iso);
    if (!p) return { day: '--', dayNum: '', month: '', mon: '', year: '', long: '' };
    const month = MONTHS[p.mo - 1];
    return {
      day: String(p.d).padStart(2, '0'), dayNum: p.d, month, mon: month.slice(0, 3), year: p.y,
      long: p.d + ' ' + title(month) + ' ' + p.y,
    };
  }

  // Indian digit grouping: 3000 -> 3,000 ; 150000 -> 1,50,000
  function inr(n) {
    const s = String(Math.max(0, Math.floor(+n || 0)));
    if (s.length <= 3) return s;
    return s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + s.slice(-3);
  }

  const isPlaceholder = (s) => /^[xX\s\-–—.]+$/.test(String(s || '').trim());
  function isRealPhone(s) {
    s = String(s || '').trim();
    if (!/^\+?[0-9][0-9\s\-()]{5,22}$/.test(s)) return false;
    const digits = s.replace(/\D/g, '').length;
    return digits >= 7 && digits <= 15;
  }
  const telHref = (s) => 'tel:' + String(s).replace(/[^\d+]/g, '');

  // whole days from "today in India" to the match date (null when date invalid)
  function daysUntil(iso, now) {
    const p = parseISO(iso);
    if (!p) return null;
    const ist = new Date((now || new Date()).getTime() + 5.5 * 3600 * 1000);
    const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d) - today) / 86400000);
  }

  // Derived display values from raw settings
  function derive(s) {
    const dp = dateParts(s.matchDate);
    const prizeSet = !isPlaceholder(s.prizePool);
    const contactReal = isRealPhone(s.contactNumber);
    return {
      date: dp,
      fee: '₹' + inr(s.entryFee),
      feeNum: inr(s.entryFee),
      age: s.ageMin + '–' + s.ageMax,
      side: s.playersPerSide + '-A-SIDE',
      prizeSet,
      contactReal,
      contactPlaceholder: isPlaceholder(s.contactNumber),
      days: daysUntil(s.matchDate),
      location: [s.venue, s.locality, s.region].filter(Boolean).join(', '),
    };
  }

  // {{token}} substitution for FAQ / announcement text, so answers stay in sync with the settings.
  function tokens(text, s) {
    const d = derive(s);
    const map = {
      name: s.tournamentName, date: d.date.long, venue: s.venue, locality: s.locality, region: s.region,
      location: d.location, fee: d.fee, ageGroup: d.age, format: s.playersPerSide + '-a-side',
      prizePool: d.prizeSet ? s.prizePool : 'to be announced soon',
      contact: d.contactReal ? s.contactNumber : 'the official contact number (to be announced soon)',
    };
    return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in map ? map[k] : m));
  }

  return { MONTHS, parseISO, dateParts, inr, isPlaceholder, isRealPhone, telHref, daysUntil, derive, tokens };
});
