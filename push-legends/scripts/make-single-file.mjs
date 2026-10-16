// Packs the `vite build --mode single` output into one double-clickable HTML file:
// the stylesheet, the font and all JavaScript are inlined. Output: release/PushLegends.html
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-single');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const font = readFileSync(join(root, 'public/fonts/LilitaOne-Regular.ttf')).toString('base64');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"[^>]*>/g, (_, file) => {
  const css = readFileSync(join(dist, file), 'utf8').replace(/url\([^)]*LilitaOne-Regular\.ttf\)/g, `url(data:font/ttf;base64,${font})`);
  return `<style>\n${css}\n</style>`;
});
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/g, (_, file) => {
  const js = readFileSync(join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});

const leftovers = html.match(/(src|href)="\.\/assets\/[^"]+"/g);
if (leftovers) throw new Error(`Assets were not inlined: ${leftovers.join(', ')}`);
const extraJs = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'));
if (extraJs.length !== 1) throw new Error(`Expected one JS bundle, found: ${extraJs.join(', ')}`);

mkdirSync(join(root, 'release'), { recursive: true });
const out = join(root, 'release/PushLegends.html');
writeFileSync(out, html);
console.log(`[single-file] wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
