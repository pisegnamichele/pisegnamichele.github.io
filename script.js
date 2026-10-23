(function () {
  var root = document.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // The motion layer needs GSAP; without it (offline, blocked CDN) the page falls back to the plain effects
  var motion = !reduce && !!(window.gsap && window.ScrollTrigger);
  if (motion) root.classList.add('motion');

  function clamp(v) { return Math.max(0, Math.min(1, v)); }

  // Copy email
  var btn = document.getElementById('copy-mail');
  var mail = document.getElementById('mail');
  btn.addEventListener('click', function () {
    var text = mail.textContent.trim();
    function selectText() {
      var r = document.createRange();
      r.selectNodeContents(mail);
      var s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      btn.textContent = 'Selezionata, premi Ctrl+C';
    }
    try {
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Email copiata';
        if (motion) confetti(btn);
        setTimeout(function () { btn.textContent = 'Copia email'; }, 2000);
      }, selectText);
    } catch (e) { selectText(); }
  });

  // Hero: one wave around the ring of flyers. A few slow sine waves with unrelated speeds are added
  // together, so the shape never repeats and moves like water instead of turning evenly.
  (function () {
    var path = document.querySelector('.orbit-waves .ow');
    if (!path) return;
    var N = 240, R = 100, visible = true, running = false, t0 = performance.now();
    function shape(t) {
      var a1 = 4.2 + 1.8 * Math.sin(t * 0.31), a2 = 3 + 1.4 * Math.sin(t * 0.23 + 2), a3 = 2.4 + 1.2 * Math.sin(t * 0.17 + 4);
      var d = '';
      for (var i = 0; i <= N; i++) {
        var th = (i / N) * Math.PI * 2;
        var r = R + a1 * Math.sin(5 * th + t * 0.9)
                  + a2 * Math.sin(8 * th - t * 1.27 + 1.7)
                  + a3 * Math.sin(3 * th + t * 0.53 + 0.4)
                  + 1.6 * Math.sin(11 * th + t * 1.9 + Math.sin(t * 0.4) * 2);
        d += (i ? 'L' : 'M') + (100 + r * Math.cos(th)).toFixed(2) + ' ' + (100 + r * Math.sin(th)).toFixed(2);
      }
      path.setAttribute('d', d + 'Z');
    }
    shape(0);
    if (reduce) return;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; start(); })
        .observe(path.closest('.stage-frame'));
    }
    function start() { if (visible && !running) { running = true; requestAnimationFrame(loop); } }
    function loop(now) {
      if (!visible) { running = false; return; }
      shape((now - t0) / 1000);
      requestAnimationFrame(loop);
    }
    start();
  })();

  // ---------- Hero: grab a flyer, throw it, it springs back to its place on the ring ----------
  (function () {
    var flyers = document.querySelectorAll('.orbit .hf');
    if (!flyers.length || reduce) return;
    flyers.forEach(function (el) {
      var img = el.querySelector('img');
      if (img) img.setAttribute('draggable', 'false');
      // x, y: offset from the place on the ring; vx, vy: speed in px per frame
      var x = 0, y = 0, vx = 0, vy = 0, rot = 0, sc = 1;
      var dragging = false, raf = 0, last = null, hist = [];
      var startX = 0, startY = 0, baseX = 0, baseY = 0, ratio = 1;

      function apply() {
        el.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + rot.toFixed(2) + 'deg) scale(' + sc.toFixed(3) + ')';
      }
      function settle() {
        raf = 0;
        if (dragging) return;
        // spring towards home + friction: a far throw flies away, slows, then comes back with a small bounce
        vx += -x * 0.018; vy += -y * 0.018;
        vx *= 0.9; vy *= 0.9;
        x += vx; y += vy;
        rot += (Math.max(-12, Math.min(12, vx * 0.5)) - rot) * 0.15;
        sc += (1 - sc) * 0.15;
        apply();
        if (Math.abs(x) + Math.abs(y) + Math.abs(vx) + Math.abs(vy) + Math.abs(rot) > 0.08) {
          raf = requestAnimationFrame(settle);
        } else {
          x = y = vx = vy = rot = 0; sc = 1;
          el.style.transform = ''; el.classList.remove('is-flying');
        }
      }
      el.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        dragging = true;
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        // the hero frame can be scaled: convert screen pixels to the flyer's own pixels
        ratio = el.offsetWidth / el.getBoundingClientRect().width || 1;
        startX = e.clientX; startY = e.clientY; baseX = x; baseY = y;
        hist = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
        el.classList.add('is-grabbed', 'is-flying');
      });
      el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var nx = baseX + (e.clientX - startX) * ratio, ny = baseY + (e.clientY - startY) * ratio;
        hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (hist.length > 6) hist.shift();
        rot += (Math.max(-12, Math.min(12, (nx - x) * 0.35)) - rot) * 0.25;
        x = nx; y = ny; sc = 1.06;
        apply();
      });
      function release(e) {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('is-grabbed');
        // speed of the last few moves becomes the throw
        var a = hist[0], b = hist[hist.length - 1], dt = Math.max(16, b.t - a.t);
        vx = (b.x - a.x) / dt * 16.7 * ratio * 1.6;
        vy = (b.y - a.y) / dt * 16.7 * ratio * 1.6;
        if (!raf) raf = requestAnimationFrame(settle);
      }
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('lostpointercapture', release);
    });
  })();

  // ---------- Motion graphics that do not need GSAP ----------
  (function () {
    var heads = document.querySelectorAll('.sec-head h2, .footer h2');
    var stats = document.querySelectorAll('.stat');
    if (!('IntersectionObserver' in window) || reduce) {
      heads.forEach(function (h) { h.classList.add('drawn'); });
      stats.forEach(function (s) { s.classList.add('counted'); });
    } else {
      // Titles: the light-blue stroke draws itself underneath
      var drawIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('drawn'); drawIO.unobserve(e.target); } });
      }, { rootMargin: '0px 0px -15% 0px' });
      heads.forEach(function (h) { drawIO.observe(h); });

      // Stats: ring fills while the number counts up
      var countIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          countIO.unobserve(e.target);
          var box = e.target, n = box.querySelector('.stat-n'), end = parseInt(n.getAttribute('data-count'), 10);
          var delay = Array.prototype.indexOf.call(stats, box) * 180;
          setTimeout(function () {
            box.classList.add('counted');
            var t0 = performance.now(), dur = 1600;
            (function step(now) {
              var t = clamp((now - t0) / dur), e2 = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
              n.textContent = Math.round(e2 * end);
              if (t < 1) requestAnimationFrame(step);
            })(t0);
          }, delay);
        });
      }, { rootMargin: '0px 0px -20% 0px' });
      stats.forEach(function (s) { s.querySelector('.stat-n').textContent = '0'; countIO.observe(s); });
    }

    // Footer: the same kind of water-like wave as the hero, stretched across the page
    var fpath = document.querySelector('.footer-wave path');
    if (!fpath) return;
    var fvis = false, frun = false, ft0 = performance.now();
    function fshape(t) {
      var d = '';
      for (var i = 0; i <= 120; i++) {
        var x = i * 10, u = x / 1200 * Math.PI * 2;
        var y = 40 + (9 + 4 * Math.sin(t * 0.3)) * Math.sin(2 * u + t * 0.8)
                   + (6 + 3 * Math.sin(t * 0.21 + 1)) * Math.sin(5 * u - t * 1.15 + 1.3)
                   + 3 * Math.sin(9 * u + t * 1.7 + Math.sin(t * 0.5) * 2);
        d += (i ? 'L' : 'M') + x + ' ' + y.toFixed(2);
      }
      fpath.setAttribute('d', d);
    }
    fshape(0);
    if (reduce || !('IntersectionObserver' in window)) return;
    function floop(now) {
      if (!fvis) { frun = false; return; }
      fshape((now - ft0) / 1000);
      requestAnimationFrame(floop);
    }
    new IntersectionObserver(function (es) {
      fvis = es[0].isIntersecting;
      if (fvis && !frun) { frun = true; requestAnimationFrame(floop); }
    }).observe(fpath.closest('.footer'));
  })();

  // Lightbox: any image with data-full, the sport flyers, or a whole tile opens big
  var lb = document.querySelector('.lightbox');
  var lbImg = lb ? lb.querySelector('img') : null;
  function openLightbox(img) {
    if (!lb || !img) return;
    lbImg.src = img.currentSrc || img.src;
    lbImg.alt = img.alt;
    if (typeof lb.showModal === 'function') lb.showModal();
    else window.open(img.src, '_blank');
    if (window.__lenis) window.__lenis.stop();
  }
  if (lb) {
    lb.addEventListener('click', function (e) { if (e.target !== lbImg) lb.close(); });
    lb.addEventListener('close', function () { if (window.__lenis) window.__lenis.start(); });
  }
  document.querySelectorAll('.tile').forEach(function (tile) {
    var img = tile.querySelector('img[data-full]');
    if (!img) return;
    // The front flyer (last in the stack) is the one that opens
    var all = tile.querySelectorAll('img[data-full]');
    tile.querySelector('.art').addEventListener('click', function (e) {
      var hit = e.target.closest('img[data-full]');
      openLightbox(hit || all[all.length - 1]);
    });
  });
  document.querySelectorAll('.sport-img').forEach(function (b) {
    b.addEventListener('click', function () { openLightbox(b.querySelector('img')); });
  });

  // Sport cards: switch between the "presentazione" and "programma" flyer
  document.querySelectorAll('.sport .seg').forEach(function (seg) {
    var img = seg.closest('.sport-media').querySelector('.sport-img img');
    seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-pressed') === 'true') return;
        seg.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
        var next = new Image();
        next.onload = next.onerror = function () {
          img.classList.add('swap');
          setTimeout(function () {
            img.src = b.getAttribute('data-src');
            img.alt = b.getAttribute('data-alt');
            img.classList.remove('swap');
          }, reduce ? 0 : 200);
        };
        next.src = b.getAttribute('data-src');
      });
    });
  });

  // Split paragraphs into words that light up while scrolling
  var wordGroups = [];
  document.querySelectorAll('[data-words]').forEach(function (el) {
    var parts = el.textContent.trim().split(/\s+/);
    var list = [];
    el.textContent = '';
    parts.forEach(function (w, i) {
      var s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      el.appendChild(s);
      if (i < parts.length - 1) el.appendChild(document.createTextNode(' '));
      list.push(s);
    });
    wordGroups.push({ el: el, words: list });
  });
  function lightWords(group, p) {
    var lit = Math.round(p * group.words.length);
    for (var j = 0; j < group.words.length; j++) group.words[j].classList.toggle('on', j < lit);
  }
  if (!motion) wordGroups.forEach(function (g) { lightWords(g, 1); });

  // Nav state
  var nav = document.querySelector('.nav');
  var dark = document.querySelector('.band-dark');
  var frame = document.querySelector('[data-scale]');
  var par = frame ? frame.querySelectorAll('[data-par]') : [];
  var ticking = false;

  function update() {
    ticking = false;
    var vh = window.innerHeight;
    nav.classList.toggle('scrolled', window.scrollY > 8);
    if (dark) {
      var dr = dark.getBoundingClientRect();
      nav.classList.toggle('on-dark', dr.top <= 24 && dr.bottom > 24);
    }
    // Plain fallback for the hero frame when GSAP is missing
    if (reduce || motion || !frame) return;
    var r = frame.getBoundingClientRect();
    var p = clamp((vh - r.top) / (vh * 0.8));
    frame.style.transform = 'scale(' + (0.86 + 0.14 * p).toFixed(4) + ')';
    for (var i = 0; i < par.length; i++) {
      var k = parseFloat(par[i].getAttribute('data-par'));
      par[i].style.transform = 'translateY(' + (k * p * 400).toFixed(1) + 'px)';
    }
  }
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  if ('IntersectionObserver' in window) {
    // Reveal once
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { revealIO.observe(el); });

    // Print steps drive the sticky diagram
    var svg = document.querySelector('.print-svg');
    var steps = document.querySelectorAll('.print-steps li');
    var stepIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        steps.forEach(function (s) { s.classList.toggle('active', s === e.target); });
        svg.setAttribute('data-step', e.target.getAttribute('data-step'));
        if (motion) gsap.fromTo(svg, { scale: 0.92 }, { scale: 1, duration: 1, ease: 'elastic.out(1, .45)' });
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { stepIO.observe(s); });

    // Highlight the current section in the nav
    var links = document.querySelectorAll('.nav-link');
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var id = '#' + e.target.id;
        links.forEach(function (a) {
          if (a.getAttribute('href') === id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-50% 0px -50% 0px' });
    ['home', 'lavori', 'sport', 'stampa', 'esperienza', 'stage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) navIO.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // ---------- Sport per tutti: the deck spreads into two rows, then each card opens ----------
  (function () {
    var section = document.querySelector('.sport-scroll');
    if (!section) return;
    var track = section.querySelector('.sports-track');
    var grid = section.querySelector('.sports');
    var cards = Array.prototype.slice.call(section.querySelectorAll('.sport'));
    var mq = window.matchMedia('(min-width: 900px) and (min-height: 620px)');
    var rots = [-9, 6, -4, 11];
    var fanX = [-70, 60, -25, 95];
    var fanY = [10, -20, 25, -5];
    var flipY = [-28, 24, -18, 30];
    var offsets = [];
    var on = false;
    var sparked = cards.map(function () { return false; });
    var colors = ['#E5BF63', '#4C65B5', '#8669B7', '#F4E6BE', '#1E8FE0'];

    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function back(t) { var c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

    function measure() {
      // Layout positions without transforms: where each flyer must travel from the middle
      var gw = grid.clientWidth, gh = grid.clientHeight;
      offsets = cards.map(function (c) {
        var m = c.querySelector('.sport-img');
        var mx = m.offsetLeft + m.offsetWidth / 2, my = m.offsetTop + m.offsetHeight / 2;
        c.style.transformOrigin = mx + 'px ' + my + 'px';
        var cx = c.offsetLeft - grid.offsetLeft + mx;
        var cy = c.offsetTop - grid.offsetTop + my;
        return { x: gw / 2 - cx, y: gh / 2 - cy };
      });
    }

    // A burst of little shapes in the flyer colours, from the edge of the flyer that opens
    function sparks(card) {
      if (!card.animate) return;
      var m = card.querySelector('.sport-img').getBoundingClientRect();
      var ox = m.right, oy = m.top + m.height / 2;
      for (var i = 0; i < 26; i++) {
        var d = document.createElement('span');
        d.className = 'spark';
        var size = 5 + Math.random() * 9;
        d.style.width = d.style.height = size + 'px';
        d.style.background = colors[i % colors.length];
        if (i % 3 === 0) d.style.borderRadius = '2px';
        d.style.left = ox + 'px'; d.style.top = oy + 'px';
        document.body.appendChild(d);
        var ang = (Math.random() - 0.5) * Math.PI * 1.3;
        var dist = 60 + Math.random() * 170;
        var tx = Math.cos(ang) * dist, ty = Math.sin(ang) * dist;
        d.animate([
          { transform: 'translate(-50%,-50%) scale(0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(calc(-50% + ' + tx * 0.7 + 'px), calc(-50% + ' + ty * 0.7 + 'px)) scale(1.2) rotate(180deg)', opacity: 1, offset: 0.45 },
          { transform: 'translate(calc(-50% + ' + tx + 'px), calc(-50% + ' + (ty + 50) + 'px)) scale(0) rotate(360deg)', opacity: 0 }
        ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = d.remove.bind(d);
      }
    }

    // One single continuous movement: the scroll only sets a target,
    // the drawn position glides towards it every frame, so wheel steps never show
    var target = 0, cur = 0, raf = 0;
    function progress() {
      var r = track.getBoundingClientRect();
      var span = track.offsetHeight - (window.innerHeight - 48);
      return clamp((48 - r.top) / Math.max(1, span));
    }
    function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); }

    function draw(t) {
      // spread and opening overlap: there is no pause between the two
      var spread = smoothstep(0.05, 0.7, t);
      var open = smoothstep(0.4, 0.95, t);
      var deck = 1 - spread;
      var k = 1 - back(spread);
      section.style.setProperty('--halo', deck.toFixed(4));
      cards.forEach(function (c, i) {
        var o = offsets[i] || { x: 0, y: 0 };
        var scale = 1 + 0.32 * deck;
        var tx = o.x * k + fanX[i] * deck, ty = o.y * k + fanY[i] * deck;
        var rot = rots[i] * 1.4 * deck;
        var ry = Math.sin(Math.PI * spread) * flipY[i];
        c.style.transform = 'perspective(1400px) translate3d(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px,0) rotate(' + rot.toFixed(3) + 'deg) rotateY(' + ry.toFixed(3) + 'deg) scale(' + scale.toFixed(4) + ')';
        c.style.zIndex = spread < 0.999 ? String(cards.length - i) : '';
        c.style.setProperty('--spread', spread.toFixed(4));
        c.style.setProperty('--open', open.toFixed(4));
        c.classList.toggle('is-open', open > 0.6);
        if (open > 0.35 && !sparked[i]) { sparked[i] = true; setTimeout(sparks.bind(null, c), i * 90); }
        if (open < 0.05) sparked[i] = false;
      });
    }
    function tick() {
      raf = 0;
      if (!on) return;
      cur += (target - cur) * 0.085;
      if (Math.abs(target - cur) < 0.0004) cur = target;
      draw(cur);
      if (cur !== target) raf = requestAnimationFrame(tick);
    }
    function render(jump) {
      if (!on) return;
      target = progress();
      if (jump === true) { cur = target; draw(cur); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    }

    function setup() {
      var want = mq.matches && !reduce;
      if (want === on) { if (on) { measure(); render(true); } return; }
      on = want;
      section.classList.toggle('sport-pinned', on);
      cards.forEach(function (c) {
        if (on) { c.classList.add('in'); return; }
        c.style.transform = ''; c.style.zIndex = ''; c.style.transformOrigin = ''; c.style.removeProperty('--open'); c.style.removeProperty('--spread'); c.classList.remove('is-open');
      });
      if (on) { measure(); render(true); }
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    }

    // Phone: no room for the pinned deck, so each card opens on its own as it scrolls into view,
    // with the same effects (tilted flyer that straightens, panel, bar, text, title shine, sparks)
    var mob = false, mraf = 0, mrots = [-8, 7, -5, 9];
    var mobileSparked = cards.map(function () { return false; });
    function mobileDraw() {
      mraf = 0;
      if (!mob) return;
      var vh = window.innerHeight;
      cards.forEach(function (c, i) {
        var r = c.getBoundingClientRect();
        var q = clamp((vh * 0.98 - r.top) / (vh * 0.7));
        var spread = smoothstep(0, 0.6, q), open = smoothstep(0.35, 1, q), k = 1 - spread;
        var img = c.querySelector('.sport-img');
        img.style.transform = 'translate3d(0,' + (50 * k).toFixed(1) + 'px,0) rotate(' + (mrots[i] * k).toFixed(2) + 'deg) scale(' + (0.82 + 0.18 * spread).toFixed(3) + ')';
        c.style.setProperty('--spread', spread.toFixed(3));
        c.style.setProperty('--open', open.toFixed(3));
        if (open > 0.5 && !mobileSparked[i]) { mobileSparked[i] = true; sparks(c); }
        if (open < 0.05) mobileSparked[i] = false;
      });
    }
    function mobileSetup() {
      var want = !mq.matches && !reduce;
      if (want === mob) return;
      mob = want;
      section.classList.toggle('sport-mobile-fx', mob);
      cards.forEach(function (c) {
        if (mob) { c.classList.add('in'); return; }
        var img = c.querySelector('.sport-img');
        img.style.transform = '';
        if (!on) { c.style.removeProperty('--open'); c.style.removeProperty('--spread'); }
      });
      if (mob) mobileDraw();
    }

    setup();
    mobileSetup();
    window.addEventListener('scroll', function () { render(); if (mob && !mraf) mraf = requestAnimationFrame(mobileDraw); }, { passive: true });
    window.addEventListener('resize', function () { setup(); mobileSetup(); if (mob) mobileDraw(); });
    window.addEventListener('load', setup);
    cards.forEach(function (c) {
      var img = c.querySelector('.sport-img img');
      if (img && !img.complete) img.addEventListener('load', function () { if (on) { measure(); render(); } });
    });
  })();

  if (!motion) return;

  /* ===================== MOTION LAYER ===================== */
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll, kept in sync with ScrollTrigger
  var lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    window.__lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
    gsap.ticker.lagSmoothing(0);
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var href = a.getAttribute('href');
      var target = href === '#home' ? 0 : document.querySelector(href);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -56, duration: 1.6 });
    });
  }

  // Letter splitter: words stay unbreakable, each letter gets its own span
  function splitChars(el) {
    var text = el.textContent.trim();
    el.setAttribute('aria-label', text);
    el.textContent = '';
    var chars = [];
    text.split(/\s+/).forEach(function (word, i, arr) {
      var w = document.createElement('span');
      w.className = 'sw';
      w.setAttribute('aria-hidden', 'true');
      Array.from(word).forEach(function (c) {
        var s = document.createElement('span');
        s.className = 'sc';
        s.textContent = c;
        w.appendChild(s);
        chars.push(s);
      });
      el.appendChild(w);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return chars;
  }

  // ---------- Scroll progress + velocity ----------
  gsap.to('.progress', {
    scaleX: 1, ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 0.3 }
  });

  var velocity = 0;
  ScrollTrigger.create({
    trigger: document.body, start: 'top top', end: 'bottom bottom',
    onUpdate: function (self) { velocity = self.getVelocity(); }
  });

  // Elements that lean with scroll speed
  var skewTargets = gsap.utils.toArray('.sheet, .statement');
  var skewSetters = skewTargets.map(function (el) { return gsap.quickTo(el, 'skewY', { duration: 0.5, ease: 'power3' }); });
  gsap.ticker.add(function () {
    var sk = gsap.utils.clamp(-3, 3, velocity / -400);
    skewSetters.forEach(function (fn) { fn(sk); });
    velocity *= 0.9;
  });

  // ---------- Preloader + hero intro ----------
  var heroChars = splitChars(document.querySelector('.hero h1'));
  var pre = document.querySelector('.preloader');
  var num = document.querySelector('.pre-num');
  if (lenis) lenis.stop();
  window.scrollTo(0, 0);

  var shapes = gsap.utils.toArray('.hero-bg .shape');
  var intro = gsap.timeline({ paused: true });
  intro
    .from('.nav', { yPercent: -100, duration: 1, ease: 'expo.out' }, 0)
    .from(heroChars, {
      yPercent: 120, rotateX: -90, opacity: 0, duration: 1.2,
      stagger: { each: 0.04, from: 'center' }, ease: 'expo.out'
    }, 0)
    .from('.hero-kicker', { y: 24, opacity: 0, duration: 0.8, ease: 'power3.out' }, 0.15)
    .from('.hero-lead, .hero-cta', { y: 40, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out' }, 0.35)
    .from(shapes, {
      scale: 0, rotation: -180, opacity: 0, duration: 1.6,
      stagger: 0.07, ease: 'elastic.out(1, .5)'
    }, 0.2)
    .from('.stage-frame', { y: 160, opacity: 0, duration: 1.4, ease: 'expo.out' }, 0.45);

  var count = { v: 0 };
  var load = gsap.timeline({
    onComplete: function () {
      pre.style.display = 'none';
      if (lenis) lenis.start();
    }
  });
  load
    .from('.pre-shape', { scale: 0, rotation: -90, duration: 0.8, stagger: 0.1, ease: 'back.out(2)' }, 0)
    .to(count, {
      v: 100, duration: 1.7, ease: 'power3.inOut',
      onUpdate: function () { num.textContent = Math.round(count.v); }
    }, 0)
    .to('.ps-3', { rotation: 360, duration: 1.7, ease: 'power2.inOut' }, 0)
    .to('.ps-2', { rotation: -270, duration: 1.7, ease: 'power2.inOut' }, 0)
    .to('.pre-inner', { yPercent: -100, duration: 0.9, ease: 'expo.inOut' }, '+=0.1')
    .to('.pre-panel', { yPercent: -100, duration: 1, stagger: 0.08, ease: 'expo.inOut' }, '-=0.6')
    .add(function () { intro.play(); }, '-=0.75');

  // Idle float for the hero shapes (inner layer, so it never fights the mouse or the scroll)
  gsap.utils.toArray('.hero-bg .shape-i').forEach(function (el, i) {
    gsap.to(el, {
      y: gsap.utils.random(-26, 26), x: gsap.utils.random(-14, 14),
      rotation: gsap.utils.random(-40, 40),
      duration: gsap.utils.random(2.6, 4.6), ease: 'sine.inOut',
      yoyo: true, repeat: -1, delay: i * 0.12
    });
  });

  // Each shape drifts at its own speed while the hero scrolls away
  gsap.utils.toArray('.hero-bg .shape-par').forEach(function (el) {
    var speed = parseFloat(el.getAttribute('data-speed'));
    gsap.to(el, {
      y: speed * -600, rotation: speed * 90, ease: 'none',
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
    });
  });

  // Copy floats up and fades faster than the page: classic parallax depth
  gsap.to('.hero-copy', {
    y: -180, opacity: 0, scale: 0.92, ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: '45% top', scrub: true }
  });

  // Hero frame grows into place, its layers slide at different depths
  gsap.fromTo(frame, { scale: 0.86 }, {
    scale: 1, ease: 'none',
    scrollTrigger: { trigger: frame, start: 'top bottom', end: 'top 20%', scrub: true }
  });
  gsap.utils.toArray(par).forEach(function (g) {
    var k = parseFloat(g.getAttribute('data-par'));
    gsap.fromTo(g, { y: k * -300 }, {
      y: k * 500, ease: 'none',
      scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true }
    });
  });
  if (frame.querySelector('.spin')) gsap.to(frame.querySelector('.spin'), { rotation: 360, svgOrigin: '830 250', duration: 24, repeat: -1, ease: 'none' });
  if (frame.querySelector('.spin-slow')) gsap.to(frame.querySelector('.spin-slow'), { rotation: -360, svgOrigin: '700 430', duration: 30, repeat: -1, ease: 'none' });

  // ---------- Mouse: parallax shapes, frame tilt, cursor, magnetic ----------
  if (fine) {
    var mx = 0, my = 0;
    var shapeMovers = shapes.map(function (el, i) {
      var depth = 20 + (i % 4) * 22;
      return {
        depth: depth,
        x: gsap.quickTo(el, 'x', { duration: 1.2, ease: 'power3' }),
        y: gsap.quickTo(el, 'y', { duration: 1.2, ease: 'power3' })
      };
    });
    window.addEventListener('mousemove', function (e) {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      shapeMovers.forEach(function (m, i) {
        var dir = i % 2 ? -1 : 1;
        m.x(mx * m.depth * dir * 2);
        m.y(my * m.depth * dir * 2);
      });
    });

    // Hero frame tilts toward the pointer
    var glare = frame.querySelector('.frame-glare');
    var rx = gsap.quickTo(frame, 'rotationX', { duration: 0.8, ease: 'power3' });
    var ry = gsap.quickTo(frame, 'rotationY', { duration: 0.8, ease: 'power3' });
    gsap.set(frame, { transformPerspective: 1600 });
    frame.addEventListener('mousemove', function (e) {
      var r = frame.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      ry((px - 0.5) * 10);
      rx((0.5 - py) * 8);
      glare.style.setProperty('--gx', px * 100 + '%');
      glare.style.setProperty('--gy', py * 100 + '%');
    });
    frame.addEventListener('mouseleave', function () { rx(0); ry(0); });

    // Custom cursor
    root.classList.add('has-cursor');
    var cursor = document.querySelector('.cursor');
    var dot = cursor.querySelector('.cursor-dot');
    var ring = cursor.querySelector('.cursor-ring');
    var label = cursor.querySelector('.cursor-label');
    var dx = gsap.quickTo(dot, 'x', { duration: 0.08 }), dy = gsap.quickTo(dot, 'y', { duration: 0.08 });
    var cx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' }), cy = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
    window.addEventListener('mousemove', function (e) {
      dx(e.clientX); dy(e.clientY); cx(e.clientX); cy(e.clientY);
      cursor.classList.remove('is-hidden');
    });
    document.addEventListener('mouseleave', function () { cursor.classList.add('is-hidden'); });
    window.addEventListener('mousedown', function () { cursor.classList.add('is-down'); });
    window.addEventListener('mouseup', function () { cursor.classList.remove('is-down'); });
    document.addEventListener('mouseover', function (e) {
      if (e.target.closest('.lightbox')) { cursor.classList.add('is-hidden'); return; }
      var tile = e.target.closest('.tile, .sport-img');
      var link = e.target.closest('a, button:not(.sport-img)');
      var zoom = tile && (tile.classList.contains('sport-img') || e.target.closest('.art-flyers, .art-photo'));
      cursor.classList.toggle('is-view', !!tile && !link);
      cursor.classList.toggle('is-link', !!link);
      label.textContent = tile && !link ? (zoom ? 'Apri' : 'Guarda') : '';
    });

    // Magnetic buttons
    document.querySelectorAll('[data-magnetic], .nav-link').forEach(function (el) {
      var strength = el.classList.contains('btn') ? 0.4 : 0.3;
      var xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      var yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * strength);
        yTo((e.clientY - r.top - r.height / 2) * strength);
      });
      el.addEventListener('mouseleave', function () {
        gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, .3)' });
      });
    });
  }

  // ---------- Statement + quote: words light up with scroll ----------
  wordGroups.forEach(function (g) {
    ScrollTrigger.create({
      trigger: g.el, start: 'top 85%', end: 'bottom 45%', scrub: true,
      onUpdate: function (self) { lightWords(g, self.progress); }
    });
  });

  // ---------- Marquee tapes: endless, pushed by scroll speed ----------
  gsap.utils.toArray('.mq-track').forEach(function (track, i) {
    track.innerHTML += track.innerHTML + track.innerHTML;
    var dir = i % 2 ? 1 : -1;
    var x = 0;
    var skew = gsap.quickTo(track, 'skewX', { duration: 0.4, ease: 'power3' });
    gsap.ticker.add(function (t, dt) {
      var third = track.scrollWidth / 3;
      var boost = Math.abs(velocity) / 40;
      var flip = velocity < -20 ? -1 : 1;
      x += dir * flip * (1.2 + boost) * (dt / 16.67);
      x = gsap.utils.wrap(-third, 0, x);
      gsap.set(track, { x: x });
      skew(gsap.utils.clamp(-14, 14, velocity / 120) * dir);
    });
  });
  gsap.fromTo('.mq-a', { xPercent: -6 }, {
    xPercent: 4, ease: 'none',
    scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: true }
  });
  gsap.fromTo('.mq-b', { xPercent: 6 }, {
    xPercent: -4, ease: 'none',
    scrollTrigger: { trigger: '.marquee', start: 'top bottom', end: 'bottom top', scrub: true }
  });

  // ---------- Section titles: letters rise out of a mask ----------
  document.querySelectorAll('[data-split]:not(.hero h1)').forEach(function (el) {
    var chars = splitChars(el);
    gsap.from(chars, {
      yPercent: 110, rotation: 12, opacity: 0, duration: 1,
      stagger: 0.025, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%' }
    });
    liftOnHover(chars);
  });
  liftOnHover(heroChars);

  // Letters lift a little under the pointer; the neighbours follow, softer
  function liftOnHover(chars) {
    if (!fine) return;
    var setters = chars.map(function (c) { return gsap.quickTo(c, 'y', { duration: 0.45, ease: 'power3' }); });
    chars.forEach(function (c, i) {
      c.addEventListener('mouseenter', function () {
        var h = c.offsetHeight || 40;
        setters.forEach(function (set, j) {
          var d = Math.abs(i - j);
          set(d === 0 ? -h * 0.14 : d === 1 ? -h * 0.06 : d === 2 ? -h * 0.02 : 0);
        });
      });
    });
    var host = chars.length ? chars[0].closest('[data-split]') : null;
    if (host) host.addEventListener('mouseleave', function () {
      setters.forEach(function (set) { set(0); });
    });
  }
  gsap.utils.toArray('.sec-head p').forEach(function (p) {
    gsap.from(p, { y: 30, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: p, start: 'top 90%' } });
  });

  // ---------- Bento tiles ----------
  // Perspective is set once here: tweening it (or stacking it on a parent's) stretches the tiles
  var tiles = gsap.utils.toArray('.tile');
  gsap.set(tiles, { transformPerspective: 1200, opacity: 0, y: 90, clipPath: 'inset(14% 4% 0% 4% round 28px)' });
  gsap.set('.tile .art', { scale: 1.25 });
  ScrollTrigger.batch(tiles, {
    start: 'top 92%',
    once: true,
    onEnter: function (batch) {
      gsap.to(batch, {
        opacity: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 28px)',
        duration: 1.2, stagger: 0.12, ease: 'expo.out',
        onComplete: function () { gsap.set(this.targets(), { clearProps: 'clipPath' }); }
      });
      gsap.to(batch.map(function (t) { return t.querySelector('.art'); }), {
        scale: 1, duration: 1.6, stagger: 0.12, ease: 'expo.out'
      });
    }
  });

  tiles.forEach(function (tile) {
    var art = tile.querySelector('.art svg, .art .art-stage');
    if (art) {
      // Scaled up so the drift never uncovers the edges of the frame
      gsap.fromTo(art, { yPercent: -5, scale: 1.14 }, {
        yPercent: 5, scale: 1.14, ease: 'none',
        scrollTrigger: { trigger: tile, start: 'top bottom', end: 'bottom top', scrub: true }
      });
    }
    if (!fine) return;
    var glare = document.createElement('div');
    glare.className = 'tile-glare';
    tile.appendChild(glare);
    var trx = gsap.quickTo(tile, 'rotationX', { duration: 0.6, ease: 'power3' });
    var try_ = gsap.quickTo(tile, 'rotationY', { duration: 0.6, ease: 'power3' });
    tile.addEventListener('mousemove', function (e) {
      var r = tile.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      try_((px - 0.5) * 7);
      trx((0.5 - py) * 6);
      glare.style.setProperty('--gx', px * 100 + '%');
      glare.style.setProperty('--gy', py * 100 + '%');
    });
    tile.addEventListener('mouseleave', function () { trx(0); try_(0); });
  });

  // ---------- Print band: the black card expands to full bleed ----------
  gsap.fromTo(dark, { clipPath: 'inset(0% 5% 0% 5% round 48px)' }, {
    clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
    scrollTrigger: { trigger: dark, start: 'top bottom', end: 'top 15%', scrub: true }
  });
  gsap.fromTo('.print-svg', { rotation: -8 }, {
    rotation: 6, ease: 'none',
    scrollTrigger: { trigger: '.print', start: 'top bottom', end: 'bottom top', scrub: true }
  });
  gsap.to('.print-halo', { scale: 1.3, opacity: 0.6, duration: 3, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.utils.toArray('.print-steps h3').forEach(function (h) {
    gsap.from(h, { x: 80, opacity: 0, duration: 1, ease: 'expo.out', scrollTrigger: { trigger: h, start: 'top 80%' } });
  });

  // ---------- Experience: ghost word slides across ----------
  gsap.fromTo('.ghost', { xPercent: 10 }, {
    xPercent: -55, ease: 'none',
    scrollTrigger: { trigger: '.band-exp', start: 'top bottom', end: 'bottom top', scrub: true }
  });
  gsap.from('.eyebrow-title', {
    x: -60, opacity: 0, duration: 1, ease: 'expo.out',
    scrollTrigger: { trigger: '.eyebrow-title', start: 'top 85%' }
  });

  // ---------- Spec sheet rows ----------
  gsap.from('.sheet > div', {
    x: -100, opacity: 0, duration: 1, stagger: 0.08, ease: 'expo.out',
    scrollTrigger: { trigger: '.sheet', start: 'top 80%' }
  });

  // ---------- Footer ----------
  gsap.fromTo('.footer-ghost', { yPercent: 60, scale: 0.8 }, {
    yPercent: 0, scale: 1, ease: 'none',
    scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true }
  });
  gsap.from('.contact, .fine', {
    y: 40, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out',
    scrollTrigger: { trigger: '.contact', start: 'top 95%' }
  });

  // Confetti burst in the artwork palette
  function confetti(origin) {
    var r = origin.getBoundingClientRect();
    var ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    var colors = ['#E5BF63', '#4C65B5', '#8669B7', '#25284D', '#F4E6BE'];
    for (var i = 0; i < 70; i++) {
      var c = document.createElement('div');
      c.className = 'confetti';
      c.style.background = colors[i % colors.length];
      if (i % 3 === 0) c.style.borderRadius = '50%';
      document.body.appendChild(c);
      var angle = Math.random() * Math.PI * 2;
      var dist = 120 + Math.random() * 260;
      gsap.set(c, { x: ox, y: oy, rotation: Math.random() * 360 });
      gsap.timeline({ onComplete: c.remove.bind(c) })
        .to(c, { x: ox + Math.cos(angle) * dist, y: oy + Math.sin(angle) * dist - 120, rotation: '+=' + (Math.random() * 720 - 360), duration: 0.8, ease: 'power3.out' })
        .to(c, { y: '+=' + (260 + Math.random() * 200), rotationX: 720, opacity: 0, duration: 1.4, ease: 'power1.in' });
    }
  }

  // Fonts and images can shift layout after load
  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
