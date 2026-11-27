// Only the observation side is kept on the device. Any failure falls back to the default and play continues.
import { STATIONS } from './world.js';
const KEY = 'gf261127-61.side';
export function makeStore() {
  let mem = 0;
  return {
    status: 'default',
    load() {
      let raw;
      try { raw = window.localStorage.getItem(KEY); } catch (e) { this.status = 'denied'; return 0; }
      try {
        if (raw === null || raw === undefined) { this.status = 'first'; return 0; }
        let o = null; try { o = JSON.parse(raw); } catch (e) { this.status = 'invalid'; return 0; }
        const v = o && o.v === 1 ? Number(o.phi) : NaN;
        if (!Number.isFinite(v) || v < STATIONS[0] || v > STATIONS[STATIONS.length - 1]) { this.status = 'invalid'; return 0; }
        let best = 0; for (const s of STATIONS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
        this.status = 'restored'; mem = best; return best;
      } catch (e) { this.status = 'invalid'; return 0; }
    },
    save(phi) {
      mem = phi;
      try { window.localStorage.setItem(KEY, JSON.stringify({ v: 1, phi })); this.saved = 'ok'; } catch (e) { this.saved = 'denied'; }
    },
    get mem() { return mem; },
  };
}
