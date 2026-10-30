/* ==========================================================================
   script.js — renders the timeline from timeline-data.js and wires every
   scroll-linked effect through Anime.js v4's onScroll().

   How the scroll sync works (details in README-style comments below):
   ─ Each chapter <section> is made (100vh + horizontal travel) tall.
   ─ Its child ".chapter__pin" is position: sticky, so it stays on screen for
     exactly `travel` pixels of scrolling.
   ─ onScroll({ target: section, enter: 'top top', leave: 'bottom bottom',
     sync: true }) maps THAT scroll window (0 → 1) directly onto the playhead
     of an Anime.js timeline. No time, no autoplay: scroll position IS the
     animation's currentTime, so it freezes, scrubs and reverses with the wheel.
   ─ Everything is built in ONE place (createAnimations) and torn down in ONE
     place (teardown), so a resize simply rebuilds with fresh measurements.
   ========================================================================== */
(function () {
  'use strict';

  if (!window.anime || typeof window.anime.onScroll !== 'function') {
    console.error('[timeline] Anime.js v4 was not loaded (window.anime.onScroll missing).');
    return;
  }

  const { animate, createTimeline, onScroll } = window.anime;
  const CFG = window.TIMELINE_CONFIG || { chapters: [] };
  const CHAPTERS = CFG.chapters || [];
  const SPEED = Number(CFG.scrollSpeed) > 0 ? Number(CFG.scrollSpeed) : 1;
  const DEBUG = /[?&]debug\b/.test(location.search);   // add ?debug to see Anime.js threshold markers
  const D = 1000;                                       // timeline length in "units"; progress = time / D

  /* ----------------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const mqPinned = window.matchMedia('(min-width: 820px) and (min-height: 500px)');
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const getMode = () => (mqPinned.matches && !mqReduce.matches ? 'pinned' : 'stacked');

  try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }

  /* ----------------------------------------------------------------------
     State
     ---------------------------------------------------------------------- */
  const state = {
    mode: 'stacked',
    reduced: false,
    chapters: [],        // DOM refs + measurements per chapter
    items: [],           // rail milestones
    starts: [],          // absolute scrollY where each chapter section begins
    ends: [],
    maxScroll: 1,
    runtimes: [],        // every { anim, observer } we created, for teardown
    railSig: '',
    lastW: 0,
  };

  const els = {
    experience: $('#experience'),
    hero: $('#hero'),
    chapters: $('#chapters'),
    closing: $('#closing'),
    rail: $('#rail'),
    railList: $('#railList'),
    railFill: $('#railFill'),
  };

  /* ----------------------------------------------------------------------
     Rendering (data → DOM)
     ---------------------------------------------------------------------- */
  function renderHero() {
    const h = CFG.hero || {};
    els.hero.setAttribute('aria-labelledby', 'heroTitle');
    els.hero.innerHTML = `
      <div class="hero__fog" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="hero__inner">
        <p class="eyebrow">${esc(h.eyebrow)}</p>
        <h1 class="hero__title" id="heroTitle">${esc(h.title)}</h1>
        <p class="hero__sub">${esc(h.subtitle)}</p>
      </div>
      <div class="hero__cue" aria-hidden="true">
        <span class="cue--pinned">${esc(h.instruction)}</span>
        <span class="cue--stacked">${esc(h.instructionStacked || h.instruction)}</span>
        <i class="hero__line"></i>
      </div>`;
  }

  function chapterHTML(c, i, n) {
    const id = `chapter-${i + 1}`;
    const num = pad(i + 1);
    const media = c.src
      ? `<div class="frame__media"><div class="ph" aria-hidden="true"></div><img src="${esc(c.src)}" alt="${esc(c.alt || c.title)}" width="${esc(c.width || 1600)}" height="${esc(c.height || 1200)}" loading="lazy" decoding="async"></div>`
      : `<div class="frame__media" role="img" aria-label="${esc(c.alt || 'Placeholder image for ' + c.title)}"><div class="ph" aria-hidden="true"><span class="ph__tag">Image ${num}</span></div></div>`;

    const text = `
      <div class="panel panel--text">
        <p class="eyebrow"><span>Chapter ${num}</span><span class="rule" aria-hidden="true"></span><span>${esc(c.date)}</span></p>
        <h2 class="chapter__title" id="${id}-title">${esc(c.title)}</h2>
        <p class="chapter__desc">${esc(c.description)}</p>
        ${c.location ? `<p class="chapter__meta">${esc(c.location)}</p>` : ''}
      </div>`;
    const image = `
      <figure class="panel panel--image">
        <div class="frame">${media}</div>
        ${c.caption ? `<figcaption>${esc(c.caption)}</figcaption>` : ''}
      </figure>`;
    const coda = `
      <div class="panel panel--coda" aria-hidden="true">
        <span class="coda__num">${num}</span>
        ${c.label ? `<span class="coda__label">${esc(c.label)}</span>` : ''}
        ${c.location ? `<span class="coda__loc">${esc(c.location)}</span>` : ''}
      </div>`;

    const layout = ['text-first', 'image-first', 'panorama'].includes(c.layout) ? c.layout : 'text-first';
    const panels = layout === 'image-first' ? image + text + coda : text + image + coda;
    const style = c.accent ? ` style="--accent:${esc(c.accent)}"` : '';

    return `
      <section class="chapter chapter--${layout}" id="${id}" aria-labelledby="${id}-title" data-index="${i}"${style}>
        <div class="chapter__pin">
          <i class="veil veil--in" aria-hidden="true"></i>
          <i class="veil veil--out" aria-hidden="true"></i>
          <div class="chapter__hud" aria-hidden="true">
            <span class="hud__num">${num}</span><span>/ ${pad(n)}</span><span class="hud__bar"><i></i></span>
          </div>
          <div class="chapter__track">${panels}</div>
        </div>
      </section>`;
  }

  function renderChapters() {
    els.chapters.innerHTML = CHAPTERS.map((c, i) => chapterHTML(c, i, CHAPTERS.length)).join('');
    state.chapters = Array.from(els.chapters.querySelectorAll('.chapter')).map((el) => {
      const panels = Array.from($('.chapter__track', el).children);
      return {
        el,
        pin: $('.chapter__pin', el),
        track: $('.chapter__track', el),
        panels,
        imagePanel: $('.panel--image', el),
        textPanel: $('.panel--text', el),
        frame: $('.frame', el),
        media: $('.frame__media', el),
        ghost: $('.coda__num', el),
        hudBar: $('.hud__bar i', el),
        veilIn: $('.veil--in', el),
        veilOut: $('.veil--out', el),
        distance: 0,
      };
    });
    // A broken image falls back to the CSS placeholder that sits underneath it.
    els.chapters.querySelectorAll('.frame__media img').forEach((img) =>
      img.addEventListener('error', () => img.remove(), { once: true })
    );
  }

  function renderClosing() {
    const c = CFG.closing || {};
    els.closing.setAttribute('aria-labelledby', 'closingTitle');
    els.closing.innerHTML = `
      <div class="closing__inner">
        <p class="eyebrow">${esc(c.eyebrow)}</p>
        <h2 class="closing__title" id="closingTitle">${esc(c.title)}</h2>
        <p class="closing__text">${esc(c.text)}</p>
        <button class="closing__restart" type="button">${esc(c.restart || 'Back to the beginning')}</button>
      </div>`;
    $('.closing__restart', els.closing).addEventListener('click', () => scrollToY(0));
  }

  function renderRail() {
    els.railList.innerHTML = CHAPTERS.map(
      (c, i) => `
      <li class="rail__item" data-index="${i}">
        <button class="rail__btn" type="button" aria-label="Go to chapter ${i + 1} of ${CHAPTERS.length}: ${esc(c.title)}">
          <span class="rail__dot" aria-hidden="true"></span>
          <span class="rail__label" aria-hidden="true">${pad(i + 1)} · ${esc(c.title)}</span>
        </button>
      </li>`
    ).join('');
    state.items = Array.from(els.railList.children).map((li, i) => {
      const btn = $('.rail__btn', li);
      btn.addEventListener('click', () => scrollToY(state.starts[i]));
      return { li, btn };
    });
    els.rail.hidden = CHAPTERS.length === 0;
  }

  /* ----------------------------------------------------------------------
     Navigation
     ---------------------------------------------------------------------- */
  function scrollToY(y) {
    window.scrollTo({ top: Math.max(0, y), behavior: mqReduce.matches ? 'auto' : 'smooth' });
  }

  /* ----------------------------------------------------------------------
     Measurement — the ONLY place sizes are read/written
     ---------------------------------------------------------------------- */
  function layout() {
    const pinned = state.mode === 'pinned';
    const vh = window.innerHeight;
    const root = document.documentElement;
    root.dataset.mode = state.mode;
    root.style.setProperty('--vh', vh + 'px');

    state.chapters.forEach((ch) => ch.el.style.removeProperty('--chapter-h'));

    if (pinned) {
      // 1) read: how far must each track travel? = real content width − visible width
      state.chapters.forEach((ch) => {
        ch.distance = Math.max(0, ch.track.offsetWidth - ch.pin.clientWidth);
      });
      // 2) write: section height = one screen + the travel (× speed) → that is the pinned scroll length
      state.chapters.forEach((ch) => {
        ch.el.style.setProperty('--chapter-h', Math.round(vh + ch.distance * SPEED) + 'px');
      });
    } else {
      state.chapters.forEach((ch) => { ch.distance = 0; });
    }

    const sy = window.scrollY;
    state.starts = state.chapters.map((ch) => Math.round(ch.el.getBoundingClientRect().top + sy));
    state.ends = state.chapters.map((ch, i) => state.starts[i] + ch.el.offsetHeight);
    state.maxScroll = Math.max(1, root.scrollHeight - vh);

    // Milestones sit where the rail fill is when that chapter becomes "active".
    state.items.forEach((it, i) => {
      const p = clamp01((state.starts[i] - vh * 0.5) / state.maxScroll);
      it.li.style.top = (Math.min(0.96, Math.max(0.04, p)) * 100).toFixed(3) + '%';
    });
  }

  /* ----------------------------------------------------------------------
     Scroll-linked animations — the ONLY place onScroll() is called
     ---------------------------------------------------------------------- */
  function link(settings) {
    return onScroll(Object.assign({ sync: true, debug: DEBUG }, settings));
  }
  function remember(anim, observer) {
    state.runtimes.push({ anim, observer });
    return anim;
  }

  function createAnimations() {
    const reduced = state.reduced;

    // Rail progress: fills as the whole experience scrolls by (always on; it's an indicator, not motion).
    {
      const observer = link({
        target: els.experience,
        enter: 'top top',
        leave: 'bottom bottom',
        onUpdate: updateRail,
        onEnter: updateRail,
        onLeave: updateRail,
      });
      remember(animate(els.railFill, { scaleY: [0, 1], ease: 'linear', autoplay: observer }), observer);
    }
    if (reduced) return;

    // Hero fades and drifts away as it scrolls out.
    {
      const observer = link({ target: els.hero, enter: 'top top', leave: 'top center' });
      remember(animate($('.hero__inner', els.hero), { opacity: [1, 0], y: [0, -70], ease: 'linear', autoplay: observer }), observer);
    }

    // Closing scene settles in as the page comes to rest.
    {
      const observer = link({ target: els.closing, enter: 'bottom top', leave: 'center center' });
      remember(animate($('.closing__inner', els.closing), { opacity: [0, 1], y: [48, 0], ease: 'linear', autoplay: observer }), observer);
    }

    state.chapters.forEach(state.mode === 'pinned' ? buildPinnedChapter : buildStackedChapter);
  }

  /* Pinned: the track pans horizontally, scrubbed by vertical scroll ---------- */
  function buildPinnedChapter(ch) {
    const d = ch.distance;
    const vw = ch.pin.clientWidth;
    // Progress (0‒1) at which an element whose left edge sits at `left` (px inside the track)
    // reaches screen x = `screenX`, given the track is translated by −d·progress.
    const at = (left, screenX) => (d > 0 ? clamp01((left - screenX) / d) : 0);

    const observer = link({ target: ch.el, enter: 'top top', leave: 'bottom bottom' });
    const tl = createTimeline({ defaults: { ease: 'linear', duration: D }, autoplay: observer });

    // 1. The pan itself: 0 → −distance, directly proportional to scroll.
    tl.add(ch.track, { x: [0, -d] }, 0);

    // 2. Chapter HUD progress line.
    tl.add(ch.hudBar, { scaleX: [0, 1] }, 0);

    // 3. Image parallax + restrained scale (media is oversized in CSS terms via scale, so edges never show).
    tl.add(ch.media, { x: ['-3%', '3%'], scale: [1.18, 1.1] }, 0);

    // 4. Image reveal: a clip wipe timed to the moment the frame actually enters the screen.
    {
      const left = ch.imagePanel.offsetLeft;
      let p0 = at(left, vw * 0.92);
      let p1 = at(left, vw * 0.5);
      if (p1 - p0 < 0.12) p1 = Math.min(1, p0 + 0.3);   // already on screen at the start → ease in over the first 30%
      tl.add(
        ch.frame,
        { clipPath: ['inset(0% 24% 0% 0%)', 'inset(0% 0% 0% 0%)'], duration: Math.max(60, (p1 - p0) * D) },
        p0 * D
      );
    }

    // 5. Every panel except the last dims as it slides off the left edge.
    ch.panels.forEach((panel, k) => {
      if (k === ch.panels.length - 1) return;
      const right = panel.offsetLeft + panel.offsetWidth;
      const a = at(right, vw * 0.34);
      const b = at(right, vw * 0.04);
      if (a >= 1 || b - a < 0.03) return;
      tl.add(panel, { opacity: [1, 0.1], duration: (b - a) * D }, a * D);
    });

    // 6. The outlined numeral drifts vertically against the pan.
    tl.add(ch.ghost, { y: [36, -36] }, 0);

    remember(tl, observer);

    // Soft transitions between chapters: a dark veil lifts as a chapter arrives and returns as it leaves.
    const inObs = link({ target: ch.el, enter: 'bottom top', leave: 'top top' });
    remember(animate(ch.veilIn, { opacity: [0.92, 0], ease: 'linear', autoplay: inObs }), inObs);
    const outObs = link({ target: ch.el, enter: 'bottom bottom', leave: 'bottom top' });
    remember(animate(ch.veilOut, { opacity: [0, 0.92], ease: 'linear', autoplay: outObs }), outObs);
  }

  /* Stacked: lighter vertical reveals (phones, short screens) ------------------ */
  function buildStackedChapter(ch) {
    // Image: wipe open + gentle parallax while it crosses the screen.
    const revealObs = link({ target: ch.imagePanel, enter: 'bottom top', leave: 'center top' });
    remember(
      animate(ch.frame, { clipPath: ['inset(10% 6% 10% 6%)', 'inset(0% 0% 0% 0%)'], ease: 'linear', autoplay: revealObs }),
      revealObs
    );
    const parallaxObs = link({ target: ch.imagePanel, enter: 'bottom top', leave: 'top bottom' });
    remember(animate(ch.media, { y: ['-4%', '4%'], scale: [1.14, 1.1], ease: 'linear', autoplay: parallaxObs }), parallaxObs);

    // Text: rises and brightens as it approaches the middle of the screen.
    const textObs = link({ target: ch.textPanel, enter: 'bottom top', leave: 'center top' });
    remember(animate(ch.textPanel, { opacity: [0, 1], y: [30, 0], ease: 'linear', autoplay: textObs }), textObs);
  }

  function teardown() {
    state.runtimes.forEach(({ anim, observer }) => {
      try { anim.revert(); } catch (e) { /* already reverted */ }
      try { observer.revert(); } catch (e) { /* already reverted */ }
    });
    state.runtimes = [];
  }

  /* ----------------------------------------------------------------------
     Rail state (active / completed milestones)
     ---------------------------------------------------------------------- */
  function updateRail() {
    const mid = window.scrollY + window.innerHeight * 0.5;
    let active = -1;
    let done = 0;
    for (let i = 0; i < state.items.length; i++) {
      if (mid >= state.ends[i]) done++;
      else if (mid >= state.starts[i]) active = i;
    }
    const sig = active + '|' + done;
    if (sig === state.railSig) return;
    state.railSig = sig;
    state.items.forEach((it, i) => {
      it.li.classList.toggle('is-active', i === active);
      it.li.classList.toggle('is-done', i < done);
      if (i === active) it.btn.setAttribute('aria-current', 'step');
      else it.btn.removeAttribute('aria-current');
    });
  }

  /* ----------------------------------------------------------------------
     Build / rebuild (initial load, resize, mode change)
     ---------------------------------------------------------------------- */
  function captureAnchor() {
    if (!state.starts.length) return null;
    const y = window.scrollY;
    const last = state.starts.length - 1;
    for (let i = 0; i <= last; i++) {
      if (y >= state.starts[i] && y < state.ends[i]) {
        return { type: 'chapter', i, frac: (y - state.starts[i]) / Math.max(1, state.ends[i] - state.starts[i]) };
      }
    }
    if (y >= state.ends[last]) return { type: 'end', fromBottom: state.maxScroll - y };
    return { type: 'top', y };
  }

  function restoreAnchor(a) {
    if (!a) return;
    let y = window.scrollY;
    if (a.type === 'chapter') y = state.starts[a.i] + a.frac * (state.ends[a.i] - state.starts[a.i]);
    else if (a.type === 'end') y = state.maxScroll - a.fromBottom;
    else y = a.y;
    window.scrollTo({ top: y, behavior: 'instant' });
  }

  function rebuild() {
    const anchor = captureAnchor();
    teardown();
    state.reduced = mqReduce.matches;
    state.mode = getMode();
    state.lastW = window.innerWidth;
    state.lastH = window.innerHeight;
    layout();
    createAnimations();
    restoreAnchor(anchor);
    state.railSig = '';
    updateRail();
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth;
      // Phones fire resize when the URL bar collapses (height only). Stacked layout doesn't depend on height.
      if (state.mode === 'stacked' && getMode() === 'stacked' && w === state.lastW) return;
      rebuild();
    }, 180);
  }

  /* ----------------------------------------------------------------------
     Boot
     ---------------------------------------------------------------------- */
  renderHero();
  renderChapters();
  renderClosing();
  renderRail();
  rebuild();

  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  const onMq = () => rebuild();
  [mqPinned, mqReduce].forEach((mq) =>
    mq.addEventListener ? mq.addEventListener('change', onMq) : mq.addListener(onMq)
  );
  // Late layout changes (webfonts, images) → re-measure once.
  window.addEventListener('load', () => rebuild(), { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rebuild());

  // Small debugging handle: window.MemoryTimeline.state / .rebuild()
  window.MemoryTimeline = { state, rebuild };
})();
