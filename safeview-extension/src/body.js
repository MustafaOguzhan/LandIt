// Vücut açıklığı analizi: kişiyi bul -> vücut noktalarından kol/gövde/bacak bölgeleri çıkar ->
// her bölgede ten renkli piksel oranını ölç. Sınıflandırıcıdan (NSFWJS) bağımsız, tamamlayıcı sinyal.
import { Human } from '../node_modules/@vladmandic/human/dist/human.esm.js';

const MIN_KP = 0.3;       // vücut noktası güven eşiği

let humanPromise = null;
export function getHuman(backend) {
  if (!humanPromise) {
    humanPromise = (async () => {
      const human = new Human({
        modelBasePath: chrome.runtime.getURL('models/'),
        backend,
        debug: false,
        cacheSensitivity: 0, // her görsel bağımsız: kare atlama/önbellek yok
        filter: { enabled: false },
        face: {
          enabled: true,
          detector: { rotation: false, maxDetected: 1, minConfidence: 0.3 },
          mesh: { enabled: true },
          iris: { enabled: false },
          description: { enabled: true },
          emotion: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false },
          attention: { enabled: false },
        },
        body: { enabled: true, modelPath: 'movenet-lightning.json', maxDetected: 1, minConfidence: 0.2 },
        hand: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false },
        object: { enabled: true, modelPath: 'centernet.json', minConfidence: 0.3, maxDetected: 8 },
      });
      await human.load();
      await human.warmup();
      return human;
    })();
    humanPromise.catch(() => { humanPromise = null; });
  }
  return humanPromise;
}

const cbOf = (r, g, b) => 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
const crOf = (r, g, b) => 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
function broadSkin(r, g, b) {
  const cb = cbOf(r, g, b), cr = crOf(r, g, b);
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && r > 60 && r > b;
}

// Kaynağı hedef boyuta getirir. Küçük görsellerde (ör. 60 px genişliğinde kişi) modeller hiçbir şey
// bulamıyor; bu yüzden gerektiğinde büyütüyoruz (en çok 4x).
function toCanvas(src, sx, sy, sw, sh, targetMax = 448) {
  const scale = Math.min(4, targetMax / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// Yüzün ten rengi (Cb/Cr ortancası). Bulunamazsa null -> geniş aralık kullanılır.
function faceSkinRef(face, px, W, H) {
  if (!face || !face.box) return null;
  const [bx, by, bw, bh] = face.box;
  const x0 = Math.max(0, Math.round(bx + bw * 0.3)), x1 = Math.min(W - 1, Math.round(bx + bw * 0.7));
  const y0 = Math.max(0, Math.round(by + bh * 0.35)), y1 = Math.min(H - 1, Math.round(by + bh * 0.75));
  const cbs = [], crs = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = (y * W + x) * 4;
    if (broadSkin(px[i], px[i + 1], px[i + 2])) { cbs.push(cbOf(px[i], px[i + 1], px[i + 2])); crs.push(crOf(px[i], px[i + 1], px[i + 2])); }
  }
  if (cbs.length < 12) return null;
  cbs.sort((a, b) => a - b); crs.sort((a, b) => a - b);
  return { cb: cbs[cbs.length >> 1], cr: crs[crs.length >> 1] };
}

function analyzePerson(res, cv) {
  const W = cv.width, H = cv.height;
  const px = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const body = res.body && res.body[0];
  if (!body) return null;
  const kp = {};
  for (const k of body.keypoints) if (k.score >= MIN_KP) kp[k.part || k.name] = k.position;

  const face = res.face && res.face[0];
  const ref = faceSkinRef(face, px, W, H);
  const isMale = false; // Human'ın cinsiyet çıktısı bu görsellerde güvenilir değil (erkeğe 'female' dedi); kullanılmıyor

  const isSkin = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
    const i = (yi * W + xi) * 4;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if (!broadSkin(r, g, b)) return false;
    if (ref && (Math.abs(cbOf(r, g, b) - ref.cb) > 16 || Math.abs(crOf(r, g, b) - ref.cr) > 16)) return false;
    return true;
  };

  const regions = []; // { kind, f, area }
  const add = (kind, pts, area) => {
    let n = 0, s = 0;
    for (const [x, y] of pts) { const v = isSkin(x, y); if (v === null) continue; n++; if (v) s++; }
    if (n >= 8) regions.push({ kind, f: s / n, area });
  };
  const limb = (kind, a, b, wf) => {
    if (!a || !b) return;
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (len < 10) return;
    const nx = -dy / len, ny = dx / len, w = len * wf;
    const pts = [];
    for (let i = 1; i <= 22; i++) for (let j = -2; j <= 2; j++) {
      const t = i / 23, o = (j / 2) * (w / 2) * 0.8;
      pts.push([a[0] + dx * t + nx * o, a[1] + dy * t + ny * o]);
    }
    add(kind, pts, len * w);
  };

  const { leftShoulder: ls, rightShoulder: rs } = kp;
  let lh = kp.leftHip, rh = kp.rightHip;
  if (ls && rs) {
    const sw = Math.hypot(rs[0] - ls[0], rs[1] - ls[1]);
    if (sw >= 12) {
      if (!lh || !rh) { // kalça kadrajda yok: gövde boyunu omuz genişliğinden tahmin et
        const dx = rs[0] - ls[0], dy = rs[1] - ls[1];
        let nx = -dy / sw, ny = dx / sw;
        if (ny < 0) { nx = -nx; ny = -ny; }
        lh = [ls[0] + nx * sw * 1.25, ls[1] + ny * sw * 1.25];
        rh = [rs[0] + nx * sw * 1.25, rs[1] + ny * sw * 1.25];
      }
      const pts = [];
      for (let i = 1; i <= 14; i++) for (let j = 1; j <= 12; j++) {
        const u = 0.12 + (i / 15) * 0.76, v = 0.04 + (j / 13) * 0.86;
        const tx = ls[0] + (rs[0] - ls[0]) * u, ty = ls[1] + (rs[1] - ls[1]) * u;
        const bx = lh[0] + (rh[0] - lh[0]) * u, by = lh[1] + (rh[1] - lh[1]) * u;
        pts.push([tx + (bx - tx) * v, ty + (by - ty) * v]);
      }
      add('torso', pts, sw * Math.hypot(lh[0] - ls[0], lh[1] - ls[1]) * 0.76);
    }
  }
  limb('arm', kp.leftShoulder, kp.leftElbow, 0.3);
  limb('arm', kp.rightShoulder, kp.rightElbow, 0.3);
  limb('arm', kp.leftElbow, kp.leftWrist, 0.28);
  limb('arm', kp.rightElbow, kp.rightWrist, 0.28);
  limb('leg', kp.leftHip, kp.leftKnee, 0.4);
  limb('leg', kp.rightHip, kp.rightKnee, 0.4);
  limb('leg', kp.leftKnee, kp.leftAnkle, 0.3);
  limb('leg', kp.rightKnee, kp.rightAnkle, 0.3);

  const agg = (kinds) => {
    let a = 0, e = 0;
    for (const r of regions) if (kinds.includes(r.kind)) { a += r.area; e += r.f * r.area; }
    return a > 0 ? e / a : 0;
  };
  let totalArea = 0, exposed = 0;
  for (const r of regions) { totalArea += r.area; exposed += r.f * r.area; }
  return {
    male: isMale,
    exposure: totalArea > 0 ? exposed / totalArea : 0,
    torso: agg(['torso']), arms: agg(['arm']), legs: agg(['leg']),
    regions: regions.length,
    gender: face ? `${face.gender}:${(face.genderScore || 0).toFixed(2)}` : 'noface',
  };
}

