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
        if (motion) stepFx(svg, e.target.getAttribute('data-step'));
      });
    // On phones the diagram covers the top ~half of the screen, so steps activate lower down
    }, { rootMargin: window.matchMedia('(max-width: 760px)').matches ? '-75% 0px -20% 0px' : '-45% 0px -45% 0px' });
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
    ['home', 'lavori', 'stampa', 'esperienza', 'stage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) navIO.observe(el);
    });
  } else {
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
  }

  // Tiles open into a full view; the artwork flies from the tile to the centre and back
  var lb = document.querySelector('.lightbox');
  var lbArt = lb.querySelector('.lb-art');
  var lbText = lb.querySelector('.lb-text');
  var lbBackdrop = lb.querySelector('.lb-backdrop');
  var lbClose = lb.querySelector('.lb-close');
  var lbSource = null, lbOpener = null, lbBusy = false;

  // Offset and scale that place the lightbox art exactly over the tile art
  function flipFrom(src) {
    var s = src.getBoundingClientRect(), l = lbArt.getBoundingClientRect();
    return {
      x: s.left + s.width / 2 - (l.left + l.width / 2),
      y: s.top + s.height / 2 - (l.top + l.height / 2),
      scale: s.width / l.width
    };
  }

  function openTile(tile, opener) {
    if (lbBusy || !lb.hidden) return;
    var art = tile.querySelector('.art');
    var svg = art.querySelector('svg').cloneNode(true);
    svg.removeAttribute('style');
    svg.setAttribute('data-anim', art.getAttribute('data-anim'));
    // Start the copy at rest, whatever state the tile's hover gesture was in
    svg.querySelectorAll('[class^="a-"]').forEach(function (g) { g.removeAttribute('style'); g.removeAttribute('transform'); });
    lbArt.innerHTML = '';
    lbArt.appendChild(svg);
    lb.querySelector('.lb-kind').textContent = tile.querySelector('.tile-kind').textContent;
    lb.querySelector('#lb-title').textContent = tile.querySelector('h3').textContent;
    lb.querySelector('.lb-desc').textContent = tile.querySelector('.tile-text > p:last-child').textContent;

    // Same aspect as the tile art, so the flight is a uniform scale with no stretching
    var r = art.getBoundingClientRect();
    var ar = r.width / r.height;
    var w = Math.min(window.innerWidth - 32, 1000, (window.innerHeight - 220) * ar);
    lbArt.style.width = w + 'px';
    lbArt.style.height = w / ar + 'px';
    lbText.style.width = w + 'px';

    lbSource = art; lbOpener = opener;
    lb.hidden = false;
    root.classList.add('lb-open');
    if (lenis) lenis.stop();
    lbClose.focus({ preventScroll: true });

    if (!motion) return;
    lbBusy = true;
    art.style.visibility = 'hidden';
    gsap.set(lbArt, { clearProps: 'transform' });
    gsap.fromTo(lbArt, flipFrom(art), {
      x: 0, y: 0, scale: 1, duration: 0.6, ease: 'expo.out',
      onComplete: function () { lbBusy = false; artTimeline(svg).play(); }
    });
    gsap.fromTo(lbBackdrop, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
    gsap.fromTo([lbText, lbClose], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.2, stagger: 0.06, ease: 'power3.out' });
  }

  function closeTile() {
    if (lbBusy || lb.hidden) return;
    function done() {
      lb.hidden = true;
      lbSource.style.visibility = '';
      root.classList.remove('lb-open');
      if (lenis) lenis.start();
      if (lbOpener) lbOpener.focus({ preventScroll: true });
      lbBusy = false;
    }
    if (!motion) return done();
    lbBusy = true;
    gsap.to([lbText, lbClose], { opacity: 0, duration: 0.2, ease: 'power2.out' });
    gsap.to(lbBackdrop, { opacity: 0, duration: 0.45, ease: 'power2.inOut' });
    gsap.to(lbArt, Object.assign(flipFrom(lbSource), { duration: 0.5, ease: 'power3.inOut', onComplete: done }));
  }

  document.querySelectorAll('.tile').forEach(function (tile) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile-open';
    b.setAttribute('aria-label', 'Apri ' + tile.querySelector('h3').textContent);
    b.addEventListener('click', function () { openTile(tile, b); });
    tile.appendChild(b);
  });
  lbClose.addEventListener('click', closeTile);
  lbBackdrop.addEventListener('click', closeTile);
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeTile();
    if (e.key === 'Tab') { e.preventDefault(); lbClose.focus(); }
  });

  if (!motion) return;

  /* ===================== MOTION LAYER ===================== */
  gsap.registerPlugin(ScrollTrigger);

  // Smooth scroll, kept in sync with ScrollTrigger
  var lenis = null;
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
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

  // Letters hop when touched: the hovered one jumps highest, neighbours follow
  function hop(c, amt, delay) {
    gsap.killTweensOf(c, 'yPercent');
    gsap.timeline({ delay: delay })
      .to(c, { yPercent: -amt, duration: 0.22, ease: 'power2.out' })
      .to(c, { yPercent: 0, duration: 0.7, ease: 'elastic.out(1, .4)' });
  }
  function introDone() { return intro.progress() === 1; }
  if (fine) {
    heroChars.forEach(function (c, i) {
      c.addEventListener('mouseenter', function () {
        if (!introDone()) return;
        for (var d = -2; d <= 2; d++) {
          var n = heroChars[i + d];
          if (n) hop(n, 30 / (1 + Math.abs(d) * 1.4), Math.abs(d) * 0.04);
        }
      });
    });
  }
  document.querySelector('.hero h1').addEventListener('click', function () {
    if (!introDone()) return;
    heroChars.forEach(function (c, i) { hop(c, 26, i * 0.03); });
  });

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
  gsap.to(frame.querySelector('.spin'), { rotation: 360, svgOrigin: '830 250', duration: 24, repeat: -1, ease: 'none' });
  gsap.to(frame.querySelector('.spin-slow'), { rotation: -360, svgOrigin: '700 430', duration: 30, repeat: -1, ease: 'none' });

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
      var tile = e.target.closest('.tile');
      var link = e.target.closest('a, button:not(.tile-open)');
      cursor.classList.toggle('is-view', !!tile && !link);
      cursor.classList.toggle('is-link', !!link);
      label.textContent = tile && !link ? 'Guarda' : '';
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
  });
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
    var art = tile.querySelector('.art svg');
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

  // Each artwork has its own little gesture: on hover with a mouse, once on scroll with touch
  tiles.forEach(function (tile) {
    var svg = tile.querySelector('.art svg');
    var tl = artTimeline(svg);
    if (fine) {
      tile.addEventListener('mouseenter', function () { tl.play(); });
      tile.addEventListener('mouseleave', function () { tl.reverse(); });
    } else {
      ScrollTrigger.create({
        trigger: tile, start: 'top 55%', once: true,
        onEnter: function () { tl.play(); gsap.delayedCall(1.6, function () { tl.reverse(); }); }
      });
    }
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
  gsap.fromTo('.ghost', { xPercent: 10, backgroundPosition: '100% 0' }, {
    xPercent: -55, backgroundPosition: '0% 0', ease: 'none',
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

  gsap.utils.toArray('.sheet ul').forEach(function (ul) {
    gsap.from(ul.children, {
      y: 14, opacity: 0, duration: 0.6, stagger: 0.06, ease: 'power3.out',
      scrollTrigger: { trigger: ul, start: 'top 85%' }
    });
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

  // Paused, reversible gesture for one artwork (tile or its lightbox copy)
  function artTimeline(svg) {
    var tl = gsap.timeline({ paused: true, defaults: { duration: 0.7, ease: 'back.out(1.6)' } });
    var q = function (sel) { return svg.querySelector(sel); };
    switch (svg.parentNode.getAttribute('data-anim') || svg.getAttribute('data-anim')) {
      case 'ball':
        tl.to(q('.a-ball'), { rotation: 90, svgOrigin: '360 150', duration: 0.9 }, 0)
          .to(q('.a-ball'), { y: -14, duration: 0.35, ease: 'power2.out' }, 0)
          .to(q('.a-ball'), { y: 0, duration: 0.6, ease: 'bounce.out' }, 0.35)
          .to(q('.a-bar'), { y: -10, rotation: 2, svgOrigin: '100 280' }, 0.05)
          .to(q('.a-dots'), { x: -12 }, 0.1);
        break;
      case 'fan':
        tl.to(q('.a-f1'), { x: -20, rotation: -7, svgOrigin: '102 224' }, 0)
          .to(q('.a-f2'), { y: -16 }, 0.04)
          .to(q('.a-f3'), { x: 20, rotation: 7, svgOrigin: '378 224' }, 0.08);
        break;
      case 'logo':
        tl.to(q('.a-tri'), { rotation: 120, svgOrigin: '150 124', duration: 0.9 }, 0)
          .to(q('.a-sun'), { scale: 1.08, svgOrigin: '150 128' }, 0);
        break;
      case 'icons':
        svg.querySelectorAll('.a-ico').forEach(function (g, i) {
          tl.to(g, { scale: 1.14, rotation: i % 2 ? 8 : -8, svgOrigin: g.getAttribute('data-c'), duration: 0.5, ease: 'back.out(2.4)' }, i * 0.07);
        });
        break;
      case 'print':
        tl.to(q('.a-page'), { y: -10, duration: 0.6, ease: 'power3.out' }, 0)
          .to(q('.a-dash'), { scale: 1.05, svgOrigin: '150 150', strokeDashoffset: -39 }, 0);
        break;
    }
    return tl;
  }

  // Step 3 counts up to 300 dpi while the pixel grain clears (steps 1 and 2 are CSS)
  function stepFx(svg, step) {
    if (step === '3') {
      var dpi = svg.querySelector('.l-dpi');
      gsap.killTweensOf(dpi.__count || {});
      var n = dpi.__count = { v: 72 };
      gsap.to(n, { v: 300, duration: 1.4, ease: 'power2.inOut', onUpdate: function () { dpi.textContent = Math.round(n.v) + ' dpi'; } });
      gsap.fromTo(svg.querySelector('.l-pix'), { opacity: 0.9 }, { opacity: 0, duration: 1.4, ease: 'power2.inOut', overwrite: true });
    }
  }

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
