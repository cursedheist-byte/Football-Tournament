/* Organizer admin – talks only to /api/admin/*; every request is re-validated on the server. */
(function () {
  'use strict';
  var app = document.getElementById('app'), toastEl = document.getElementById('toast'), topNav = document.getElementById('topNav');
  var state = { data: null, defaults: null, tab: 'tournament', dirty: false };

  function h(tag, attrs) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') el.className = attrs[k]; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) el.setAttribute(k, ''); else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null) continue; el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return el;
  }
  function toast(msg, bad) { toastEl.textContent = msg; toastEl.className = 'toast show' + (bad ? ' bad' : ''); clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.className = 'toast'; }, bad ? 5000 : 2600); }

  function api(method, path, body) {
    return fetch('/api/admin/' + path, {
      method: method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dh-admin' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); });
  }

  // ---------- login ----------
  function showLogin(configured, msg) {
    topNav.hidden = true; app.textContent = '';
    var err = h('p', { class: 'err', role: 'alert' }, msg || (configured ? '' : 'Admin login is disabled: ADMIN_PASSWORD is not set on the server.'));
    var pw = h('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, disabled: !configured });
    var btn = h('button', { type: 'submit', disabled: !configured }, 'Sign in');
    var form = h('form', { class: 'card login' }, h('h1', {}, 'Sign in'), h('p', { class: 'muted small' }, 'Organizer access only.'),
      h('label', { for: 'pw' }, 'Password'), pw, err, h('div', { class: 'mt' }, btn));
    form.addEventListener('submit', function (e) {
      e.preventDefault(); btn.disabled = true; err.textContent = '';
      api('POST', 'login', { password: pw.value }).then(function (r) {
        if (r.status === 200) return load();
        err.textContent = r.body.error || 'Sign-in failed'; btn.disabled = false; pw.select();
      }).catch(function () { err.textContent = 'Network error'; btn.disabled = false; });
    });
    app.appendChild(form); if (configured) pw.focus();
  }

  // ---------- app shell ----------
  function load() {
    return api('GET', 'session').then(function (s) {
      if (!s.body.authenticated) return showLogin(s.body.configured);
      return api('GET', 'content').then(function (r) {
        if (r.status === 401) return showLogin(true, 'Session expired. Please sign in again.');
        state.data = { settings: r.body.settings, faqs: r.body.faqs, announcements: r.body.announcements, teams: r.body.teams };
        state.defaults = r.body.defaults; state.dirty = false; topNav.hidden = false; render();
      });
    }).catch(function () { app.textContent = 'Could not reach the server.'; });
  }

  var TABS = [['tournament', 'Tournament'], ['teams', 'Teams'], ['faqs', 'FAQs'], ['announcements', 'Announcements']];
  function render() {
    app.textContent = '';
    var tabs = h('div', { class: 'tabs', role: 'tablist' });
    TABS.forEach(function (t) {
      tabs.appendChild(h('button', { class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(state.tab === t[0]), onclick: function () {
        if (state.dirty && !confirm('You have unsaved changes. Discard them?')) return;
        if (state.dirty) { load().then(function () { state.tab = t[0]; render(); }); return; }
        state.tab = t[0]; render(); } }, t[1]));
    });
    app.appendChild(h('h1', {}, 'Dashboard'));
    app.appendChild(h('p', { class: 'muted' }, 'Changes go live on the public website as soon as you save. No redeploy needed.'));
    app.appendChild(tabs);
    var body = h('div', { role: 'tabpanel' }); app.appendChild(body);
    ({ tournament: tournamentTab, teams: teamsTab, faqs: faqsTab, announcements: announcementsTab })[state.tab](body);
  }

  function setDirty(v) { state.dirty = v; var s = document.getElementById('saveState'); if (s) { s.textContent = v ? 'Unsaved changes' : 'All changes saved'; s.className = 'state' + (v ? ' dirty' : ''); } }
  function saveBar(onSave, extra) {
    var btn = h('button', { type: 'button' }, 'Save changes');
    btn.addEventListener('click', function () { btn.disabled = true; onSave().then(function () { btn.disabled = false; }); });
    return h('div', { class: 'bar' }, h('div', { class: 'bar__in' }, h('span', { id: 'saveState', class: 'state' }, 'All changes saved'), extra || null, btn));
  }
  function clearErrors() { app.querySelectorAll('[data-err]').forEach(function (e) { e.textContent = ''; }); app.querySelectorAll('.invalid').forEach(function (e) { e.classList.remove('invalid'); }); }
  function showErrors(errors) {
    var first = null;
    Object.keys(errors || {}).forEach(function (k) {
      var e = app.querySelector('[data-err="' + k + '"]'); if (e) { e.textContent = errors[k]; var inp = e.previousElementSibling; while (inp && !/^(INPUT|TEXTAREA)$/.test(inp.tagName)) inp = inp.previousElementSibling; if (inp) { inp.classList.add('invalid'); first = first || inp; } }
    });
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function save(route, payload, after) {
    clearErrors();
    return api('PUT', route, payload).then(function (r) {
      if (r.status === 200) { setDirty(false); toast('Saved. Live on the website now.'); if (after) after(r.body.value); }
      else if (r.status === 401) { showLogin(true, 'Session expired. Please sign in again.'); }
      else if (r.status === 422) { showErrors(r.body.errors); toast(r.body.error || 'Please fix the highlighted fields', true); }
      else toast(r.body.error || 'Save failed', true);
    }).catch(function () { toast('Network error. Nothing was saved.', true); });
  }

  function field(opts) { // opts: key, label, type, value, help, onInput, errKey, textarea
    var id = 'f-' + opts.errKey.replace(/\./g, '-');
    var inp = opts.textarea ? h('textarea', { id: id, maxlength: opts.max }) : h('input', { id: id, type: opts.type || 'text', maxlength: opts.max, inputmode: opts.inputmode, min: opts.min, max: opts.type === 'number' ? opts.maxN : null });
    inp.value = opts.value == null ? '' : opts.value;
    inp.addEventListener('input', function () { opts.onInput(inp.value); setDirty(true); });
    return h('div', { class: opts.full ? 'full' : '' }, h('label', { for: id }, opts.label), inp,
      opts.help ? h('p', { class: 'help' }, opts.help) : null, h('p', { class: 'err', 'data-err': opts.errKey }));
  }

  // ---------- tournament tab ----------
  function tournamentTab(root) {
    var s = state.data.settings;
    var F = [
      ['tournamentName', 'Tournament name', 'text', { full: true, max: 80, help: 'Shown in the navigation, hero, page title and footer.' }],
      ['prizePool', 'Prize pool (shown in the hero)', 'text', { max: 40, help: 'Keep XXXX until the amount is decided. You can write e.g. ₹50,000 or "₹50,000 + trophies".' }],
      ['contactNumber', 'Official contact number', 'text', { max: 24, inputmode: 'tel', help: 'Keep XXXXXXXXXX until the real number is available. A real number becomes a tap-to-call link.' }],
      ['matchDate', 'Match date', 'date', {}],
      ['entryFee', 'Entry fee per team (₹)', 'number', { min: 0, maxN: 1000000, inputmode: 'numeric' }],
      ['ageMin', 'Minimum age', 'number', { min: 3, maxN: 99, inputmode: 'numeric' }],
      ['ageMax', 'Maximum age', 'number', { min: 3, maxN: 99, inputmode: 'numeric' }],
      ['playersPerSide', 'Players per side (9 = 9-a-side)', 'number', { min: 2, maxN: 11, inputmode: 'numeric' }],
      ['venue', 'Venue name', 'text', { max: 80 }],
      ['locality', 'Locality / city', 'text', { max: 80 }],
      ['region', 'State / country', 'text', { max: 80 }],
      ['mapUrl', 'Directions link (optional)', 'url', { full: true, max: 500, help: 'Paste a Google Maps share link (https://…). The "Get directions" button only appears when this is filled.' }],
    ];
    var grid = h('div', { class: 'grid2' });
    F.forEach(function (f) { grid.appendChild(field(Object.assign({ errKey: f[0], label: f[1], type: f[2], value: s[f[0]], onInput: function (v) { s[f[0]] = v; } }, f[3]))); });
    root.appendChild(h('div', { class: 'card' }, h('h2', {}, 'Tournament details'), grid));
    document.body.appendChild(replaceBar(saveBar(function () { return save('settings', s, function (v) { state.data.settings = v; }); })));
  }

  // ---------- generic list editor (teams / faqs / announcements) ----------
  function listEditor(root, cfg) {
    var list = state.data[cfg.key];
    var box = h('div', {});
    function draw() {
      box.textContent = '';
      if (!list.length) box.appendChild(h('p', { class: 'muted card' }, cfg.empty));
      list.forEach(function (item, i) {
        var fields = h('div', { class: 'item' });
        cfg.fields.forEach(function (f) {
          if (f.type === 'checkbox') {
            var cb = h('input', { type: 'checkbox', id: cfg.key + i + f.k }); cb.checked = !!item[f.k];
            cb.addEventListener('change', function () { item[f.k] = cb.checked; setDirty(true); });
            fields.appendChild(h('label', { class: 'chk', for: cb.id }, cb, f.label)); return;
          }
          fields.appendChild(field({ errKey: cfg.err + '.' + i + '.' + f.k, label: f.label, type: f.type, textarea: f.textarea, max: f.max, help: f.help, value: item[f.k], onInput: function (v) { item[f.k] = v; } }));
        });
        var move = function (d) { return function () { var j = i + d; if (j < 0 || j >= list.length) return; var t = list[i]; list[i] = list[j]; list[j] = t; setDirty(true); draw(); }; };
        box.appendChild(h('div', { class: 'card' },
          h('div', { class: 'item__h' }, h('b', {}, cfg.label + ' ' + String(i + 1).padStart(2, '0')),
            h('div', { class: 'item__btns' },
              h('button', { type: 'button', class: 'ghost', 'aria-label': 'Move up', disabled: i === 0, onclick: move(-1) }, '↑'),
              h('button', { type: 'button', class: 'ghost', 'aria-label': 'Move down', disabled: i === list.length - 1, onclick: move(1) }, '↓'),
              h('button', { type: 'button', class: 'danger', onclick: function () { if (confirm('Delete this ' + cfg.label.toLowerCase() + '? (Takes effect when you press Save changes)')) { list.splice(i, 1); setDirty(true); draw(); } } }, 'Delete'))),
          fields));
      });
    }
    draw();
    var add = h('button', { type: 'button', class: 'ghost', onclick: function () { list.push(cfg.blank()); setDirty(true); draw(); var last = box.lastElementChild; if (last) { last.scrollIntoView({ block: 'center', behavior: 'smooth' }); var i = last.querySelector('input,textarea'); if (i) i.focus(); } } }, '+ Add ' + cfg.label.toLowerCase());
    root.appendChild(h('div', { class: 'card' }, h('h2', {}, cfg.title), h('p', { class: 'muted small' }, cfg.help), cfg.extra || null));
    root.appendChild(box); root.appendChild(h('div', { class: 'mt' }, add));
    document.body.appendChild(replaceBar(saveBar(function () { return save(cfg.key, list, function (v) { state.data[cfg.key] = v; list = state.data[cfg.key]; draw(); }); },
      cfg.reset ? h('button', { type: 'button', class: 'ghost', onclick: function () { if (confirm('Replace the list with the original default FAQs? (Press Save changes to apply)')) { list.length = 0; state.defaults.faqs.forEach(function (f) { list.push({ question: f.question, answer: f.answer }); }); setDirty(true); draw(); } } }, 'Reset to defaults') : null)));
  }
  function replaceBar(bar) { document.querySelectorAll('.bar').forEach(function (b) { b.remove(); }); return bar; }

  function teamsTab(root) {
    listEditor(root, { key: 'teams', err: 'team', label: 'Team', title: 'Participating teams', empty: 'No teams yet. Click "Add team" to list the first one.',
      help: 'These appear in the "Currently Participating" section of the website, in this order. The team count updates automatically.',
      fields: [{ k: 'name', label: 'Team name', max: 60 }, { k: 'from', label: 'Locality / area (optional)', max: 60 }], blank: function () { return { name: '', from: '' }; } });
  }
  function faqsTab(root) {
    var chips = h('div', { class: 'chips' }); ['date', 'location', 'venue', 'format', 'fee', 'ageGroup', 'prizePool', 'contact', 'name'].forEach(function (t) { chips.appendChild(h('code', {}, '{{' + t + '}}')); });
    listEditor(root, { key: 'faqs', err: 'faq', label: 'FAQ', title: 'Frequently asked questions', reset: true, empty: 'No FAQs yet.',
      help: 'Tip: use tokens so answers stay in sync with the Tournament tab automatically, e.g. "The entry fee is {{fee}} per team."',
      extra: chips, fields: [{ k: 'question', label: 'Question', max: 200 }, { k: 'answer', label: 'Answer', textarea: true, max: 2000 }], blank: function () { return { question: '', answer: '' }; } });
  }
  function announcementsTab(root) {
    listEditor(root, { key: 'announcements', err: 'ann', label: 'Announcement', title: 'Announcements', empty: 'No announcements yet.',
      help: 'Only announcements marked "Published" appear on the website. If none are published, the section is hidden.',
      fields: [{ k: 'title', label: 'Title', max: 120 }, { k: 'date', label: 'Date (optional)', type: 'date' }, { k: 'body', label: 'Text (optional)', textarea: true, max: 1000 }, { k: 'published', label: 'Published', type: 'checkbox' }],
      blank: function () { return { title: '', date: '', body: '', published: false }; } });
  }

  document.getElementById('logout').addEventListener('click', function () {
    api('POST', 'logout').then(function () { document.querySelectorAll('.bar').forEach(function (b) { b.remove(); }); showLogin(true, ''); });
  });
  window.addEventListener('beforeunload', function (e) { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
