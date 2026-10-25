// Server-side renderer for the public page. Output is built from the live database content on every request,
// so admin edits show up immediately (no rebuild / redeploy).
const fs = require('fs');
const path = require('path');
const Fmt = require('../shared/format');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsonSafe = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

function makeRenderer({ publicDir, viewsDir, frames, assetVersion }) {
  const tpl = fs.readFileSync(path.join(viewsDir, 'index.html'), 'utf8');

  function render({ settings: s, faqs, announcements, teams }) {
    const d = Fmt.derive(s);
    const localityShort = String(s.locality).split(',')[0].trim();

    const plen = [...String(s.prizePool)].length;
    const prizeClass = plen <= 4 ? 'p1' : plen <= 7 ? 'p2' : plen <= 11 ? 'p3' : 'p4';

    const daysHtml = d.days == null || d.days < 0 ? '' :
      `<p class="hero__days"><b>${d.days === 0 ? 'MATCH DAY' : String(d.days).padStart(2, '0')}</b>${d.days === 0 ? '' : d.days === 1 ? ' DAY TO GO' : ' DAYS TO GO'}</p>`;

    const faqHtml = faqs.map((f, i) => {
      const n = i + 1;
      return `<div class="faq__item"><h3><button class="faq__q" type="button" id="faq-q-${n}" aria-expanded="false" aria-controls="faq-a-${n}"><span class="faq__n">${String(n).padStart(2, '0')}</span><span class="faq__t">${esc(Fmt.tokens(f.question, s))}</span><span class="faq__i" aria-hidden="true"></span></button></h3>` +
        `<div class="faq__a" id="faq-a-${n}" role="region" aria-labelledby="faq-q-${n}"><div class="faq__ai"><p>${esc(Fmt.tokens(f.answer, s)).replace(/\n/g, '<br>')}</p></div></div></div>`;
    }).join('');

    let contactHtml, registerNote;
    if (d.contactReal) {
      const clen = String(s.contactNumber).length;
      contactHtml = `<a class="contact__num ${clen > 12 ? 'c2' : 'c1'}" href="${esc(Fmt.telHref(s.contactNumber))}">${esc(s.contactNumber)}</a><button class="contact__copy" type="button" id="copyNum" data-num="${esc(s.contactNumber)}">COPY NUMBER</button>`;
      registerNote = 'Teams should contact the organizer on this number to participate in the tournament.';
    } else {
      contactHtml = `<p class="contact__num c1 is-placeholder" aria-label="Organizer contact number not yet announced">${esc(s.contactNumber)}</p>`;
      registerNote = 'Teams should contact the organizer to participate. The official contact number will be announced soon.';
    }

    const pub = announcements.filter((a) => a.published);
    const announcementsHtml = pub.length ? `<section class="news" id="news" data-pose="news"><div class="wrap"><p class="kicker reveal"><b>★</b> LATEST ANNOUNCEMENTS</p><ul class="news__list">` +
      pub.map((a) => { const dp = a.date ? Fmt.dateParts(a.date) : null;
        return `<li class="reveal"><span class="news__date">${dp ? esc(dp.day + ' ' + dp.mon + ' ' + dp.year) : '—'}</span><div><h3>${esc(Fmt.tokens(a.title, s))}</h3>${a.body ? `<p>${esc(Fmt.tokens(a.body, s)).replace(/\n/g, '<br>')}</p>` : ''}</div></li>`; }).join('') +
      `</ul></div></section>` : '';

    const directionsHtml = s.mapUrl ? `<a class="btn btn--ghost reveal" href="${esc(s.mapUrl)}" target="_blank" rel="noopener noreferrer">GET DIRECTIONS <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="2.5"/></svg></a>` : '';

    const teamsHtml = teams.length
      ? '<ol class="teams__list">' + teams.map((t, i) => `<li class="team reveal"><span class="team__n">${String(i + 1).padStart(2, '0')}</span><span class="team__name">${esc(t.name)}</span>${t.from ? `<span class="team__from">${esc(t.from)}</span>` : ''}</li>`).join('') + '</ol>'
      : '<p class="teams__empty reveal">No teams have been added yet. Registered teams will appear here.</p>';
    const teamCountLabel = teams.length === 1 ? 'TEAM REGISTERED' : 'TEAMS REGISTERED';

    const metaDescription = `${s.tournamentName}: ${s.playersPerSide}-a-side football on ${d.date.long} at ${d.location}. Entry ${d.fee} per team. Ages ${d.age}.`;
    const jsonLd = jsonSafe({
      '@context': 'https://schema.org', '@type': 'SportsEvent', name: s.tournamentName, sport: 'Football',
      startDate: s.matchDate, description: metaDescription,
      location: { '@type': 'Place', name: s.venue, address: [s.locality, s.region].join(', ') },
      offers: { '@type': 'Offer', price: String(s.entryFee), priceCurrency: 'INR', description: 'Entry fee per team' },
    });

    const vars = {
      assetVersion, frameCount: frames, frameVersion: assetVersion, tournamentName: s.tournamentName, metaDescription, dateLong: d.date.long, venue: s.venue, locality: s.locality,
      region: s.region, localityShort, prizePool: s.prizePool, prizeAria: d.prizeSet ? s.prizePool : 'to be announced', prizeClass,
      dateDay: d.date.day, dateMonth: d.date.month, dateMon: d.date.mon, dateYear: d.date.year,
      side: d.side, fee: d.fee, feeNum: d.feeNum, age: d.age, playersPerSide: s.playersPerSide, registerNote,
      daysHtml, contactHtml, faqHtml, teamsHtml, teamCount: String(teams.length).padStart(2, '0'), teamCountLabel, announcementsHtml, directionsHtml, jsonLd,
    };
    const RAW = new Set(['daysHtml', 'contactHtml', 'faqHtml', 'announcementsHtml', 'directionsHtml', 'jsonLd', 'teamsHtml']);
    return tpl.replace(/\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g, (m, raw, cooked) => {
      const k = raw || cooked;
      if (!(k in vars)) return m;
      if (raw) { if (!RAW.has(k)) throw new Error('template: ' + k + ' is not a raw var'); return String(vars[k]); }
      return esc(vars[k]);
    });
  }
  return { render };
}
module.exports = { makeRenderer, esc };
