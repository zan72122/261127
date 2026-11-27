// frame-by-frame capture of lying down and rising (side view)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [html, mode, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 480, height: 480 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.route('http://game.local/**', r => r.fulfill({ status: 200, body: fs.readFileSync(html), headers: { 'content-type': 'text/html' } }));
  await page.goto('http://game.local/index.html'); await page.waitForFunction(() => window.__gf61);
  await page.evaluate(() => window.__gf61.phi(48));
  if (mode === 'down') {
    await page.evaluate(() => window.__gf61.step(60));
    await page.evaluate(() => window.__gf61.sun(2));
    for (let i = 0; i < 80 && (await page.evaluate(() => window.__gf61.state().main)) !== 'lyingDown'; i++) await page.evaluate(() => window.__gf61.step(3));
  } else {
    await page.evaluate(() => { window.__gf61.jump('morning'); });
    await page.evaluate(() => window.__gf61.step(2));
  }
  for (let k = 0; k < 12; k++) {
    await page.evaluate((m) => window.__gf61.step(m === 'down' ? 22 : 24), mode);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}_${String(k).padStart(2, '0')}.png` });
    console.log(k, JSON.stringify(await page.evaluate(() => { const s = window.__gf61.state(); return [s.main, s.posture, s.phase]; })));
  }
  await browser.close();
})();
