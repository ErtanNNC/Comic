// Runs the Keşfet injected script against a mock of cizgiarsiv.com (series page with
// pager + sidebar, episode pages with a Drive iframe) in headless Chromium.
// Needs Playwright: `npm run test:site`
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { readFileSync } = await import('node:fs');
const src = readFileSync(new URL('../src/lib/site-script.ts', import.meta.url), 'utf8');
const SCRIPT = src.slice(src.indexOf('String.raw`') + 11, src.lastIndexOf('`'));

const titles = ['Özet','Güçsüz','Ergenlik Sancıları','Özenti','Büyük Güç','Hayat Dersleri','Büyük Kahraman','Gizli Kimlik','Sürekli İş','En Kötüsü','Ders','Ağ','Yeşil','Bitiş','Son','Yeni','Eski','Çok','Daha','Sonuncu','Bir','İki','Üç'];
const N = 23, PER = 10, PAGES = Math.ceil(N / PER);
const did = (i) => `1DRIVEid${String(i).padStart(3,'0')}xxxxxxxxxxxxxxxxx`;
const sidebar = `<aside class="sidebar"><div class="widget"><h3>Son güncellenenler</h3><ul>${[13,12,11,10,9,8].map(n=>`<li><a href="/2026/02/0${n%9+1}/ben-10-bolum-${n}/">Bölüm ${n} – Ben10</a></li>`).join('')}</ul></div></aside>`;
const head = `<header><nav><a href="/">Çizgi Arşiv</a><a href="/seriler/">Serilerimiz</a></nav></header>`;
function seriesPage(p) {
  const items = [];
  for (let i = (p-1)*PER; i < Math.min(N, p*PER); i++) items.push(`<div class="chapter-item"><a href="/2026/01/29/ultimate-spiderman-${i}-x/"><img src="/c.jpg"></a><div class="meta"><a href="/2026/01/29/ultimate-spiderman-${i}-x/">Ultimate Spiderman (2000) – ${i} ${titles[i]}</a><span>29 Oca 2026</span></div><a class="btn" href="/2026/01/29/ultimate-spiderman-${i}-x/">Oku</a></div>`);
  const pager = Array.from({length: PAGES}, (_, k) => `<a href="/category/spider-man/ultimate-spiderman-2000/page/${k+1}/">${k+1}</a>`).join('');
  return `<html><head><title>Ultimate Spiderman (2000) – Çizgi Arşiv</title></head><body>${head}<main><h1>Ultimate Spiderman (2000)</h1><div class="chapters">${items.join('')}</div><div class="pagination">${pager}</div></main>${sidebar}</body></html>`;
}
function episodePage(i) {
  return `<html><head><title>x</title></head><body>${head}<main><h1>Ultimate Spiderman (2000) – ${i} ${titles[i]}</h1><select><option>Bölüm ${i+1} / ${N}</option></select><div class="reader"><iframe data-src="x" src="https://drive.google.com/file/d/${did(i)}/preview" allow="autoplay"></iframe></div></main>${sidebar}</body></html>`;
}
const server = http.createServer((req, res) => {
  const u = req.url; let m;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  if ((m = u.match(/^\/category\/spider-man\/ultimate-spiderman-2000\/(?:page\/(\d+)\/)?$/))) return res.end(seriesPage(+(m[1]||1)));
  if ((m = u.match(/^\/2026\/01\/29\/ultimate-spiderman-(\d+)-x\/$/))) return res.end(episodePage(+m[1]));
  if (u === '/') return res.end(`<html><body>${head}<main><a href="/category/spider-man/ultimate-spiderman-2000/">US</a><a href="/2026/01/29/ultimate-spiderman-1-x/">e1</a><a href="/2026/01/29/ultimate-spiderman-2-x/">e2</a></main>${sidebar}</body></html>`);
  res.statusCode = 404; res.end('nf');
}).listen(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const pg = await browser.newPage();
await pg.addInitScript(() => { window.__msgs = []; window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) }; });
const lastPage = async () => (await pg.evaluate(() => window.__msgs.filter(m => m.type === 'page'))).at(-1);

await pg.goto(base + '/'); await pg.evaluate(SCRIPT);
console.log('HOME', JSON.stringify(await lastPage()));
await pg.goto(base + '/2026/01/29/ultimate-spiderman-4-x/'); await pg.evaluate(SCRIPT);
console.log('EPISODE', JSON.stringify(await lastPage()));
await pg.goto(base + '/category/spider-man/ultimate-spiderman-2000/'); await pg.evaluate(SCRIPT);
console.log('SERIES', JSON.stringify(await lastPage()));
await pg.evaluate(() => window.__panel.collectSeries());
await pg.waitForFunction(() => window.__msgs.some(m => m.type === 'collected'), null, { timeout: 20000 });
const c = await pg.evaluate(() => window.__msgs.find(m => m.type === 'collected'));
console.log('COLLECTED', c.series, c.items.length, 'failed', c.failed);
console.log(c.items.slice(0,2), c.items.at(-1));
const ok = c.items.length === N && c.items.every((it, i) => it.driveId === did(i));
console.log('ALL CORRECT & ORDERED:', ok);
if (!ok) process.exitCode = 1;
await browser.close(); server.close();
