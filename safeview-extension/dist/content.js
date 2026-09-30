// SafeView içerik betiği. Güvenli varsayılan: CSS her görseli bulanık tutar (content.css);
// bu betik yalnızca sınıflandırıcı "güvenli" dediğinde data-sv-ok ekleyerek bulanıklığı kaldırır.
(() => {
  if (window.__safeviewLoaded) return;
  window.__safeviewLoaded = true;

  const THRESHOLDS = { high: 0.25, medium: 0.45, low: 0.65 };
  const MIN_SIZE = 64;          // bundan küçük görseller (ikon, logo) taranmaz
  const VIDEO_INTERVAL_MS = 600;
  const CONCURRENCY = 4;

  let enabled = true;
  let threshold = THRESHOLDS.high;

  const urlResults = new Map(); // url -> risk (0..1)
  const state = new WeakMap();  // element -> { key }
  const badEls = new Set();

  const riskOf = (s) => (s.Porn || 0) + (s.Hentai || 0) + (s.Sexy || 0);
  const sendOnce = (msg) => new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? null : r)); }
    catch (_) { resolve(null); }
  });
  // Servis çalışanı uykudayken ilk mesaj kaybolabilir; kısa aralıklarla tekrar dene.
  async function send(msg) {
    let res = null;
    for (let i = 0; i < 3; i++) {
      res = await sendOnce(msg);
      if (res && res.ok) return res;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
    return res;
  }

  function applySettings(s) {
    enabled = s.enabled !== false;
    threshold = THRESHOLDS[s.sensitivity] ?? THRESHOLDS.high;
    document.documentElement.classList.toggle('sv-off', !enabled);
    if (enabled) rescanAll();
  }
  chrome.storage.sync.get(['enabled', 'sensitivity'], applySettings);
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === 'sync') chrome.storage.sync.get(['enabled', 'sensitivity'], applySettings);
  });
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.type === 'get-stats') { sendResponse({ blurred: badEls.size }); }
  });

  // ---- iş kuyruğu ----
  const queue = [];
  let running = 0;
  function enqueue(fn) { queue.push(fn); pump(); }
  function pump() {
    while (running < CONCURRENCY && queue.length) {
      const fn = queue.shift();
      running++;
      fn().catch(() => {}).finally(() => { running--; pump(); });
    }
  }

  function markOk(el) { el.setAttribute('data-sv-ok', ''); el.removeAttribute('data-sv-bad'); badEls.delete(el); }
  function markBad(el) { el.removeAttribute('data-sv-ok'); el.setAttribute('data-sv-bad', ''); badEls.add(el); }

  function drawToDataUrl(source, w, h) {
    const scale = Math.min(1, 299 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85); // kirli (tainted) canvas'ta SecurityError fırlatır
  }

  // Bir URL'nin riskini hesaplar. Başarısızsa null (= bulanık kalır).
  async function riskForUrl(url, imgEl) {
    if (urlResults.has(url)) return urlResults.get(url);
    let res = null;
    const isHttp = /^https?:/i.test(url);
    if (isHttp) res = await send({ type: 'classify-url', url });
    if ((!res || !res.ok) && imgEl) {
      try {
        const dataUrl = drawToDataUrl(imgEl, imgEl.naturalWidth, imgEl.naturalHeight);
        res = await send({ type: 'classify-data', dataUrl });
      } catch (_) { /* tainted: doğrulanamadı */ }
    }
    if (!res || !res.ok) return null;
    const risk = res.skip ? 0 : riskOf(res.scores);
    urlResults.set(url, risk);
    return risk;
  }

  // ---- <img> ----
  function processImg(img) {
    const url = img.currentSrc || img.src;
    if (!url) return;
    const st = state.get(img);
    if (st && st.key === url) return;
    state.set(img, { key: url });
    img.removeAttribute('data-sv-ok');
    if (!img.complete || !img.naturalWidth) {
      img.addEventListener('load', () => processImg(img), { once: true });
      return;
    }
    const r = img.getBoundingClientRect();
    if (Math.max(img.naturalWidth, r.width) < MIN_SIZE && Math.max(img.naturalHeight, r.height) < MIN_SIZE) { markOk(img); return; }
    enqueue(async () => {
      const risk = await riskForUrl(url, img);
      if ((img.currentSrc || img.src) !== url) return; // bu arada kaynak değişti
      if (risk === null) return; // doğrulanamadı -> bulanık kal
      risk >= threshold ? markBad(img) : markOk(img);
    });
  }

  // ---- arka plan görselleri ----
  function processBg(el) {
    const bg = getComputedStyle(el).backgroundImage;
    const m = bg && bg.match(/url\((['"]?)(.*?)\1\)/);
    if (!m) return;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) return;
    let url;
    try { url = new URL(m[2], document.baseURI).href; } catch (_) { return; }
    const st = state.get(el);
    if (st && st.key === url) return;
    state.set(el, { key: url });
    el.setAttribute('data-sv-bg', '');
    el.removeAttribute('data-sv-ok');
    enqueue(async () => {
      const risk = await riskForUrl(url, null);
      if (risk === null) return;
      risk >= threshold ? markBad(el) : markOk(el);
    });
  }

  // ---- <video> ----
  const videoTimers = new WeakMap();
  function processVideo(v) {
    if (videoTimers.has(v)) return;
    const tick = async () => {
      if (!enabled) return;
      if (v.readyState >= 2 && !v.paused && v.videoWidth) {
        const r = v.getBoundingClientRect();
        if (r.width < MIN_SIZE && r.height < MIN_SIZE) { markOk(v); return; }
        let dataUrl;
        try { dataUrl = drawToDataUrl(v, v.videoWidth, v.videoHeight); } catch (_) { return; } // doğrulanamadı -> bulanık
        const res = await send({ type: 'classify-data', dataUrl });
        if (res && res.ok) riskOf(res.scores) >= threshold ? markBad(v) : markOk(v);
      } else if (v.readyState >= 2 && v.paused && v.videoWidth && !v.hasAttribute('data-sv-ok') && !v.hasAttribute('data-sv-bad')) {
        // durdurulmuş ama kare hazır: bir kez tara (poster/ilk kare)
        try {
          const res = await send({ type: 'classify-data', dataUrl: drawToDataUrl(v, v.videoWidth, v.videoHeight) });
          if (res && res.ok) riskOf(res.scores) >= threshold ? markBad(v) : markOk(v);
        } catch (_) { /* doğrulanamadı */ }
      }
    };
    let busy = false;
    const id = setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try { await tick(); } finally { busy = false; }
    }, VIDEO_INTERVAL_MS);
    videoTimers.set(v, id);
  }

  // ---- görünürlüğe göre tembel işleme ----
  const io = new IntersectionObserver((entries) => {
    if (!enabled) return;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      if (el.tagName === 'IMG') processImg(el);
      else if (el.tagName === 'VIDEO') processVideo(el);
      else if (el.hasAttribute('data-sv-bgcand')) processBg(el);
      else if (el.tagName === 'image') { /* SVG <image>: bulanık kalır */ }
    }
  }, { rootMargin: '1200px' });

  function watch(el) {
    if (el.__svWatched) return;
    el.__svWatched = true;
    io.observe(el);
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    const list = [root, ...root.querySelectorAll('img, video, *')];
    let checked = 0;
    for (const el of list) {
      const t = el.tagName;
      if (t === 'IMG' || t === 'VIDEO') { watch(el); continue; }
      if (checked++ > 400) continue; // aşırı büyük DOM'larda maliyeti sınırla
      if (el.nodeType === 1 && t !== 'SCRIPT' && t !== 'STYLE' && getComputedStyle(el).backgroundImage.includes('url(')) {
        el.setAttribute('data-sv-bgcand', '');
        watch(el);
      }
    }
  }

  function rescanAll() {
    if (document.body || document.documentElement) scan(document.documentElement);
  }

  const mo = new MutationObserver((muts) => {
    if (!enabled) return;
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n));
      else if (m.type === 'attributes' && m.target.tagName === 'IMG') { state.delete(m.target); m.target.removeAttribute('data-sv-ok'); processImg(m.target); }
    }
  });
  mo.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rescanAll, { once: true });
  else rescanAll();
})();
