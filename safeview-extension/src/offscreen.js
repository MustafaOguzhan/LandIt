import * as tf from '@tensorflow/tfjs';
import { load } from 'nsfwjs/core';
import { MobileNetV2MidModel } from 'nsfwjs/models/mobilenet_v2_mid';

// Model dosyaları paketin içinde; hiçbir ağ çağrısı yok.
const status = { state: 'loading', backend: null, error: null };

async function loadOn(backend) {
  await tf.setBackend(backend);
  await tf.ready();
  const model = await load('MobileNetV2Mid', { modelDefinitions: [MobileNetV2MidModel] });
  // Isınma: gerçekten çalıştığını doğrula (bazı makinelerde WebGL yüklenir ama işlem yapamaz).
  const c = document.createElement('canvas');
  c.width = c.height = 224;
  await model.classify(c, 5);
  status.backend = backend;
  return model;
}

let modelPromise = null;
function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      try {
        try { return await loadOn('webgl'); }
        catch (e) { console.warn('SafeView: webgl failed, falling back to cpu', e); return await loadOn('cpu'); }
      } catch (e) {
        status.state = 'error';
        status.error = String((e && e.message) || e);
        throw e;
      }
    })().then((m) => { status.state = 'ready'; status.error = null; return m; });
    modelPromise.catch(() => { modelPromise = null; });
  }
  return modelPromise;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

// ---- vücut analizi çerçevesi ----
const BODY_BACKEND = 'webgl'; // Human kendi içinde başlatılamazsa cpu'ya düşer
let frameReady = null;
const pending = new Map();
let seq = 0;
function getFrame() {
  if (!frameReady) {
    frameReady = new Promise((resolve) => {
      const f = document.createElement('iframe');
      f.src = `human-frame.html?backend=${BODY_BACKEND}`;
      f.style.display = 'none';
      window.addEventListener('message', (ev) => {
        const m = ev.data;
        if (!m) return;
        if (m.type === 'body-ready') resolve(f);
        else if (m.type === 'body-result' && pending.has(m.id)) {
          const { res, rej, timer } = pending.get(m.id);
          pending.delete(m.id); clearTimeout(timer);
          m.error ? rej(new Error(m.error)) : res(m.result);
        }
      });
      document.body.appendChild(f);
    });
  }
  return frameReady;
}
async function bodyViaFrame(dataUrl) {
  const frame = await getFrame();
  return new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); rej(new Error('body analysis timeout')); }, 45000);
    pending.set(id, { res, rej, timer });
    frame.contentWindow.postMessage({ type: 'body', id, dataUrl }, '*');
  });
}

const riskOf = (s) => (s.Porn || 0) + (s.Hentai || 0) + (s.Sexy || 0);

function cropToCanvas(img, sx, sy, sw, sh) {
  const c = document.createElement('canvas');
  c.width = c.height = 224;
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, 224, 224);
  return c;
}

// Görselin hangi parçalarının ayrı ayrı taranacağı. Model her girdiyi 224x224'e
// sıkıştırdığı için küçük bir bölgedeki içerik tam görselde kaybolabiliyor.
function tilesFor(img, fast) {
  const w = img.naturalWidth, h = img.naturalHeight, m = Math.min(w, h);
  const tiles = [{ el: img }]; // tam görsel (sıkıştırılmış)
  const ratio = Math.max(w, h) / m;
  if (fast) { // video: tam kare + merkez
    tiles.push({ el: cropToCanvas(img, (w - m) / 2, (h - m) / 2, m, m) });
    return tiles;
  }
  if (ratio > 1.25) { // yatay/dikey görsel: uzun kenar boyunca 3 kare
    for (const f of [0, 0.5, 1]) {
      tiles.push({ el: cropToCanvas(img, f * (w - m), f * (h - m), m, m) });
    }
  } else { // kareye yakın: 4 çeyrek + merkez yarım
    const hw = w / 2, hh = h / 2;
    for (const [x, y] of [[0, 0], [hw, 0], [0, hh], [hw, hh]]) tiles.push({ el: cropToCanvas(img, x, y, hw, hh) });
    tiles.push({ el: cropToCanvas(img, w / 4, h / 4, hw, hh) });
  }
  return tiles;
}

// Ten tonlu piksellerin oranı (YCbCr kuralı) - kaba ama hızlı bir ek sinyal.
function skinRatio(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > 60 && r > b) n++;
  }
  return n / (64 * 64);
}

let chain = Promise.resolve();
async function classify(dataUrl, fast) {
  const t0 = performance.now();
  const [model, img] = await Promise.all([getModel(), loadImage(dataUrl)]);
  let maxRisk = 0, fullRisk = 0;
  const tiles = tilesFor(img, fast);
  for (let i = 0; i < tiles.length; i++) {
    const preds = await model.classify(tiles[i].el, 5);
    const sc = {};
    for (const p of preds) sc[p.className] = p.probability;
    const r = riskOf(sc);
    if (i === 0) fullRisk = r;
    if (r > maxRisk) maxRisk = r;
  }
  const result = { maxRisk, fullRisk, skin: skinRatio(img) };
  // Vücut açıklığı analizi (yavaşsa/başarısızsa yalnızca NSFW sinyaliyle devam et)
  if (!fast) {
    try { Object.assign(result, await bodyViaFrame(dataUrl)); }
    catch (e) { console.warn('SafeView: body analysis failed', e); result.bodyError = String((e && e.message) || e); }
  }
  result.ms = Math.round(performance.now() - t0);
  return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'status') { sendResponse({ ok: true, ...status }); return; }
  if (msg.type !== 'classify') return;
  chain = chain
    .then(() => classify(msg.dataUrl, !!msg.fast))
    .then((result) => sendResponse({ ok: true, result }))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

getModel().catch(() => {});
