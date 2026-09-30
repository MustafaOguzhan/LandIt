import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
function png(s) {
  const raw = Buffer.alloc((s * 4 + 1) * s);
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      const i = y * (s * 4 + 1) + 1 + x * 4;
      const u = (x + 0.5) / s, v = (y + 0.5) / s;
      // yuvarlatılmış kare
      const r = 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0);
      let px = [0, 0, 0, 0];
      if (Math.hypot(dx, dy) <= r) px = [31, 158, 94, 255];
      // göz: beyaz elips + koyu iris
      const e = ((u - 0.5) / 0.36) ** 2 + ((v - 0.5) / 0.2) ** 2;
      if (px[3] && e <= 1) px = [250, 247, 242, 255];
      if (px[3] && Math.hypot(u - 0.5, v - 0.5) <= 0.12) px = [27, 36, 48, 255];
      raw.set(px, i);
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync('icons', { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`icons/${s}.png`, png(s));
