/* Scroll-scrubbed football frame renderer. No dependencies; compatible with the site's strict CSP. */
(function () {
  'use strict';

  var canvas = document.getElementById('ballCanvas');
  var wrapper = document.querySelector('.ball');
  var bootEl = document.getElementById('boot');
  var label = document.getElementById('ballLoading');
  var seq = document.getElementById('sequence');
  if (!canvas || !wrapper || !bootEl || !seq) return;

  var boot;
  try { boot = JSON.parse(bootEl.textContent); } catch (_) { return; }
  var count = Math.max(1, Number(boot.count) || 192);
  var version = encodeURIComponent(boot.version || '1');
  var ctx = canvas.getContext('2d', { alpha: false });
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var mobile = window.innerWidth <= 768;
  var step = saveData ? 2 : 1;
  var setName = mobile || saveData ? 'm' : 'd';
  var concurrency = mobile ? 4 : 5;
  var cacheLimit = mobile ? 32 : 48;
  var expected = Math.ceil(count / step);
  var blobs = new Map();
  var bitmaps = new Map();
  var ready = new Set();
  var failed = new Set();
  var loading = new Map();
  var queue = [];
  var active = 0;
  var generation = 0;
  var anchors = [];
  var sequenceTop = 0;
  var sequenceEnd = 1;
  var maxScroll = 1;
  var current = 1;
  var target = 1;
  var raf = 0;
  var lastY = window.scrollY;
  var direction = 1;
  var lastDrawn = 0;
  var hidden = document.hidden;
  var unavailable = false;
  var hideLabelTimer = 0;

  var desktop = {
    hero: [.22, .52, 1.05, .48], seq: [0, .5, 1, 1], details: [-.2, .5, 1.05, .16],
    news: [.2, .5, 1, .16], teams: [.2, .5, 1.08, .16], venue: [-.2, .5, 1.12, .18],
    register: [.2, .5, 1.08, .16], faq: [-.18, .5, 1.08, .15], final: [0, .5, .9, .42]
  };
  var phone = {
    hero: [.16, .53, .94, .42], seq: [0, .5, 1, 1], details: [-.17, .5, .98, .15],
    news: [.16, .5, .95, .15], teams: [.17, .5, .98, .15], venue: [-.16, .5, 1, .16],
    register: [.16, .5, .98, .14], faq: [-.16, .5, .98, .13], final: [0, .5, .86, .38]
  };
  var poses = mobile ? phone : desktop;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function smooth(v) { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); }
  function frameUrl(n) { return '/frames/' + setName + '/' + String(n).padStart(4, '0') + '.webp?v=' + version; }
  function scrollProgress() {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return clamp(window.scrollY / maxScroll, 0, 1);
  }
  function allowed(n) { return n === 1 || ((n - 1) % step) === 0; }
  function canvasSize() { return setName === 'm' ? 400 : 640; }

  function updateLabel() {
    if (!label) return;
    if (unavailable) {
      label.textContent = 'ANIMATION UNAVAILABLE';
      label.classList.add('is-unavailable');
      label.classList.remove('is-loading');
      return;
    }
    var span = label.querySelector('span');
    if (span) span.textContent = Math.round(ready.size / expected * 100) + '%';
    if (ready.size >= expected) {
      clearTimeout(hideLabelTimer);
      hideLabelTimer = window.setTimeout(function () { label.classList.remove('is-loading'); }, 450);
    } else {
      label.classList.add('is-loading');
    }
    if (failed.size >= Math.min(4, expected)) {
      unavailable = true;
      updateLabel();
    }
  }

  function touchMap(map, key, value) {
    map.delete(key);
    map.set(key, value);
  }

  function rememberBlob(n, blob) {
    touchMap(blobs, n, blob);
    var limit = cacheLimit * 2;
    while (blobs.size > limit) {
      var oldest = blobs.keys().next().value;
      if (oldest === 1 && blobs.size > 1) {
        var first = blobs.get(oldest);
        blobs.delete(oldest);
        blobs.set(oldest, first);
      } else blobs.delete(oldest);
    }
  }

  function rememberBitmap(n, bitmap) {
    var old = bitmaps.get(n);
    if (old && old !== bitmap && old.close) old.close();
    touchMap(bitmaps, n, bitmap);
    while (bitmaps.size > cacheLimit) {
      var oldest = bitmaps.keys().next().value;
      var dead = bitmaps.get(oldest);
      bitmaps.delete(oldest);
      if (dead && dead.close) dead.close();
    }
  }

  function draw(bitmap, n) {
    if (!bitmap || !canvas.width) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    canvas.dataset.frame = String(n);
    lastDrawn = n;
  }

  function nearest(n) {
    if (bitmaps.has(n)) {
      var exact = bitmaps.get(n);
      touchMap(bitmaps, n, exact);
      return [exact, n];
    }
    var hit = null;
    var distance = Infinity;
    bitmaps.forEach(function (bitmap, frame) {
      var d = Math.abs(frame - n);
      if (d < distance) { hit = [bitmap, frame]; distance = d; }
    });
    return hit;
  }

  function drawNearest(n) {
    var hit = nearest(n);
    if (hit && hit[1] !== lastDrawn) draw(hit[0], hit[1]);
  }

  function decode(blob) {
    if (window.createImageBitmap) return window.createImageBitmap(blob);
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      if (img.decode) {
        img.src = url;
        img.decode().then(function () { URL.revokeObjectURL(url); resolve(img); }, function (error) { URL.revokeObjectURL(url); reject(error); });
      } else {
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('frame decode failed')); };
        img.src = url;
      }
    });
  }

  function enqueue(n, priority) {
    n = clamp(Math.round(n), 1, count);
    if (!allowed(n) || bitmaps.has(n) || loading.has(n) || failed.has(n)) return;
    if (queue.some(function (item) { return item.n === n; })) return;
    if (priority) queue.unshift({ n: n });
    else queue.push({ n: n });
    pump();
  }

  function pump() {
    while (!hidden && active < concurrency && queue.length) {
      var item = queue.shift();
      if (bitmaps.has(item.n) || loading.has(item.n) || failed.has(item.n)) continue;
      loadFrame(item.n);
    }
  }

  function loadFrame(n) {
    var controller = new AbortController();
    var token = generation;
    var timeout = window.setTimeout(function () { controller.abort(); }, 12000);
    loading.set(n, controller);
    active++;
    var blobPromise;
    if (blobs.has(n)) {
      var cached = blobs.get(n);
      touchMap(blobs, n, cached);
      blobPromise = Promise.resolve(cached);
    } else {
      blobPromise = fetch(frameUrl(n), { signal: controller.signal, credentials: 'same-origin' }).then(function (response) {
        if (!response.ok) throw new Error('frame request failed');
        return response.blob();
      });
    }
    blobPromise.then(function (blob) {
      if (token !== generation) return null;
      rememberBlob(n, blob);
      return decode(blob);
    }).then(function (bitmap) {
      if (!bitmap || token !== generation) return;
      rememberBitmap(n, bitmap);
      ready.add(n);
      updateLabel();
      drawNearest(Math.round(target));
      if (n === 1) requestUpdate();
    }).catch(function () {
      if (token === generation) {
        failed.add(n);
        updateLabel();
      }
    }).finally(function () {
      clearTimeout(timeout);
      if (loading.get(n) === controller) loading.delete(n);
      active = Math.max(0, active - 1);
      pump();
    });
  }

  function seedFrames() {
    enqueue(1, true);
    [8, 4, 2, 1].forEach(function (stride) {
      for (var n = 1; n <= count; n += stride) if (allowed(n)) enqueue(n, false);
    });
  }

  function preloadAround(n) {
    var radius = Math.min(cacheLimit * .75, 28);
    for (var i = 1; i <= radius; i++) {
      var next = n + direction * i * step;
      if (next < 1 || next > count) break;
      enqueue(next, i <= 3);
    }
  }

  function setPose(pose, inSequence) {
    var diameter = inSequence ? (mobile ? 'min(80vw,55svh)' : '58svh') : (mobile ? 'min(100vw,80svh)' : 'min(100vw,100svh)');
    wrapper.style.width = diameter;
    wrapper.style.height = diameter;
    wrapper.style.left = 'calc(50% + ' + (pose[0] * 100) + 'vw)';
    wrapper.style.top = (pose[1] * 100) + 'svh';
    wrapper.style.transform = 'translate(-50%,-50%) scale(' + pose[2] + ')';
    wrapper.style.opacity = String(pose[3]);
  }

  function poseAt(y) {
    if (!anchors.length) return poses.hero;
    var previous = anchors[0];
    var half = clamp(window.innerHeight * .34, 160, 360);
    for (var i = 1; i < anchors.length; i++) {
      var next = anchors[i];
      var start = next.top - half;
      var end = next.top + half;
      if (y < start) return poses[previous.name] || poses.hero;
      if (y <= end) {
        var a = poses[previous.name] || poses.hero;
        var b = poses[next.name] || a;
        var t = smooth((y - start) / Math.max(1, end - start));
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
          a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
      }
      previous = next;
    }
    return poses[previous.name] || poses.hero;
  }

  function calcAnchors() {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    var seqRect = seq.getBoundingClientRect();
    sequenceTop = seqRect.top + window.scrollY;
    sequenceEnd = sequenceTop + Math.max(1, seq.offsetHeight - window.innerHeight);
    anchors = [];
    document.querySelectorAll('[data-pose]').forEach(function (el) {
      var rect = el.getBoundingClientRect();
      anchors.push({ name: el.getAttribute('data-pose'), top: rect.top + window.scrollY });
    });
    anchors.sort(function (a, b) { return a.top - b.top; });
    var seqAnchor = anchors.find(function (a) { return a.name === 'seq'; });
    if (seqAnchor) seqAnchor.top = sequenceTop;
    requestUpdate();
  }

  function frameFor(progress) {
    var start = clamp(sequenceTop / maxScroll, 0, 1);
    var end = clamp(sequenceEnd / maxScroll, start + .001, 1);
    var t;
    if (progress < start) t = .12 * progress / Math.max(start, .001);
    else if (progress < end) t = .12 + .70 * (progress - start) / Math.max(end - start, .001);
    else t = .82 + .18 * (progress - end) / Math.max(1 - end, .001);
    return clamp(Math.round(1 + (count - 1) * t), 1, count);
  }

  function requestUpdate() {
    if (!raf && !hidden) raf = window.requestAnimationFrame(tick);
  }

  function tick() {
    raf = 0;
    if (hidden) return;
    var y = window.scrollY;
    var p = scrollProgress();
    target = frameFor(p);
    var diff = target - current;
    if (Math.abs(diff) > .2) {
      current += diff * .25;
      if (Math.abs(target - current) < .25) current = target;
    } else current = target;

    var frame = clamp(Math.round(current), 1, count);
    if (bitmaps.has(frame)) {
      if (frame !== lastDrawn) draw(bitmaps.get(frame), frame);
    }
    else {
      drawNearest(frame);
      enqueue(frame, true);
    }
    preloadAround(frame);

    var inSequence = y >= sequenceTop && y <= sequenceEnd;
    var pose = inSequence ? poses.seq : poseAt(y);
    setPose(pose, inSequence);
    var pin = clamp((y - sequenceTop) / Math.max(1, sequenceEnd - sequenceTop), 0, 1);
    seq.setAttribute('data-active', String(Math.min(2, Math.floor(pin * 3))));
    var rail = document.getElementById('seqProgress');
    if (rail) rail.style.width = (pin * 100) + '%';

    if (Math.abs(target - current) > .2) requestUpdate();
  }

  function onScroll() {
    var y = window.scrollY;
    if (y !== lastY) direction = y > lastY ? 1 : -1;
    lastY = y;
    target = frameFor(scrollProgress());
    preloadAround(target);
    requestUpdate();
  }

  function resetForViewport() {
    var nextMobile = window.innerWidth <= 768;
    if (nextMobile !== mobile) {
      mobile = nextMobile;
      poses = mobile ? phone : desktop;
      setName = mobile || saveData ? 'm' : 'd';
      concurrency = mobile ? 4 : 5;
      cacheLimit = mobile ? 32 : 48;
      expected = Math.ceil(count / step);
      generation++;
      loading.forEach(function (controller) { controller.abort(); });
      loading.clear();
      queue = [];
      bitmaps.forEach(function (bitmap) { if (bitmap && bitmap.close) bitmap.close(); });
      bitmaps.clear();
      blobs.clear();
      ready.clear();
      failed.clear();
      unavailable = false;
      canvas.width = canvasSize();
      canvas.height = canvasSize();
      lastDrawn = 0;
      if (label) {
        label.innerHTML = 'LOADING MATCH BALL <span>0%</span>';
        label.classList.remove('is-unavailable');
        label.classList.add('is-loading');
      }
      seedFrames();
    }
    calcAnchors();
    onScroll();
  }

  canvas.width = canvasSize();
  canvas.height = canvasSize();
  wrapper.style.width = 'min(100vw,100svh)';
  wrapper.style.height = 'min(100vw,100svh)';
  wrapper.style.left = 'calc(50% + ' + (mobile ? 16 : 22) + 'vw)';
  wrapper.style.top = (mobile ? 53 : 52) + 'svh';
  wrapper.style.transform = 'translate(-50%,-50%)';
  wrapper.style.opacity = mobile ? '.42' : '.48';

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', resetForViewport, { passive: true });
  window.addEventListener('orientationchange', calcAnchors, { passive: true });
  window.addEventListener('pageshow', function () { calcAnchors(); onScroll(); });
  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
    if (hidden && raf) { window.cancelAnimationFrame(raf); raf = 0; }
    else if (!hidden) { pump(); calcAnchors(); onScroll(); }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(calcAnchors);

  calcAnchors();
  seedFrames();
  onScroll();
})();
