import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
const empty = resolve('src/empty-module.js');
await build({
  entryPoints: { offscreen: 'src/offscreen.js', 'human-frame': 'src/human-frame.js' },
  bundle: true,
  format: 'iife',
  outdir: 'dist',
  minify: true,
  define: { global: 'globalThis' },
  inject: ['src/buffer-shim.js'],
  alias: {
    '@tensorflow/tfjs-backend-wasm/dist/index.js': empty,
    '@tensorflow/tfjs-backend-webgpu/dist/index.js': empty,
  },
  logLevel: 'info',
});
for (const f of ['manifest.json', 'background.js', 'content.js', 'content.css', 'offscreen.html', 'human-frame.html', 'popup.html', 'popup.js', 'popup.css']) {
  cpSync(`src/${f}`, `dist/${f}`);
}
cpSync('icons', 'dist/icons', { recursive: true });
cpSync('models', 'dist/models', { recursive: true });
