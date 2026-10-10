// ECHO core: namespace, seeded randomness, noise, names, time.
// Everything in the simulation is deterministic from the world seed plus the
// player's actions, so two worlds with different seeds diverge naturally.
(function (global) {
  const ECHO = global.ECHO = global.ECHO || {};

  // ---------------------------------------------------------------- RNG
  // Serializable PRNG (mulberry32). `state` is saved with the world.
  class RNG {
    constructor(seed) { this.state = (seed >>> 0) || 1; }
    next() {
      let t = (this.state = (this.state + 0x6D2B79F5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(a + (b - a + 1) * this.next()); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    weighted(items, weightFn) {
      let total = 0;
      for (const it of items) total += Math.max(0, weightFn(it));
      if (total <= 0) return items[0];
      let r = this.next() * total;
      for (const it of items) {
        r -= Math.max(0, weightFn(it));
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
    gauss(mean = 0, sd = 1) {
      const u = 1 - this.next(), v = this.next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
  }
  ECHO.RNG = RNG;

  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  ECHO.hashStr = hashStr;
  ECHO.hash2 = function (x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------------------------------------------------------------- Noise
  function makeNoise(seed) {
    const h = ECHO.hash2;
    const smooth = t => t * t * (3 - 2 * t);
    function value(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const a = h(xi, yi, seed), b = h(xi + 1, yi, seed);
      const c = h(xi, yi + 1, seed), d = h(xi + 1, yi + 1, seed);
      const u = smooth(xf), v = smooth(yf);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }
    return function fbm(x, y, octaves = 5) {
      let sum = 0, amp = 1, freq = 1, norm = 0;
      for (let i = 0; i < octaves; i++) {
        sum += value(x * freq, y * freq) * amp;
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    };
  }
  ECHO.makeNoise = makeNoise;

  // ---------------------------------------------------------------- Utils
  const U = ECHO.U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
    angle: (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax),
    angleDiff: (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; },
    cap: s => s ? s[0].toUpperCase() + s.slice(1) : s,
    // Numbers people can read at a glance: 12,345 in panels, 12.3k on the battlefield.
    fmt: n => Math.round(n).toLocaleString('en-US'),
    short: n => { const a = Math.abs(n), s = n < 0 ? '-' : ''; if (a < 1000) return s + Math.round(a); if (a < 10000) return s + (a / 1000).toFixed(1).replace(/\.0$/, '') + 'k'; if (a < 1e6) return s + Math.round(a / 1000) + 'k'; return s + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; },
    round1: v => Math.round(v * 10) / 10,
    sum: arr => arr.reduce((a, b) => a + b, 0),
    plural: (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's')),
    listJoin: arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1],
    uid: (() => { let n = 0; return (p = 'id') => p + '_' + Date.now().toString(36) + '_' + (n++).toString(36); })()
  };

  // ---------------------------------------------------------------- Time
  // 1 real second = MIN_PER_SEC in-game minutes. A day lasts 6 real minutes.
  const T = ECHO.TIME = {
    MIN_PER_SEC: 4,
    DAY_MIN: 1440,
    SEASON_DAYS: 15,
    YEAR_DAYS: 60,
    SEASONS: ['Thaw', 'Bloom', 'Harvest', 'Frost'],
    // Calendar year the realm's recorded history starts counting from.
    EPOCH_YEAR: 412
  };
  T.dateOf = function (day) {
    const y = Math.floor(day / T.YEAR_DAYS);
    const d = day - y * T.YEAR_DAYS;
    const s = Math.floor(d / T.SEASON_DAYS);
    return { year: T.EPOCH_YEAR + y, season: T.SEASONS[s], seasonIdx: s, dayOfSeason: (d % T.SEASON_DAYS) + 1 };
  };
  T.fmtDate = function (day) {
    const d = T.dateOf(day);
    return `${d.dayOfSeason} ${d.season}, Year ${d.year}`;
  };
  T.fmtShort = function (day) {
    const d = T.dateOf(day);
    return `${d.season} ${d.year}`;
  };
  T.isNight = function (minuteOfDay) {
    return minuteOfDay < 330 || minuteOfDay >= 1230; // before 5:30, after 20:30
  };
  // 0 = full night, 1 = full day
  T.daylight = function (m) {
    if (m >= 420 && m <= 1110) return 1;
    if (m <= 300 || m >= 1260) return 0;
    if (m < 420) return (m - 300) / 120;
    return 1 - (m - 1110) / 150;
  };
  T.clock = function (m) {
    const h = Math.floor(m / 60), mm = Math.floor(m % 60);
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  };

  // ---------------------------------------------------------------- Names
  const CULTURES = {
    valdren: { // northern iron kingdom — hard consonants
      on: ['br', 'dr', 'k', 'v', 'h', 'th', 'g', 'r', 'st', 'w', 'tor', 'ul', 'm', 'ar'],
      nu: ['a', 'e', 'o', 'u', 'ai', 'ei', 'y'],
      co: ['k', 'n', 'rn', 'th', 'g', 'ld', 'r', 'st', 'm', 'nd', ''],
      fem: ['a', 'hild', 'ra', 'wyn', 'is'], masc: ['ric', 'mund', 'en', 'ar', 'ulf', 'or'],
      sur: ['stone', 'helm', 'vald', 'grim', 'brand', 'holt', 'mark', 'forge', 'wold']
    },
    ashmere: { // southern river kingdom — soft, flowing
      on: ['l', 's', 'm', 'n', 'el', 'v', 'c', 'f', 'ar', 'i', 'ser', 'th', 'al'],
      nu: ['a', 'e', 'i', 'ia', 'ae', 'io', 'ea', 'o'],
      co: ['l', 'n', 'r', 's', 'th', 'nn', 'ss', 'v', ''],
      fem: ['elle', 'ia', 'ine', 'a', 'ys', 'wen'], masc: ['ian', 'el', 'as', 'or', 'in', 'eth'],
      sur: ['mere', 'vale', 'brook', 'fen', 'willow', 'reed', 'lark', 'moss', 'dell']
    },
    lantern: { // the religious order — liturgical
      on: ['aur', 'cel', 'sol', 'ben', 'ma', 'ign', 'lu', 'od', 'pr', 'ev'],
      nu: ['e', 'i', 'a', 'o', 'ae'],
      co: ['l', 'n', 's', 'r', 'x', 'm', ''],
      fem: ['ina', 'ela', 'is', 'a'], masc: ['us', 'an', 'ian', 'o'],
      sur: ['of the Wick', 'Candlewright', 'Ashgiver', 'Dawnkeep', 'Emberly']
    }
  };
  ECHO.CULTURES = CULTURES;

  ECHO.makeName = function (rng, culture, sex) {
    const c = CULTURES[culture] || CULTURES.valdren;
    let base = rng.pick(c.on) + rng.pick(c.nu);
    if (rng.chance(0.55)) base += rng.pick(c.co) + rng.pick(c.nu);
    base += sex === 'f' ? rng.pick(c.fem) : rng.pick(c.masc);
    base = base.replace(/(.)\1\1/g, '$1$1');
    if (base.length > 10) base = base.slice(0, 9);
    return U.cap(base);
  };
  ECHO.makeSurname = function (rng, culture) {
    const c = CULTURES[culture] || CULTURES.valdren;
    const s = rng.pick(c.sur);
    if (s.includes(' ') || s[0] === s[0].toUpperCase()) return s;
    return U.cap(rng.pick(c.on) + rng.pick(c.nu) + s);
  };

  // Place names
  const PLACE_A = ['Harrow', 'Ash', 'Thorn', 'Wick', 'Mire', 'Gale', 'Cold', 'Raven', 'Elder', 'Brack', 'Hollow', 'Stone', 'Dusk', 'Bright', 'Gloam', 'Fallow', 'Iron', 'Willow', 'Crow', 'Amber', 'Salt', 'Briar', 'Moor', 'Lark'];
  const PLACE_B = ['mere', 'ford', 'hold', 'wick', 'stead', 'vale', 'reach', 'haven', 'cross', 'gate', 'barrow', 'moor', 'fall', 'wood', 'march', 'well', 'bridge', 'deep'];
  ECHO.makePlaceName = function (rng, used) {
    for (let i = 0; i < 50; i++) {
      const n = rng.pick(PLACE_A) + rng.pick(PLACE_B);
      if (!used || !used.has(n)) { if (used) used.add(n); return n; }
    }
    return 'Nameless' + rng.int(1, 99);
  };
  const REGION_A = ['the Whispering', 'the Sunken', 'the Ashen', 'the Gloam', 'the Bitter', 'the Silver', 'the Hollow', 'the Thorned', 'the Drowned', 'the Amber', 'the Weeping', 'the Old', 'the Pale', 'the Crow\'s', 'the Long', 'the Shattered'];
  const REGION_B = ['Fen', 'Wold', 'Reach', 'Barrens', 'Downs', 'Weald', 'Marches', 'Heath', 'Vale', 'Expanse', 'Shelf', 'Tangle', 'Steppe', 'Mire', 'Highlands', 'Shore'];
  ECHO.makeRegionName = function (rng, used) {
    for (let i = 0; i < 60; i++) {
      const n = rng.pick(REGION_A) + ' ' + rng.pick(REGION_B);
      if (!used.has(n)) { used.add(n); return n; }
    }
    return 'the Unnamed Lands';
  };

  // ---------------------------------------------------------------- Events
  // Tiny pub/sub so systems can react to each other without hard wiring.
  const listeners = {};
  ECHO.on = function (evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); };
  ECHO.emit = function (evt, data) { (listeners[evt] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(evt, e); } }); };
  ECHO.clearListeners = function () { for (const k in listeners) delete listeners[k]; };
})(typeof window !== 'undefined' ? window : globalThis);
