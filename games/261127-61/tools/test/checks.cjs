// Robustness checks: storage cases, hint after idle, visibility pause/resume, multi-touch, rotation, audio start.
const { chromium } = require('playwright'); const fs = require('fs');
const HTML = process.argv[2];
const results = {};
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage(); const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.route('http://game.local/**', r => r.fulfill({ status: 200, body: fs.readFileSync(HTML), headers: { 'content-type': 'text/html' } }));
  await page.goto('http://game.local/index.html'); await page.waitForFunction(() => window.__gf61, null, { timeout: 120000 });
  return { ctx, page, errs };
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const KEY = 'gf261127-61.side';
  // storage: first visit
  { const { ctx, page, errs } = await open(browser); const s = await page.evaluate(() => window.__gf61.state()); results.storeFirst = { status: s.store, phi: s.phi, errs }; await ctx.close(); }
  // storage: valid value restored
  { const { ctx, page, errs } = await open(browser, { init: `try{localStorage.setItem('${KEY}', JSON.stringify({v:1,phi:48}))}catch(e){}` }); const s = await page.evaluate(() => window.__gf61.state()); results.storeRestore = { status: s.store, phi: s.phi, errs }; await ctx.close(); }
  // storage: broken json and out-of-range
  { const { ctx, page, errs } = await open(browser, { init: `try{localStorage.setItem('${KEY}', '{broken')}catch(e){}` }); const s = await page.evaluate(() => window.__gf61.state()); results.storeBroken = { status: s.store, phi: s.phi, errs }; await ctx.close(); }
  { const { ctx, page, errs } = await open(browser, { init: `try{localStorage.setItem('${KEY}', JSON.stringify({v:1,phi:500}))}catch(e){}` }); const s = await page.evaluate(() => window.__gf61.state()); results.storeRange = { status: s.store, phi: s.phi, errs }; await ctx.close(); }
  // storage: reading refused
  { const { ctx, page, errs } = await open(browser, { init: `Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}})` }); const s = await page.evaluate(() => window.__gf61.state()); results.storeReadDenied = { status: s.store, phi: s.phi, errs }; await ctx.close(); }
  // storage: writing refused -> still moves
  { const { ctx, page, errs } = await open(browser, { init: `Storage.prototype.setItem=function(){throw new Error('quota')}` });
    await page.evaluate(() => { window.__gf61.phi(-24); window.__gf61.step(90); });
    const s = await page.evaluate(() => window.__gf61.state()); results.storeWriteDenied = { status: s.store, saved: s.saved, phi: s.phi, errs }; await ctx.close(); }
  // hint after ~4 s idle; audio after first tap; visibility; multi-touch; rotation
  { const { ctx, page, errs } = await open(browser);
    await page.waitForTimeout(500);
    const h0 = await page.evaluate(() => window.__gf61.hint());
    // the in-game clock must pass ~4 s; headless frames are slow so advance the simulation while idle
    await page.evaluate(() => window.__gf61.step(140));
    await page.waitForTimeout(300);
    const h1 = await page.evaluate(() => window.__gf61.hint());
    await page.screenshot({ path: 'shots/hint_demo.png' });
    results.hint = { before: h0, afterIdle: h1 };
    const sun = await page.evaluate(() => window.__gf61.sunScreen());
    await page.touchscreen.tap(sun.x, sun.y);
    const h2 = await page.evaluate(() => window.__gf61.hint());
    results.hintAfterTouch = h2;
    results.audio = await page.evaluate(() => window.__gf61.audio());
    // visibility: hidden -> clock stops; visible -> resumes
    const t0 = await page.evaluate(() => window.__gf61.t());
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(1500);
    const t1 = await page.evaluate(() => window.__gf61.t());
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(2500);
    const t2 = await page.evaluate(() => window.__gf61.t());
    results.visibility = { advancedWhileHidden: +(t1 - t0).toFixed(3), advancedAfterVisible: +(t2 - t1).toFixed(3), audio: await page.evaluate(() => window.__gf61.audio()) };
    // multi-touch: two fingers down/move/up, then a normal single drag still works
    const cdp = await ctx.newCDPSession(page);
    const pts = (a, b) => [{ x: a[0], y: a[1], id: 1 }, { x: b[0], y: b[1], id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts([120, 600], [260, 620]) });
    for (let i = 1; i < 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts([120 + i * 20, 600], [260 - i * 15, 620 + i * 10]) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts([150, 300], [250, 300]) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const sMt = await page.evaluate(() => window.__gf61.state());
    const before = sMt.sunEl;
    const p = await page.evaluate(() => window.__gf61.sunScreen());
    await page.mouse.move(p.x, p.y); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(p.x, p.y + i * 12); await page.mouse.up();
    const sAfter = await page.evaluate(() => window.__gf61.state());
    results.multiTouch = { sunBefore: +before.toFixed(2), sunAfterSingleDrag: +sAfter.sunEl.toFixed(2), errs: errs.slice() };
    // rotation
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(800);
    await page.evaluate(() => window.__gf61.step(60));
    const c = await page.evaluate(() => window.__gf61.canvas()); const sp = await page.evaluate(() => window.__gf61.sunScreen());
    await page.waitForTimeout(400); await page.screenshot({ path: 'shots/rotated.png' });
    results.rotation = { canvas: c, sun: { x: Math.round(sp.x), y: Math.round(sp.y) }, errs: errs.slice() };
    await ctx.close(); }
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})();
