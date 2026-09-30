// offscreen belgenin içindeki ayrı bir çerçevede çalışır: Human kendi TF örneğini/backend'ini kullanır,
// böylece NSFW modeliyle WebGL durumunu paylaşıp birbirini bozmaz.
import { bodyExposure } from './body.js';

const backend = new URLSearchParams(location.search).get('backend') || 'cpu';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

let chain = Promise.resolve();
window.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg || msg.type !== 'body') return;
  chain = chain
    .then(async () => bodyExposure(await loadImage(msg.dataUrl), backend))
    .then((result) => parent.postMessage({ type: 'body-result', id: msg.id, result }, '*'))
    .catch((e) => parent.postMessage({ type: 'body-result', id: msg.id, error: String((e && e.message) || e) }, '*'));
});
parent.postMessage({ type: 'body-ready' }, '*');
