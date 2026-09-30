import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
await build({
  entryPoints: ['src/offscreen.js'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/offscreen.js',
  minify: true,
  define: { global: 'globalThis' },
  inject: ['src/buffer-shim.js'],
  logLevel: 'info',
});
for (const f of ['manifest.json', 'background.js', 'content.js', 'content.css', 'offscreen.html', 'popup.html', 'popup.js', 'popup.css']) {
  cpSync(`src/${f}`, `dist/${f}`);
}
cpSync('icons', 'dist/icons', { recursive: true });
