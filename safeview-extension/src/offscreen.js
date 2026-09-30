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

let chain = Promise.resolve();
async function classify(dataUrl) {
  const [model, img] = await Promise.all([getModel(), loadImage(dataUrl)]);
  const preds = await model.classify(img, 5);
  const scores = {};
  for (const p of preds) scores[p.className] = p.probability;
  return scores;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'status') { sendResponse({ ok: true, ...status }); return; }
  if (msg.type !== 'classify') return;
  chain = chain
    .then(() => classify(msg.dataUrl))
    .then((scores) => sendResponse({ ok: true, scores }))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

getModel().catch(() => {});
