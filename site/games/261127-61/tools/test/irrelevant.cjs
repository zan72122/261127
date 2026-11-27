const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('http://game.local/**', r => r.fulfill({ status: 200, body: fs.readFileSync(process.argv[2]), headers: { 'content-type': 'text/html' } }));
  await page.goto('http://game.local/index.html'); await page.waitForFunction(() => window.__gf61);
  await page.evaluate(() => window.__gf61.step(60));
  const before = await page.evaluate(() => window.__gf61.state());
  const sun = await page.evaluate(() => window.__gf61.sunScreen());
  // sky far from the sun, ground in front, and on the giraffe's body
  const pts = [[40, 80], [200, 780], [Math.max(20, sun.x - 150), sun.y + 170]];
  for (const [x, y] of pts) { await page.touchscreen.tap(x, y); await page.evaluate(() => window.__gf61.step(3)); }
  const after = await page.evaluate(() => window.__gf61.state());
  const log = (await page.evaluate(() => window.__gf61.log())).map((e) => e.name);
  console.log(JSON.stringify({ sunBefore: before.sunEl, sunAfter: after.sunEl, phiBefore: before.phi, phiAfter: after.phi, mainBefore: before.main, mainAfter: after.main, events: log, errs }));
  await browser.close();
})();
