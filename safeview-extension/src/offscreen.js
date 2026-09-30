import * as tf from '@tensorflow/tfjs';
import { load } from 'nsfwjs/core';
import { MobileNetV2MidModel } from 'nsfwjs/models/mobilenet_v2_mid';

// Model dosyaları paketin içinde; hiçbir ağ çağrısı yok.
let modelPromise = null;
function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      try { await tf.setBackend('webgl'); } catch (_) { await tf.setBackend('cpu'); }
      await tf.ready();
      return load('MobileNetV2Mid', { modelDefinitions: [MobileNetV2MidModel] });
    })();
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
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'classify') return;
  chain = chain
    .then(() => classify(msg.dataUrl))
    .then((scores) => sendResponse({ ok: true, scores }))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

getModel().catch(() => {});