// Görseldeki kişileri bulur, her birini ayrı analiz eder; erkek olmayanların en yüksek değerlerini döndürür.
export async function bodyExposure(img, backend) {
  const human = await getHuman(backend);
  const W = img.naturalWidth, H = img.naturalHeight;
  const full = toCanvas(img, 0, 0, W, H, 448);

  const detObj = await human.detect(full, { object: { enabled: true }, body: { enabled: false }, face: { enabled: false } });
  let persons = (detObj.object || [])
    .filter((o) => o.label === 'person' && o.score >= 0.35)
    .map((o) => ({ box: o.box, area: o.box[2] * o.box[3] }))
    .filter((o) => o.area >= 0.03 * full.width * full.height)
    .sort((a, b) => b.area - a.area)
    .slice(0, 4);

  const crops = [];
  if (persons.length === 0) crops.push(full); // kişi bulunamadı: tüm görseli tek kişi say (yakın çekim vb.)
  for (const p of persons) {
    const [x, y, w, h] = p.box, pad = 0.08;
    if (w * h >= 0.6 * full.width * full.height) { crops.push(full); continue; }
    const sx = Math.max(0, x - w * pad), sy = Math.max(0, y - h * pad);
    const sw = Math.min(full.width - sx, w * (1 + 2 * pad)), sh = Math.min(full.height - sy, h * (1 + 2 * pad));
    crops.push(toCanvas(full, sx, sy, sw, sh, 448));
  }

  const out = { persons: persons.length, exposure: 0, torso: 0, arms: 0, legs: 0 };
  for (const cv of crops) {
    const res = await human.detect(cv, { object: { enabled: false }, body: { enabled: true }, face: { enabled: true } });
    const a = analyzePerson(res, cv);
    if (!a) continue;
    if (a.male) continue;
    out.exposure = Math.max(out.exposure, a.exposure);
    out.torso = Math.max(out.torso, a.torso);
    out.arms = Math.max(out.arms, a.arms);
    out.legs = Math.max(out.legs, a.legs);
  }
  return out;
}
