// Opens every view of the built site in a browser and fails on: a script error, a missing file, a page
// wider than the screen, an empty view, a wrong address, or an accessibility problem (axe-core).
// Run after python -m ltdi.build_site, with python tools/serve.py running:
//     npm ci && npx playwright install chromium && node tests/browser/smoke.js
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.SITE || 'http://localhost:8765';
const axe = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const VIEWS = ['/', '/#map', '/#charts', '/#opportunities', '/#plan', '/#plan?t=mt&from=none&s=ready', '/#shortlist?codes=yo,ha',
  '/#about', '/#providers', '/#download', '/language/yo', '/language/en', '/language/cop', '/#compare-yo-ha', '/#opportunities-yo', '/language/xx'];
const fail = [];

(async () => {
  const b = await chromium.launch();
  for (const width of [1280, 400, 320]) {
    const p = await b.newPage({ viewport: { width, height: 900 } });
    p.on('pageerror', e => fail.push(`${width} script error: ${e.message}`));
    p.on('response', r => { const u = r.url(); if (r.status() >= 400 && u.startsWith(BASE) && !u.endsWith('/language/xx')) fail.push(`${width} ${r.status()} ${u}`); });
    for (const v of VIEWS) {
      await p.goto(BASE + v); await p.waitForTimeout(1200);
      const [sw, text] = await p.evaluate(() => [document.documentElement.scrollWidth, document.querySelector('#view').innerText.length]);
      if (sw > width) fail.push(`${width} ${v}: page is ${sw}px wide`);
      if (text < 150) fail.push(`${width} ${v}: the view is nearly empty`);
    }
    await p.close();
  }
  // addresses
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const at = async (u, want, title) => { await p.goto(BASE + u); await p.waitForTimeout(1000);
    const [path, t] = await p.evaluate(() => [location.pathname + location.hash, document.title]);
    if (path !== want) fail.push(`${u} ended at ${path}, not ${want}`);
    if (title && !t.startsWith(title)) fail.push(`${u} title "${t}", not "${title}..."`); };
  await at('/language/yo', '/language/yo', 'Yoruba');
  await at('/#lang-ig', '/language/ig', 'Igbo');
  await at('/language/yor', '/language/yo', 'Yoruba');
  await at('/language/xx', '/language/xx', 'Not found');
  await at('/language/yo#plan', '/#plan', 'Plan');
  await p.goto(BASE + '/language/yo'); await p.waitForTimeout(1000); await p.evaluate(() => window.__same = 1);
  await p.click('.rel-list a'); await p.waitForTimeout(800);
  if (!(await p.evaluate(() => window.__same === 1 && location.pathname.startsWith('/language/')))) fail.push('a language link reloaded the page or went elsewhere');
  await p.close();
  // accessibility, both themes
  for (const scheme of ['light', 'dark']) for (const v of ['/', '/#map', '/#charts', '/#opportunities', '/#plan', '/#about', '/#providers', '/language/yo', '/language/xx']) {
    const q = await b.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    await q.goto(BASE + v); await q.waitForTimeout(1200); await q.addScriptTag({ content: axe });
    const vs = await q.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations.map(x => `${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes[0].target.join(' ')}`));
    vs.forEach(x => fail.push(`${scheme} ${v} accessibility: ${x}`));
    await q.close();
  }
  await b.close();
  if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
  console.log(`browser checks passed: ${VIEWS.length} views at 3 widths, addresses, accessibility in both themes`);
})();
