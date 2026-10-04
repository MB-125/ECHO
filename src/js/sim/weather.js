// Weather: every region has its own skies, with memory — a dry spell tends
// to stay dry. Long dry summers become droughts that wither the fields;
// heavy rains along the rivers become floods that drown granaries (and
// sometimes people); cold, hungry winters cost more food and kill the old.
(function () {
  const { U } = ECHO;
  const T = ECHO.TIME;

  const W = ECHO.Weather = {
    regionOf(world, x, y) { return ECHO.World.regionAt(world, x, y); },
    state(world, region) {
      world.weather = world.weather || {};
      let w = world.weather[region.id];
      if (!w) w = world.weather[region.id] = { temp: 0, rain: 0, dry: 0, wet: 0, cold: 0, today: 'clear', drought: false, harsh: false };
      return w;
    },
    gauss(rng) { return (rng.next() + rng.next() + rng.next() - 1.5) * 1.15; },
    dailyTick(world, rng) {
      const season = T.dateOf(world.day).seasonIdx; // 0 spring 1 summer 2 autumn 3 winter
      for (const r of world.regions) {
        const w = W.state(world, r);
        // persistent anomalies (autoregressive) around the seasonal norm
        w.temp = w.temp * 0.88 + W.gauss(rng) * 0.32;
        w.rain = w.rain * 0.82 + W.gauss(rng) * 0.42 + (r.swamp > 0.2 ? 0.05 : 0);
        const wetSeason = season === 0 || season === 2;
        const p = w.rain + (wetSeason ? 0.35 : season === 1 ? -0.25 : 0.1);
        const cold = season === 3 || (season !== 1 && w.temp < -1.1);
        w.today = p > 1.35 ? (cold ? 'blizzard' : 'storm') : p > 0.55 ? (cold ? 'snow' : 'rain') : p > 0.1 ? (w.temp < -0.6 && season !== 1 ? 'fog' : 'cloudy') : (season === 1 && w.temp > 0.7 ? 'heat' : 'clear');
        // dryness / wetness / cold counters
        w.dry = p < -0.35 && season !== 3 ? w.dry + 1 : Math.max(0, w.dry - 2);
        w.wet = p > 0.9 ? w.wet + 1 : Math.max(0, w.wet - 1);
        w.cold = season === 3 && w.temp < -0.5 ? w.cold + 1 : Math.max(0, w.cold - 1);
        // drought
        if (!w.drought && w.dry >= 16 && (season === 0 || season === 1)) {
          w.drought = true; w.droughtSince = world.day;
          W.news(world, r, `Drought grips ${r.name}: no rain for weeks, and the crops are withering in the fields.`, 2);
        } else if (w.drought && (w.dry === 0 || season === 3)) {
          w.drought = false;
          W.news(world, r, `Rain at last in ${r.name}. The drought is broken.`, 1);
        }
        // flood (rivers burst in wet seasons)
        if (w.wet >= 4 && wetSeason && rng.chance(0.25) && (!w.lastFlood || world.day - w.lastFlood > 30)) {
          w.lastFlood = world.day; w.wet = 0;
          W.flood(world, rng, r);
        }
        // harsh winter
        if (!w.harsh && w.cold >= 10 && season === 3) {
          w.harsh = true;
          W.news(world, r, `A bitter winter has settled on ${r.name}. Firewood and bread are running short.`, 2);
        } else if (w.harsh && season !== 3) w.harsh = false;
      }
    },
    news(world, region, text, imp) {
      const s = world.settlements.find(s => W.regionOf(world, s.x, s.y) === region);
      ECHO.Chronicle.add(world, { text, kind: 'nature', importance: imp, sid: s ? s.id : null, x: s ? s.x : (region.x0 + region.x1) / 2, y: s ? s.y : (region.y0 + region.y1) / 2 });
    },
    flood(world, rng, region) {
      for (const s of world.settlements) {
        if (W.regionOf(world, s.x, s.y) !== region) continue;
        // only towns by the water flood
        let water = 0;
        for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const t = ECHO.World.tile(world, s.x + dx, s.y + dy); if (t === ECHO.TILE.WATER || t === ECHO.TILE.DEEP) water++; }
        if (water < 4) continue;
        const lostFood = s.stock.food * rng.range(0.15, 0.35);
        s.stock.food -= lostFood; s.stock.timber *= 0.85;
        const mill = ECHO.Production && ECHO.Production.facility(world, s, 'mill');
        if (mill && mill.fac.state === 'working' && rng.chance(0.4)) { mill.fac.state = 'damaged'; mill.fac.hp = 35; }
        let drowned = 0;
        for (const n of ECHO.People.residents(world, s)) if (rng.chance(0.012)) { ECHO.People.kill(world, n, 'drowned in the flood'); drowned++; }
        s.unrest = Math.min(100, (s.unrest || 0) + 5);
        s._floodDay = world.day;
        ECHO.Chronicle.add(world, { text: `The river burst its banks at ${s.name}, ruining ${Math.round(lostFood)} sacks of grain${mill && mill.fac.state === 'damaged' ? ' and damaging the mill' : ''}${drowned ? `; ${drowned} drowned` : ''}.`, kind: 'nature', importance: 2, sid: s.id });
      }
    },
    // effects
    at(world, s) { return W.state(world, W.regionOf(world, s.x, s.y)); },
    cropMult(world, s) {
      const w = W.at(world, s);
      let m = 1;
      if (w.drought) m *= U.clamp(0.8 - (world.day - (w.droughtSince || world.day)) * 0.008, 0.5, 0.8);
      if (w.today === 'storm') m *= 0.85;
      if (w.today === 'heat') m *= 0.92;
      if (world.day - (s._floodDay || -99) < 10) m *= 0.6;
      return m;
    },
    needMult(world, s) { const w = W.at(world, s); return w.harsh ? 1.12 : 1; },
    // what it is like outside right now where the player stands
    here(world, x, y) { return W.state(world, W.regionOf(world, x, y)); },
    word(w) {
      return { clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', storm: 'Storm', snow: 'Snow', blizzard: 'Blizzard', fog: 'Fog', heat: 'Heat' }[w.today] + (w.drought ? ' · Drought' : '') + (w.harsh ? ' · Bitter winter' : '');
    }
  };
})();
