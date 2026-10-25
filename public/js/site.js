/* Public site behaviour: mobile menu, nav state, scroll reveals, FAQ accordion, copy-number. No dependencies. */
(function () {
  'use strict';
  document.documentElement.classList.add('js-reveal');

  var footIn = document.querySelector('.foot__in');
  if (footIn && !footIn.querySelector('.foot__creator')) {
    var creator = document.createElement('div');
    creator.className = 'foot__creator';
    var credit = document.createElement('p');
    credit.appendChild(document.createTextNode('WEBSITE BUILT BY '));
    var name = document.createElement('b');
    name.textContent = 'VARUN (NYXO)';
    credit.appendChild(name);
    var link = document.createElement('a');
    link.href = '/nyxo.html';
    link.appendChild(document.createTextNode('BUILD YOUR OWN WEBSITE '));
    var arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    link.appendChild(arrow);
    creator.appendChild(credit);
    creator.appendChild(link);
    footIn.appendChild(creator);
  }

  // Keep the standalone creator page easy to find from both navigation layouts.
  document.querySelectorAll('.nav__links, .menu ul').forEach(function (list) {
    if (!list.querySelector('a[href="/nyxo.html"]')) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '/nyxo.html';
      link.className = 'nav__nyxo';
      link.textContent = 'Build your own website';
      item.appendChild(link);
      list.appendChild(item);
    }
  });

  // An already-running server can keep an older rendered template in memory.
  // If that page has no animation markup, add the external animation assets here.
  if (document.getElementById('sequence') && (!document.getElementById('ballCanvas') || !document.getElementById('boot') || !document.querySelector('script[src*="/js/ball.js"]'))) {
    if (!document.getElementById('ballCanvas')) {
      var ball = document.createElement('div');
      ball.className = 'ball';
      ball.setAttribute('aria-hidden', 'true');
      var canvas = document.createElement('canvas');
      canvas.id = 'ballCanvas';
      ball.appendChild(canvas);
      document.body.insertBefore(ball, document.body.firstChild);
    }
    if (!document.querySelector('.vignette')) {
      var vignette = document.createElement('div');
      vignette.className = 'vignette';
      vignette.setAttribute('aria-hidden', 'true');
      document.body.insertBefore(vignette, document.body.firstChild);
    }
    if (!document.getElementById('ballLoading')) {
      var loading = document.createElement('p');
      loading.className = 'ball-loading';
      loading.id = 'ballLoading';
      loading.setAttribute('aria-live', 'polite');
      loading.textContent = 'LOADING MATCH BALL ';
      var percent = document.createElement('span');
      percent.textContent = '0%';
      loading.appendChild(percent);
      document.body.appendChild(loading);
    }
    if (!document.getElementById('boot')) {
      var boot = document.createElement('script');
      boot.type = 'application/json';
      boot.id = 'boot';
      boot.textContent = JSON.stringify({ count: 192, version: String(Date.now()) });
      document.body.appendChild(boot);
    }
    if (!document.querySelector('script[src*="/js/ball.js"]')) {
      var ballScript = document.createElement('script');
      ballScript.src = '/js/ball.js?v=' + Date.now();
      ballScript.async = false;
      document.body.appendChild(ballScript);
    }
  }
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ----- mobile menu -----
  var burger = $('#burger'), menu = $('#menu');
  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) { var a = $('a', menu); if (a) a.focus(); } else burger.focus({ preventScroll: true });
  }
  if (burger && menu) {
    burger.addEventListener('click', function () { setMenu(menu.hidden); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
    window.matchMedia('(min-width:960px)').addEventListener('change', function (m) { if (m.matches && !menu.hidden) setMenu(false); });
  }

  // ----- scroll reveals -----
  var items = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else items.forEach(function (el) { el.classList.add('in'); });

  // ----- FAQ accordion (button + animated grid row) -----
  var qs = $$('.faq__q');
  function toggle(btn, force) {
    var open = typeof force === 'boolean' ? force : btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    btn.closest('.faq__item').classList.toggle('is-open', open);
  }
  qs.forEach(function (btn, i) {
    btn.addEventListener('click', function () { toggle(btn); });
    btn.addEventListener('keydown', function (e) {
      var j = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? qs.length - 1 : null;
      if (j === null) return;
      e.preventDefault(); qs[(j + qs.length) % qs.length].focus();
    });
  });
  if (qs[0]) toggle(qs[0], true);

  // ----- copy organizer number (only rendered when a real number is set) -----
  var copy = $('#copyNum');
  if (copy) copy.addEventListener('click', function () {
    var n = copy.getAttribute('data-num'), done = function () { copy.textContent = 'COPIED ✓'; setTimeout(function () { copy.textContent = 'COPY NUMBER'; }, 1800); };
    if (navigator.clipboard) navigator.clipboard.writeText(n).then(done, function () {});
  });
})();
