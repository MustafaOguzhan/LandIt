// SafeView içerik betiği. Güvenli varsayılan: CSS her görseli bulanık tutar (content.css);
// bu betik yalnızca sınıflandırıcı "güvenli" dediğinde data-sv-ok ekleyerek bulanıklığı kaldırır.
(() => {
  if (window.__safeviewLoaded) return;
  window.__safeviewLoaded = true;

  // Üç ayrı sinyal, herhangi biri eşiği aşarsa gizlenir:
  //  risk     = NSFW sınıflandırıcısı (en riskli parçanın Porn+Sexy+Hentai olasılığı)
  //  exposure = kişinin kol/gövde/bacak bölgelerinin ağırlıklı açık ten oranı (vücut analizi)
  //  torso    = yalnızca gövde (göbek/göğüs/sırt açıklığı)
  const PROFILES = {
    high:   { risk: 0.03, exposure: 0.15, torso: 0.25 }, // kolsuz/şort gibi günlük açıklıkları da gizler
    medium: { risk: 0.15, exposure: 0.28, torso: 0.40 },
    low:    { risk: 0.50, exposure: 0.50, torso: 0.65 }, // yalnızca belirgin açıklık
  };
  const MIN_SIZE = 64;          // bundan küçük görseller (ikon, logo) taranmaz
  const VIDEO_INTERVAL_MS = 600;
  const CONCURRENCY = 4;

  let enabled = true;
  let profile = PROFILES.high;
  let showUnverified = false; // doğrulanamayan görseller: false = bulanık kal

  const urlResults = new Map(); // url -> risk (0..1)
  const state = new WeakMap();  // element -> { key }
  const badEls = new Set();
  const unverifiedEls = new Set();

  const isBad = (r) => r.maxRisk >= profile.risk || (r.exposure || 0) >= profile.exposure || (r.torso || 0) >= profile.torso;

  // Her elementin son sınıflandırma sonucu; ayar değişince yeniden karar verebilmek için.
  const results = new WeakMap();
  const tracked = new Set();
  function apply(el, result) {
    if (!result) { markUnverified(el); return; }
    results.set(el, result);
    tracked.add(el);
    isBad(result) ? markBad(el) : markOk(el);
  }
  function reevaluate() {
    for (const el of tracked) {
      if (!el.isConnected) { tracked.delete(el); badEls.delete(el); continue; }
      const r = results.get(el);
      if (r) isBad(r) ? markBad(el) : markOk(el);
    }
  }
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
    profile = PROFILES[s.sensitivity] ?? PROFILES.high;
    showUnverified = s.unverified === 'show';
    document.documentElement.classList.toggle('sv-off', !enabled);
    if (enabled) { rescanAll(); reevaluate(); }
  }
  chrome.storage.sync.get(['enabled', 'sensitivity', 'unverified'], applySettings);
  chrome.storage.onChanged.addListener((_c, area) => {
    if (area === 'sync') chrome.storage.sync.get(['enabled', 'sensitivity', 'unverified'], applySettings);
  });
  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg && msg.type === 'get-stats') { sendResponse({ blurred: badEls.size, unverified: unverifiedEls.size }); }
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

  function markOk(el) { el.setAttribute('data-sv-ok', ''); el.removeAttribute('data-sv-bad'); badEls.delete(el); unverifiedEls.delete(el); }
  function markBad(el) { el.removeAttribute('data-sv-ok'); el.setAttribute('data-sv-bad', ''); badEls.add(el); unverifiedEls.delete(el); }
  // Doğrulanamadı (indirilemedi / model yok): ayara göre bulanık bırak ya da göster.
  function markUnverified(el) {
    if (showUnverified) { markOk(el); return; }
    el.removeAttribute('data-sv-ok'); unverifiedEls.add(el);
  }

  function drawToDataUrl(source, w, h) {
    const scale = Math.min(1, 448 / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85); // kirli (tainted) canvas'ta SecurityError fırlatır
  }

  // Bir URL'nin sınıflandırma sonucunu döndürür. Başarısızsa null (= bulanık kalır).
  async function resultForUrl(url, imgEl) {
    if (urlResults.has(url)) return urlResults.get(url);
    let res = null;
    const isHttp = /^https?:/i.test(url);
    if (isHttp) res = await send({ type: 'classify-url', url });
    if ((!res || !res.ok) && imgEl) {
      try {
        const dataUrl = drawToDataUrl(imgEl, imgEl.naturalWidth, imgEl.naturalHeight);
        res = await send({ type: 'classify-data', dataUrl });
      } catch (_) { /* tainted: sıradaki yedek yola geç */ }
    }
    if ((!res || !res.ok) && isHttp) {
      // Yedek: CORS izni veren sunucularda anonim kopya ile canvas'a çiz.
      try {
        const copy = await new Promise((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = url;
        });
        res = await send({ type: 'classify-data', dataUrl: drawToDataUrl(copy, copy.naturalWidth, copy.naturalHeight) });
      } catch (_) { /* doğrulanamadı */ }
    }
    if (!res || !res.ok) return null;
    const result = res.skip ? { maxRisk: 0, fullRisk: 0, skin: 0 } : res.result;
    urlResults.set(url, result);
    return result;
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
      const result = await resultForUrl(url, img);
      if ((img.currentSrc || img.src) !== url) return; // bu arada kaynak değişti
      apply(img, result);
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
      apply(el, await resultForUrl(url, null));
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
        try { dataUrl = drawToDataUrl(v, v.videoWidth, v.videoHeight); } catch (_) { markUnverified(v); return; }
        const res = await send({ type: 'classify-data', dataUrl, fast: true });
        if (res && res.ok) apply(v, res.result);
      } else if (v.readyState >= 2 && v.paused && v.videoWidth && !v.hasAttribute('data-sv-ok') && !v.hasAttribute('data-sv-bad')) {
        // durdurulmuş ama kare hazır: bir kez tara (poster/ilk kare)
        try {
          const res = await send({ type: 'classify-data', dataUrl: drawToDataUrl(v, v.videoWidth, v.videoHeight) });
          if (res && res.ok) apply(v, res.result);
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
