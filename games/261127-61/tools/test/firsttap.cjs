// First-tap test: the sun must move down and ground shadows must change right after the first tap,
// and the image change must exceed the change caused by ambient animation alone (control interval).
const { chromium } = require('playwright');
const fs = require('fs');
const { PNG } = (() => { try { return require('pngjs'); } catch (e) { return {}; } })();
(async () => {
  const [html, w, h, out] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.route('http://game.local/**', r => r.fulfill({ status: 200, body: fs.readFileSync(html), headers: { 'content-type': 'text/html' } }));
  await page.goto('http://game.local/index.html');
  await page.waitForFunction(() => window.__gf61, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__gf61.step(150));   // let the camera settle
  await page.evaluate(() => window.__gf61.freeze(true)); // stop ambient animation (wind, breathing, idle motion)
  await page.waitForTimeout(600);
  // freeze-free measurement helpers in page: read pixels of the canvas after the next frame
  const grab = async () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => {
    const c = document.getElementById('c'); const g = c.getContext('webgl2', { preserveDrawingBuffer: true });
    // copy via 2D canvas
    const cv = document.createElement('canvas'); cv.width = c.width; cv.height = c.height; const x = cv.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, Math.floor(c.height * 0.55), c.width, Math.floor(c.height * 0.45)).data; // ground region
    let s = []; for (let i = 0; i < d.length; i += 16) s.push(d[i] + d[i + 1] + d[i + 2]);
    res(s);
  })));
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
  const s0 = await page.evaluate(() => ({ st: window.__gf61.state(), sun: window.__gf61.sunScreen(), key: window.__gf61.shadowProbe() }));
  const g0 = await grab();
  await page.waitForTimeout(120);
  const g1 = await grab();
  const s1 = await page.evaluate(() => ({ st: window.__gf61.state(), sun: window.__gf61.sunScreen(), key: window.__gf61.shadowProbe() }));
  const envDiff = diff(g0, g1);
  // tap the sun (touch)
  const p = s1.sun;
  const tTap = await page.evaluate(() => performance.now());
  await page.touchscreen.tap(p.x, p.y);
  const after = await page.evaluate((t0) => new Promise((res) => {
    const st = window.__gf61.state();
    requestAnimationFrame(() => res({ st, frameAt: performance.now(), sun: window.__gf61.sunScreen(), key: window.__gf61.shadowProbe() }));
  }), tTap);
  const g2 = await grab();
  const tapDiff = diff(g1, g2);
  await page.screenshot({ path: out });
  const shadowLen = (el) => 1 / Math.tan(Math.max(0.5, el) * Math.PI / 180);
  const res = {
    viewport: `${w}x${h}`,
    sunElBefore: +s1.st.sunEl.toFixed(2), sunElAfter: +after.st.sunEl.toFixed(2),
    sunYBefore: +s1.sun.y.toFixed(1), sunYAfter: +after.sun.y.toFixed(1),
    shadowLenRatio: +(shadowLen(after.st.sunEl) / shadowLen(s1.st.sunEl)).toFixed(3),
    keyDirBefore: s1.key.dir.map((v) => +v.toFixed(3)), keyDirAfter: after.key.dir.map((v) => +v.toFixed(3)),
    envDiff: +envDiff.toFixed(2), tapDiff: +tapDiff.toFixed(2),
    stateChangedSynchronously: after.st.sunEl < s1.st.sunEl,
    msTapToNextFrameHeadless: +(after.frameAt - tTap).toFixed(1),
    errors: errs,
  };
  res.pass = res.sunElAfter < res.sunElBefore - 0.5 && res.sunYAfter > res.sunYBefore && res.shadowLenRatio > 1.05 && res.tapDiff > Math.max(0.5, res.envDiff * 2) && errs.length === 0;
  console.log(JSON.stringify(res));
  await browser.close();
})();
