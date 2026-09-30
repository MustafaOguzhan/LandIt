// Service worker: görselleri indirir, küçültür ve offscreen belgedeki modele yollar.
const OFFSCREEN_URL = 'offscreen.html';
const cache = new Map(); // url -> Promise<result>
const MAX_CACHE = 2000;
let creating = null;

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (existing.length) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: ['BLOBS'],
        justification: 'Görüntü sınıflandırma modelini yerel olarak çalıştırmak için.',
      })
      .finally(() => { creating = null; });
  }
  await creating;
}

// Offscreen belge ilk açılışta hazır olmayabilir; birkaç kez yeniden dene.
async function sendToOffscreen(msg, isDone) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await ensureOffscreen();
      const res = await chrome.runtime.sendMessage({ target: 'offscreen', ...msg });
      if (res && isDone(res)) return res;
      lastErr = new Error((res && res.error) || 'no response');
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  console.warn('SafeView offscreen request failed:', lastErr);
  throw lastErr;
}

async function classifyDataUrl(dataUrl, fast) {
  const res = await sendToOffscreen({ type: 'classify', dataUrl, fast }, (r) => r.ok);
  return res.result;
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function urlToSmallDataUrl(url) {
  const resp = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
  if (!resp.ok) throw new Error('fetch ' + resp.status);
  const blob = await resp.blob();
  if (blob.type === 'image/svg+xml') return null;
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 448 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return 'data:image/jpeg;base64,' + bytesToBase64(new Uint8Array(await out.arrayBuffer()));
}

function classifyUrl(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const dataUrl = await urlToSmallDataUrl(url);
    if (!dataUrl) return { skip: true };
    return { result: await classifyDataUrl(dataUrl) };
  })();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(url, p);
  p.catch(() => cache.delete(url)); // hata sonucu önbelleğe yazma, tekrar denenebilsin
  return p;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return;
  (async () => {
    try {
      if (msg.type === 'classify-url') sendResponse({ ok: true, ...(await classifyUrl(msg.url)) });
      else if (msg.type === 'status') {
        sendResponse(await sendToOffscreen({ type: 'status' }, (r) => r.ok));
      }
      else if (msg.type === 'classify-data') sendResponse({ ok: true, result: await classifyDataUrl(msg.dataUrl, !!msg.fast) });
      else sendResponse({ ok: false, error: 'unknown type' });
    } catch (e) {
      sendResponse({ ok: false, error: String((e && e.message) || e) });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get(['enabled', 'sensitivity', 'unverified']);
  await chrome.storage.sync.set({ enabled: cur.enabled ?? true, sensitivity: cur.sensitivity ?? 'high', unverified: cur.unverified ?? 'blur' });
  ensureOffscreen().catch(() => {});
});
