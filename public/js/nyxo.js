(function () {
  'use strict';
  var progress = document.getElementById('siteProgress');
  var raf = 0;
  function updateProgress() {
    raf = 0;
    if (!progress) return;
    var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    progress.style.width = (window.scrollY / max * 100) + '%';
  }
  window.addEventListener('scroll', function () {
    if (!raf) raf = window.requestAnimationFrame(updateProgress);
  }, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
  updateProgress();

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  var toast = document.getElementById('copyToast');
  var toastTimer = 0;
  function showCopyStatus(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('copy-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toast.classList.remove('copy-toast--visible'); }, 2400);
  }
  function fallbackCopy(value) {
    var field = document.createElement('textarea');
    field.value = value;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (_) {}
    field.remove();
    return copied;
  }
  document.querySelectorAll('a[href^="tel:"]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var number = '+91 8859230314';
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(number).then(function () {
          showCopyStatus('NUMBER COPIED · ' + number);
        }).catch(function () {
          showCopyStatus(fallbackCopy(number) ? 'NUMBER COPIED · ' + number : 'COULD NOT COPY NUMBER');
        });
      } else {
        showCopyStatus(fallbackCopy(number) ? 'NUMBER COPIED · ' + number : 'COULD NOT COPY NUMBER');
      }
    });
  });

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!reduced.matches) {
    document.documentElement.classList.add('motion-ready');
    var items = document.querySelectorAll('[data-reveal]');
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
      items.forEach(function (item) { observer.observe(item); });
    } else items.forEach(function (item) { item.classList.add('is-visible'); });
  }
})();
