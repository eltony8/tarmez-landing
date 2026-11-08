// Turns the recorded answers (demo/data/api.raw.json) into the public demo data (demo/data/api.json)
// using demo/data/menu-edits.json: drop test dishes, set SAR prices and sizes, and refuse any alcohol words.
//   node tools/curate-demo-data.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')), '..');
const DATA = path.join(ROOT, 'demo', 'data');
const raw = JSON.parse(fs.readFileSync(path.join(DATA, 'api.raw.json'), 'utf8'));
const edits = JSON.parse(fs.readFileSync(path.join(DATA, 'menu-edits.json'), 'utf8'));
const out = JSON.parse(JSON.stringify(raw));

const menu = out['GET /menu-items'];
menu.data = menu.data
  .filter((d) => !edits.remove.includes(d.id))
  .map((d) => {
    const e = edits.dishes[String(d.id)] || {};
    const dish = { ...d, ...e };
    dish.price = Number(dish.price).toFixed(2);
    if (Array.isArray(dish.options) && edits.optionPrices[String(d.id)]) {
      dish.options = dish.options.map((o) => ({ ...o, price: edits.optionPrices[String(d.id)][o.name] ?? o.price }));
    }
    return dish;
  });

if (out['GET /loyalty/rules']?.data && edits.vatRate !== undefined) out['GET /loyalty/rules'].data.vat_rate = edits.vatRate;
const text = JSON.stringify(out).toLowerCase();
const hits = edits.forbiddenWords.filter((w) => text.includes(w.toLowerCase()));
if (hits.length) {
  console.error('Refusing to write: the demo data still mentions', hits.join(', '));
  process.exit(1);
}
fs.writeFileSync(path.join(DATA, 'api.json'), JSON.stringify(out));
fs.writeFileSync(path.join(DATA, 'table.json'), JSON.stringify(edits.table));
console.log('demo menu:', menu.data.map((d) => `${d.name_ar || d.name} ${Number(d.price)}`).join(' | '));
