// Copies the site's guest pages (menu, cart, order tracking) into demo/ exactly as they are,
// and adds one script at the top of <head>: demo/_demo/mock.js, which answers the API from demo/data.
// Run again whenever the site's frontend changes:
//   node tools/sync-demo.mjs "D:/tarmez/resturant/resturant conversion/هنعمل تيست/الحالي المطلوب قلب لغته/full-stack-complete-app/frontend"
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2] || 'D:/tarmez/resturant/resturant conversion/هنعمل تيست/الحالي المطلوب قلب لغته/full-stack-complete-app/frontend';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const DEMO = path.join(ROOT, 'demo');
export const PAGES = ['index.html', 'cart.html', 'track-order.html', 'account.html'];

const copyDir = (from, to, skip = () => false) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (skip(a, e)) continue;
    if (e.isDirectory()) copyDir(a, b, skip); else fs.copyFileSync(a, b);
  }
};

// fresh copies of the site's own files (the demo's own files in _demo/ and data/ are kept)
for (const d of ['css', 'js', 'assets']) fs.rmSync(path.join(DEMO, d), { recursive: true, force: true });
copyDir(path.join(SRC, 'css'), path.join(DEMO, 'css'));
copyDir(path.join(SRC, 'js'), path.join(DEMO, 'js'));
// assets without the admin's uploaded photos (test uploads; the demo dishes use their own image links)
copyDir(path.join(SRC, 'assets'), path.join(DEMO, 'assets'), (a, e) => e.isDirectory() && e.name === 'uploads');

let injected = 0;
for (const page of PAGES) {
  let html = fs.readFileSync(path.join(SRC, page), 'utf8');
  const before = html;
  // first thing in <head>: the site's palette/theme scripts ask the API for colours before anything else runs
  html = html.replace(/<head>/i, '<head>\n<script src="_demo/mock.js"></script>');
  if (html === before) throw new Error(`${page}: no <head> to put the demo script in`);
  html = html.replace(/\s*<link rel="manifest"[^>]*>/, ''); // no install prompt inside the demo
  fs.writeFileSync(path.join(DEMO, page), html);
  injected++;
}
console.log(`copied css, js, assets and ${injected} pages from ${SRC}`);
