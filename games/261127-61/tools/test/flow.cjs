// Scripted play-through: real pointer input, simulated time fast-forwarded with __gf61.step between inputs.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [html, w, h, outDir] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await page.route('http://game.local/**', r => r.fulfill({ status: 200, body: fs.readFileSync(html), headers: { 'content-type': 'text/html' } }));
  await page.goto('http://game.local/index.html');
  await page.waitForFunction(() => window.__gf61, null, { timeout: 120000 });
  const W = +w, H = +h;
  const st = () => page.evaluate(() => window.__gf61.state());
  const step = (sec) => page.evaluate((n) => window.__gf61.step(n, 1 / 30), Math.round(sec * 30));
  const shot = async (name) => { await page.evaluate(() => window.__gf61.step(2, 1 / 30)); await page.waitForTimeout(250); await page.screenshot({ path: `${outDir}/${name}.png` }); };
  const log = async (label) => { const s = await st(); console.log(label.padEnd(26), JSON.stringify({ phase: s.phase, sun: +s.sunEl.toFixed(1), moon: +s.moonEl.toFixed(1), phi: +s.phi.toFixed(1), main: s.main, post: s.posture, bg: s.bg, inv: s.invite, disc: s.disc, cyc: s.cycle })); return s; };
  const drag = async (x0, y0, x1, y1, n = 24, hold = 0) => { await page.mouse.move(x0, y0); await page.mouse.down(); for (let i = 1; i <= n; i++) { await page.mouse.move(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await page.evaluate(() => window.__gf61.step(1, 1 / 30)); } if (hold) await hold(); await page.mouse.up(); };
  const sunDragTo = async (target) => { const s = await st(); const p = await page.evaluate(() => window.__gf61.sunScreen()); const px = (s.sunEl - target) / 11 * 0.42 * H; await drag(p.x, p.y, p.x, p.y + px); };
  await page.waitForTimeout(800); await step(1);
  await log('00 start'); await shot('00-start');
  // 1 first tap on the sun
  const p0 = await page.evaluate(() => window.__gf61.sunScreen());
  await page.touchscreen.tap(p0.x, p0.y);
  await log('01 tap sun');
  // 2 lower the sun part way and stop (compare resting with the neck up)
  await sunDragTo(3.0); await log('02 sun at ~3');
  await step(16); await log('02b after 16s'); await shot('02-lying-neck-up');
  { const t = (await page.evaluate(() => window.__gf61.tuftScreen('peek'))) || { x: W * 0.3, y: H * 0.75 }; await drag(t.x, t.y, t.x + 30, t.y, 8); await step(0.2); console.log('small swipe while resting ->', JSON.stringify(await page.evaluate(() => window.__gf61.ears()))); await shot('02c-ears-turned'); }
  // 3 lower to the horizon: sleep with the head on the rump
  await sunDragTo(-1.5); await log('03 sun set');
  await step(12); await log('03b +12s'); await shot('03-rem-front');
  // 4 peek through the tuft (short swipe, hold, release)
  let inv = await page.evaluate(() => window.__gf61.inviteInfo()); console.log('invite', JSON.stringify(inv));
  const pk = await page.evaluate(() => window.__gf61.tuftScreen('peek'));
  if (pk) { await drag(pk.x, pk.y, pk.x + W * 0.16, pk.y, 12, async () => { await shot('04-peek-held'); }); await step(0.4); await shot('04b-peek-released'); }
  await log('04 peek');
  // 5 long swipe toward the pillow side
  inv = await page.evaluate(() => window.__gf61.inviteInfo()); console.log('invite', JSON.stringify(inv));
  const swipeLong = async (dir) => { const q = (await page.evaluate(() => window.__gf61.inviteInfo())) || {}; const p = q.p || (await page.evaluate(() => window.__gf61.tuftScreen('peek'))) || { x: W / 2, y: H * 0.75 }; const x0 = p.x; await drag(x0, p.y, x0 + dir * W * 0.55, p.y, 30); await step(4); };
  if (inv && inv.dir) await swipeLong(inv.dir);
  await log('05 moved'); await shot('05-side-1');
  inv = await page.evaluate(() => window.__gf61.inviteInfo()); console.log('invite', JSON.stringify(inv));
  if (inv && inv.dir) { await swipeLong(inv.dir); await log('05b moved again'); await shot('05b-side-2'); }
  // 6 small slow swipe while asleep vs a bigger one
  let s6 = await st();
  const anyTuft = async () => (await page.evaluate(() => window.__gf61.tuftScreen('peek'))) || { x: W * 0.3, y: H * 0.75 };
  let t6 = await anyTuft();
  await drag(t6.x, t6.y, t6.x + 18, t6.y, 6); await step(0.5);
  console.log('small swipe ->', JSON.stringify(await page.evaluate(() => window.__gf61.ears())));
  // make sure it is asleep before the big rustle
  for (let i = 0; i < 12 && (await st()).main !== 'rem'; i++) await step(5);
  await log('06 before big rustle'); await shot('06-asleep');
  t6 = await anyTuft();
  for (let k = 0; k < 3; k++) await drag(t6.x - 60, t6.y, t6.x + 90, t6.y, 8);
  await step(0.3); console.log('big rustle ->', JSON.stringify(await page.evaluate(() => window.__gf61.ears())));
  await step(2.5); await log('06b after rustle'); await shot('06b-head-up-legs-folded');
  // 7 let the night run on its own (no input) and record the variety of states
  const seen = new Set(); for (let i = 0; i < 40; i++) { await step(3); const s = await st(); seen.add(s.main + '/' + s.posture); }
  console.log('night states seen', JSON.stringify([...seen]));
  await log('07 night later');
  // 8 moon: lower it to the horizon -> morning
  inv = await page.evaluate(() => window.__gf61.inviteInfo()); console.log('invite', JSON.stringify(inv));
  let m = await page.evaluate(() => window.__gf61.moonScreen());
  if (!(m.x > 0 && m.x < W && m.y > 0 && m.y < H) && inv && inv.dir) { await swipeLong(inv.dir); m = await page.evaluate(() => window.__gf61.moonScreen()); }
  await step(1.5); m = await page.evaluate(() => window.__gf61.moonScreen());
  await shot('08-moon');
  await drag(m.x, m.y, m.x, m.y + H * 0.45, 30); await log('08 moon dragged');
  await step(6); await shot('08b-dawn-rising'); await log('08b dawn');
  await step(12); await shot('09-morning-trace'); await log('09 morning');
  // follow the footprints sideways
  inv = await page.evaluate(() => window.__gf61.inviteInfo()); console.log('invite', JSON.stringify(inv));
  if (inv && inv.kind === 'grass') await swipeLong(inv.dir || 1);
  await step(6); await shot('09b-followed'); await log('09b followed');
  await step(40); await log('10 later');
  await step(20); await shot('10-next-dusk'); await log('10b next dusk');
  // second evening, watched from the side chosen in the morning
  await sunDragTo(-1.5); await log('11 2nd sunset');
  await step(30); await log('11b 2nd night'); await shot('11-second-night');
  inv = await page.evaluate(() => window.__gf61.inviteInfo()); console.log('invite', JSON.stringify(inv));
  if (inv && inv.kind === 'grass') { if (inv.dir) await swipeLong(inv.dir); else { const q = inv.p; await drag(q.x, q.y, q.x + W * 0.16, q.y, 12); } }
  await step(8); await log('12 2nd moved'); await shot('12-second-side');
  console.log('log', JSON.stringify((await page.evaluate(() => window.__gf61.log())).filter((e) => !/hint|grass-touch|sun-tap|contacts/.test(e.name)).map((e) => `${e.t}:${e.name}`)));
  console.log('errors', JSON.stringify(errs));
  await browser.close();
})();
