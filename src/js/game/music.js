// Music and ambience, composed live with the Web Audio API.
//
// Nothing is a recording. Each mood (the wild by day, the wild by night, a
// town, an inn, a fight, a festival…) has a key, a mode, a tempo and a set of
// instruments. A short piece is written on the spot — a two-bar motif, varied
// and answered, over a chord progression — played once, and followed by a
// silence, as the open world has its own sounds to listen to. Birds sing by
// day, crickets by night, the wind rises in winter and water murmurs by the
// river. Discoveries are marked by short stingers.
(function () {
  const { U } = ECHO;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const SCALES = {
    ionian: [0, 2, 4, 5, 7, 9, 11], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10], aeolian: [0, 2, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], phrygian: [0, 1, 3, 5, 7, 8, 10]
  };

  // ---------------------------------------------------------------- the moods
  // prog: chord degrees (0 = tonic) one per bar. mel: degrees the melody may use
  // (pentatonic subsets keep wandering tunes sweet). rest: silence after a piece.
  const MOODS = {
    title: { root: 50, scale: 'dorian', bpm: 66, bar: 8, progs: [[0, 5, 3, 4], [0, 3, 5, 4], [0, 6, 5, 4]], mel: [0, 1, 2, 4, 5], lead: 'bell', pad: 'choir', arp: 'harp', bass: true, drums: null, rest: [3, 6], bars: 8, density: 0.5, vol: 0.9 },
    wild: { root: 55, scale: 'lydian', bpm: 74, bar: 8, progs: [[0, 1, 0, 4], [0, 5, 1, 4], [0, 3, 0, 4], [0, 1, 5, 4]], mel: [0, 1, 2, 4, 5], lead: 'flute', pad: 'pad', arp: 'harp', bass: true, drums: null, rest: [24, 55], bars: 8, density: 0.55, vol: 0.75 },
    night: { root: 57, scale: 'aeolian', bpm: 58, bar: 8, progs: [[0, 5, 3, 6], [0, 3, 5, 4], [0, 6, 5, 6]], mel: [0, 2, 3, 4, 6], lead: 'musicbox', pad: 'choir', arp: null, bass: true, drums: null, rest: [28, 60], bars: 8, density: 0.4, vol: 0.7 },
    town: { root: 55, scale: 'mixolydian', bpm: 96, bar: 8, progs: [[0, 6, 3, 0], [0, 3, 4, 0], [0, 4, 6, 3], [3, 0, 4, 0]], mel: [0, 1, 2, 3, 4, 5], lead: 'flute', pad: null, arp: 'lute', bass: true, drums: 'frame', rest: [10, 22], bars: 8, density: 0.65, vol: 0.62 },
    townNight: { root: 52, scale: 'dorian', bpm: 70, bar: 8, progs: [[0, 3, 0, 4], [0, 6, 3, 4]], mel: [0, 2, 3, 4, 6], lead: 'lute', pad: 'pad', arp: null, bass: true, drums: null, rest: [25, 50], bars: 8, density: 0.45, vol: 0.55 },
    inn: { root: 50, scale: 'mixolydian', bpm: 108, bar: 6, progs: [[0, 6, 0, 4], [0, 3, 6, 0], [0, 4, 3, 0]], mel: [0, 1, 2, 3, 4, 5], lead: 'fiddle', pad: null, arp: 'lute', bass: true, drums: 'jig', rest: [6, 14], bars: 8, density: 0.75, vol: 0.55 },
    interior: { root: 53, scale: 'ionian', bpm: 72, bar: 8, progs: [[0, 3, 4, 0], [0, 5, 3, 4]], mel: [0, 1, 2, 4, 5], lead: 'lute', pad: 'pad', arp: null, bass: false, drums: null, rest: [20, 40], bars: 8, density: 0.45, vol: 0.45 },
    sacred: { root: 52, scale: 'dorian', bpm: 52, bar: 8, progs: [[0, 3, 0, 4], [0, 5, 3, 0]], mel: [0, 1, 2, 3, 4], lead: 'choirLead', pad: 'choir', arp: null, bass: true, drums: null, rest: [10, 20], bars: 8, density: 0.35, vol: 0.55 },
    combat: { root: 50, scale: 'harmonic', bpm: 132, bar: 8, progs: [[0, 0, 5, 4], [0, 5, 3, 4], [0, 6, 5, 4]], mel: [0, 1, 2, 3, 4, 5, 6], lead: 'strings', pad: 'pad', arp: 'ostinato', bass: true, drums: 'war', rest: [0, 0], bars: 8, density: 0.8, vol: 0.62 },
    boss: { root: 52, scale: 'phrygian', bpm: 144, bar: 8, progs: [[0, 1, 0, 6], [0, 5, 1, 0]], mel: [0, 1, 2, 3, 4, 5, 6], lead: 'horn', pad: 'choir', arp: 'ostinato', bass: true, drums: 'war', rest: [0, 0], bars: 8, density: 0.85, vol: 0.7 },
    festival: { root: 55, scale: 'ionian', bpm: 124, bar: 6, progs: [[0, 4, 0, 4], [0, 3, 4, 0], [0, 5, 3, 4]], mel: [0, 1, 2, 3, 4, 5], lead: 'fiddle', pad: null, arp: 'lute', bass: true, drums: 'jig', rest: [2, 5], bars: 8, density: 0.85, vol: 0.62 },
    wonder: { root: 59, scale: 'lydian', bpm: 60, bar: 8, progs: [[0, 1, 0, 1], [0, 5, 1, 4]], mel: [0, 1, 2, 3, 4, 6], lead: 'bell', pad: 'choir', arp: 'harp', bass: false, drums: null, rest: [2, 4], bars: 4, density: 0.5, vol: 0.7 }
  };

  // Drum patterns on the eighth-note grid: k = deep drum, s = small drum, h = shaker
  const DRUMS = {
    frame: { 8: ['k', '', 'h', '', 's', '', 'h', 'h'] },
    jig: { 6: ['k', 'h', 'h', 's', 'h', 'h'] },
    war: { 8: ['k', '', 'k', 'h', 's', '', 'k', 's'] }
  };
  const RHYTHMS = {
    8: [[1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0], [1, 0, 0, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 0], [1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0]],
    6: [[1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0], [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0], [1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0]],
    slow: [[1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0]]
  };

  const M = ECHO.Music = {
    ctx: null, enabled: true, volume: 0.55, mood: null, want: null, layers: [], amb: {}, t: 0, ducked: 0,

    // ------------------------------------------------------------ setup
    setup() {
      const S = ECHO.Sfx;
      if (M.ctx || !S.ctx) return !!M.ctx;
      const c = M.ctx = S.ctx;
      try { const v = JSON.parse(localStorage.getItem('echo.music') || 'null'); if (v) { M.enabled = v.enabled !== false; M.volume = v.volume != null ? v.volume : 0.55; } } catch (e) { /* ignore */ }
      M.out = c.createGain(); M.out.gain.value = M.level();
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
      M.out.connect(comp); comp.connect(c.destination);
      M.dry = c.createGain(); M.dry.connect(M.out);
      // a long, soft hall for everything to bloom in
      M.verb = c.createConvolver();
      const len = c.sampleRate * 3.6, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch); let lp = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; lp += (w - lp) * 0.22; d[i] = lp * Math.pow(1 - i / len, 2.6) * 1.6; }
      }
      M.verb.buffer = ir;
      M.wet = c.createGain(); M.wet.gain.value = 0.55; M.wet.connect(M.verb); M.verb.connect(M.out);
      M.ambOut = c.createGain(); M.ambOut.gain.value = 1; M.ambOut.connect(S.master);
      M.ambWet = c.createGain(); M.ambWet.gain.value = 0.25; M.ambWet.connect(M.verb);
      setInterval(M.tick, 60);
      return true;
    },
    level() { return M.enabled && ECHO.Sfx.enabled ? M.volume * 0.7 : 0; },
    setVolume(v) { M.volume = U.clamp(v, 0, 1); M.save(); },
    setEnabled(on) { M.enabled = on; M.save(); },
    save() {
      if (M.out) M.out.gain.setTargetAtTime(M.level(), M.ctx.currentTime, 0.3);
      try { localStorage.setItem('echo.music', JSON.stringify({ enabled: M.enabled, volume: M.volume })); } catch (e) { /* ignore */ }
    },
    ready() { return M.setup() && M.ctx.state === 'running'; },

    // ------------------------------------------------------------ voices
    // Every voice: (bus, t, freq, dur, vel). bus = a layer gain node.
    voice(bus, wetAmt) {
      const c = M.ctx, g = c.createGain();
      g.connect(bus);
      if (wetAmt) { const s = c.createGain(); s.gain.value = wetAmt; g.connect(s); s.connect(bus._wet); }
      return g;
    },
    env(g, t, a, peak, hold, rel) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
      if (hold > 0) g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0, hold) + rel);
      return t + a + Math.max(0, hold) + rel + 0.05;
    },
    osc(type, f, t, end, dest, detune = 0) {
      const o = M.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
      o.connect(dest); o.start(t); o.stop(end); return o;
    },
    INST: {
      // plucked lute: bright attack that darkens quickly
      lute(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.5), lp = M.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
        lp.frequency.setValueAtTime(Math.min(9000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.5), t + 0.35);
        lp.connect(g);
        const end = M.env(g, t, 0.004, 0.22 * vel, 0, Math.min(1.6, 0.5 + dur));
        M.osc('sawtooth', f, t, end, lp); M.osc('triangle', f * 2, t, end, lp, 4);
      },
      harp(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.85);
        const end = M.env(g, t, 0.003, 0.17 * vel, 0, 2.2);
        M.osc('triangle', f, t, end, g); const g2 = M.ctx.createGain(); g2.gain.value = 0.3; g2.connect(g); M.osc('sine', f * 2, t, end, g2);
      },
      musicbox(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.9);
        const end = M.env(g, t, 0.002, 0.14 * vel, 0, 1.8);
        M.osc('sine', f * 2, t, end, g);
        const g2 = M.ctx.createGain(); g2.gain.value = 0.18; g2.connect(g); M.osc('sine', f * 8, t, Math.min(end, t + 0.4), g2);
      },
      bell(bus, t, f, dur, vel) {
        const g = M.voice(bus, 1.0);
        const end = M.env(g, t, 0.002, 0.12 * vel, 0, 3.2);
        M.osc('sine', f * 2, t, end, g);
        const g2 = M.ctx.createGain(); g2.gain.setValueAtTime(0.35, t); g2.gain.exponentialRampToValueAtTime(0.01, t + 1.2); g2.connect(g); M.osc('sine', f * 2 * 2.76, t, t + 1.3, g2);
        const g3 = M.ctx.createGain(); g3.gain.setValueAtTime(0.12, t); g3.gain.exponentialRampToValueAtTime(0.005, t + 0.5); g3.connect(g); M.osc('sine', f * 2 * 5.4, t, t + 0.6, g3);
      },
      flute(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.7);
        const end = M.env(g, t, 0.07, 0.11 * vel, Math.max(0.05, dur - 0.12), 0.25);
        const o = M.osc('sine', f, t, end, g);
        const lfo = M.ctx.createOscillator(), ld = M.ctx.createGain(); lfo.frequency.value = 5.2; ld.gain.setValueAtTime(0, t); ld.gain.linearRampToValueAtTime(f * 0.006, t + 0.35);
        lfo.connect(ld); ld.connect(o.frequency); lfo.start(t); lfo.stop(end);
        const g2 = M.ctx.createGain(); g2.gain.value = 0.12; g2.connect(g); M.osc('triangle', f * 2, t, end, g2);
      },
      fiddle(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.45), lp = M.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(5000, f * 5); lp.Q.value = 1; lp.connect(g);
        const end = M.env(g, t, 0.03, 0.075 * vel, Math.max(0.03, dur - 0.06), 0.12);
        const o = M.osc('sawtooth', f, t, end, lp);
        const lfo = M.ctx.createOscillator(), ld = M.ctx.createGain(); lfo.frequency.value = 6; ld.gain.value = f * 0.005; lfo.connect(ld); ld.connect(o.frequency); lfo.start(t); lfo.stop(end);
      },
      strings(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.5), lp = M.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(g);
        const end = M.env(g, t, 0.015, 0.07 * vel, Math.max(0.02, dur * 0.6), 0.1);
        M.osc('sawtooth', f, t, end, lp, -6); M.osc('sawtooth', f, t, end, lp, 6);
      },
      horn(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.6), lp = M.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1300, t + 0.2); lp.connect(g);
        const end = M.env(g, t, 0.08, 0.12 * vel, Math.max(0.05, dur - 0.1), 0.25);
        M.osc('sawtooth', f, t, end, lp); M.osc('square', f / 2, t, end, lp);
      },
      choirLead(bus, t, f, dur, vel) { M.INST.choir(bus, t, [f], Math.max(dur, 0.6), vel * 1.4); },
      // sustained chords
      pad(bus, t, fs, dur, vel) {
        const g = M.voice(bus, 0.9), lp = M.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 850; lp.connect(g);
        const end = M.env(g, t, 1.2, 0.035 * vel, Math.max(0, dur - 1.2), 1.8);
        for (const f of fs) { M.osc('sawtooth', f, t, end, lp, -8); M.osc('sawtooth', f, t, end, lp, 7); }
      },
      choir(bus, t, fs, dur, vel) {
        const g = M.voice(bus, 1.0);
        const end = M.env(g, t, 1.0, 0.05 * vel, Math.max(0, dur - 1.0), 2.0);
        // an "ah" — two vowel formants over a soft buzz
        const f1 = M.ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 760; f1.Q.value = 5; f1.connect(g);
        const f2 = M.ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 7; f2.connect(g);
        for (const f of fs) for (const dt of [-9, 9]) { M.osc('sawtooth', f, t, end, f1, dt); M.osc('sawtooth', f, t, end, f2, dt); }
      },
      bass(bus, t, f, dur, vel) {
        const g = M.voice(bus, 0.15), lp = M.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(g);
        const end = M.env(g, t, 0.01, 0.2 * vel, Math.max(0.05, dur * 0.7), 0.3);
        M.osc('triangle', f, t, end, lp); M.osc('sine', f, t, end, lp);
      },
      drum(bus, t, kind, vel) {
        const c = M.ctx, g = M.voice(bus, kind === 'k' ? 0.25 : 0.15);
        if (kind === 'k') {
          const end = M.env(g, t, 0.003, 0.45 * vel, 0, 0.35);
          const o = M.osc('sine', 110, t, end, g); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
        } else {
          const src = c.createBufferSource(); src.buffer = ECHO.Sfx.noiseBuf;
          const f = c.createBiquadFilter(); f.type = kind === 'h' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'h' ? 6500 : 1800; f.Q.value = kind === 'h' ? 0.7 : 1.2;
          src.connect(f); f.connect(g);
          const end = M.env(g, t, 0.002, (kind === 'h' ? 0.07 : 0.22) * vel, 0, kind === 'h' ? 0.05 : 0.12);
          src.start(t, Math.random()); src.stop(end);
          if (kind === 's') { const o = M.osc('triangle', 220, t, t + 0.1, g); o.frequency.exponentialRampToValueAtTime(140, t + 0.08); }
        }
      }
    },

    // ------------------------------------------------------------ composing
    deg(md, d) {
      const sc = SCALES[md.scale];
      const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
      return md.root + 12 * o + sc[i];
    },
    compose(name) {
      const md = MOODS[name];
      const r = Math.random;
      const pick = a => a[Math.floor(r() * a.length)];
      const prog = pick(md.progs);
      const bar = md.bar;
      const bars = md.bars;
      const ev = [];
      const chordAt = b => prog[Math.floor(b / 1) % prog.length];
      const melOk = d => md.mel.includes(((d % 7) + 7) % 7);
      const chordTones = c => [c, c + 2, c + 4];
      // a motif: two bars of rhythm, a contour of steps
      const rhythms = md.density < 0.5 ? RHYTHMS.slow : RHYTHMS[bar] || RHYTHMS[8];
      const motif = () => {
        const rh = pick(rhythms).slice(0, bar * 2);
        const steps = rh.map(() => pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]));
        return { rh, steps };
      };
      const A = motif(), B = motif();
      const sections = bars >= 8 ? [A, A, B, A] : [A, B];
      let cur = 7 + pick([0, 2, 4]);   // start an octave up, on a chord tone
      const lo = 4, hi = 13;
      sections.forEach((mo, si) => {
        const variant = si > 0 && mo === A;
        for (let i = 0; i < mo.rh.length; i++) {
          if (!mo.rh[i]) continue;
          if (variant && i >= mo.rh.length - 4 && r() < 0.5) continue;      // vary the tail
          const b = si * 2 + Math.floor(i / bar);
          const c = chordAt(b);
          let d = cur + (variant && r() < 0.3 ? -mo.steps[i] : mo.steps[i]);
          d = U.clamp(d, lo, hi);
          let guard = 0;
          while (!melOk(d) && guard++ < 4) d += d < cur ? -1 : 1;
          // strong beats lean on the chord
          if (i % bar === 0 || (bar === 8 && i % bar === 4)) {
            const tones = chordTones(c).flatMap(x => [x + 7, x + 14]);
            d = tones.reduce((a, x) => Math.abs(x - d) < Math.abs(a - d) ? x : a, tones[0]);
          }
          let len = 1; while (i + len < mo.rh.length && !mo.rh[i + len] && len < 4) len++;
          cur = d;
          ev.push({ at: si * bar * 2 + i, inst: md.lead, m: M.deg(md, d), dur: len, vel: 0.85 + r() * 0.2 + (i % bar === 0 ? 0.1 : 0) });
        }
      });
      // end on the tonic, long
      const endAt = bars * bar;
      ev.push({ at: endAt - (bar === 6 ? 3 : 4), inst: md.lead, m: M.deg(md, 7), dur: bar === 6 ? 3 : 4, vel: 0.9 });
      for (let b = 0; b < bars; b++) {
        const c = chordAt(b), t0 = b * bar;
        const isLast = b === bars - 1;
        const cc = isLast ? 0 : c;
        if (md.pad && b % 2 === 0) ev.push({ at: t0, inst: md.pad, ms: [M.deg(md, cc), M.deg(md, cc + 2), M.deg(md, cc + 4)].map(x => x - 12), dur: bar * 2, vel: 1 });
        if (md.bass) {
          ev.push({ at: t0, inst: 'bass', m: M.deg(md, cc) - 24, dur: bar / 2, vel: 1 });
          if (md.density > 0.6) ev.push({ at: t0 + bar / 2, inst: 'bass', m: M.deg(md, cc + (r() < 0.5 ? 4 : 0)) - 24, dur: bar / 2, vel: 0.8 });
        }
        if (md.arp) {
          const tones = [cc, cc + 2, cc + 4, cc + 7];
          const pat = md.arp === 'ostinato' ? [0, 0, 2, 0, 1, 0, 2, 3] : bar === 6 ? [0, 2, 1, 3, 1, 2] : md.density < 0.6 ? [0, -1, 1, -1, 2, -1, 3, -1] : [0, 2, 1, 2, 3, 2, 1, 2];
          for (let i = 0; i < bar; i++) {
            const k = pat[i % pat.length]; if (k < 0) continue;
            ev.push({ at: t0 + i, inst: md.arp === 'ostinato' ? 'strings' : md.arp, m: M.deg(md, tones[k]) - (md.arp === 'ostinato' ? 12 : 0), dur: 1, vel: md.arp === 'ostinato' ? 0.6 : 0.7 + (i === 0 ? 0.2 : 0) });
          }
        }
        if (md.drums) {
          const pat = DRUMS[md.drums][bar] || DRUMS[md.drums][8];
          for (let i = 0; i < bar; i++) if (pat[i]) ev.push({ at: t0 + i, drum: pat[i], vel: 0.8 + r() * 0.2 });
          if (isLast) ev.push({ at: t0 + bar - 1, drum: 's', vel: 1 });
        }
      }
      ev.sort((a, b) => a.at - b.at);
      return { ev, len: endAt, step: 60 / md.bpm / 2 };
    },

    // ------------------------------------------------------------ layers
    startLayer(name) {
      const c = M.ctx, md = MOODS[name];
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, c.currentTime); g.gain.exponentialRampToValueAtTime(md.vol, c.currentTime + 1.5);
      g.connect(M.dry);
      g._wet = c.createGain(); g._wet.gain.value = 1; g._wet.connect(M.wet);
      const L = { name, md, bus: g, piece: null, i: 0, t0: 0, restUntil: c.currentTime + 0.6, dead: false };
      M.layers.push(L);
      return L;
    },
    fadeLayer(L, secs = 2.5) {
      if (L.dead) return;
      L.dead = true;
      const t = M.ctx.currentTime; L.deadAt = t;
      L.bus.gain.cancelScheduledValues(t); L.bus.gain.setValueAtTime(Math.max(0.0001, L.bus.gain.value), t); L.bus.gain.exponentialRampToValueAtTime(0.0001, t + secs);
      setTimeout(() => { try { L.bus.disconnect(); L.bus._wet.disconnect(); } catch (e) { /* gone */ } }, secs * 1000 + 3500);
    },
    setMood(name) {
      M.want = name;
    },
    tick() {
      if (!M.ctx || M.ctx.state !== 'running') return;
      if (typeof document !== 'undefined' && document.hidden) return;
      const now = M.ctx.currentTime;
      // change of mood: fade the old one, begin the new
      const cur = M.layers.find(L => !L.dead);
      if ((cur ? cur.name : null) !== M.want) {
        if (cur) M.fadeLayer(cur, MOODS[M.want] && (M.want === 'combat' || M.want === 'boss') ? 0.8 : 2.5);
        if (M.want && MOODS[M.want]) { const L = M.startLayer(M.want); if (cur && (M.want === 'combat' || M.want === 'boss')) L.restUntil = now + 0.15; }
      }
      M.layers = M.layers.filter(L => !L.dead || now - (L.deadAt || (L.deadAt = now)) < 6);
      for (const L of M.layers) {
        if (L.dead) continue;
        if (!L.piece) {
          if (now < L.restUntil) continue;
          L.piece = M.compose(L.name); L.i = 0; L.t0 = Math.max(now + 0.1, L.restUntil);
        }
        const P = L.piece;
        while (L.i < P.ev.length && L.t0 + P.ev[L.i].at * P.step < now + 0.35) {
          const e = P.ev[L.i++];
          const t = Math.max(now + 0.01, L.t0 + e.at * P.step + (e.drum ? 0 : (Math.random() - 0.5) * 0.012));
          try {
            if (e.drum) M.INST.drum(L.bus, t, e.drum, e.vel);
            else if (e.ms) M.INST[e.inst](L.bus, t, e.ms.map(mtof), e.dur * P.step, e.vel);
            else M.INST[e.inst](L.bus, t, mtof(e.m), e.dur * P.step, e.vel);
          } catch (err) { /* a voice failed; carry on */ }
        }
        if (L.i >= P.ev.length) {
          const end = L.t0 + P.len * P.step;
          const [a, b] = L.md.rest;
          L.restUntil = end + a + Math.random() * (b - a);
          L.piece = null;
        }
      }
    },

    // ------------------------------------------------------------ stingers
    // A few bars that mark a moment: something found, something given.
    stinger(kind) {
      if (!M.ready()) return;
      const c = M.ctx, t = c.currentTime + 0.05;
      const bus = c.createGain(); bus.gain.value = 0.9; bus.connect(M.dry);
      bus._wet = c.createGain(); bus._wet.connect(M.wet);
      setTimeout(() => { try { bus.disconnect(); bus._wet.disconnect(); } catch (e) { /* gone */ } }, 9000);
      // duck the score for a moment
      for (const L of M.layers) if (!L.dead) { const g = L.bus.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.exponentialRampToValueAtTime(Math.max(0.0001, L.md.vol * 0.2), t + 0.3); g.setValueAtTime(Math.max(0.0001, L.md.vol * 0.2), t + 3.5); g.exponentialRampToValueAtTime(L.md.vol, t + 6); }
      const I = M.INST, f = mtof;
      const seq = {
        discover: () => { [62, 66, 69, 73, 74].forEach((m, i) => I.harp(bus, t + i * 0.12, f(m), 1, 1)); I.choir(bus, t, [f(50), f(57), f(62)], 3, 1); I.bell(bus, t + 0.6, f(74), 2, 1); },
        echo: () => { [71, 74, 78, 81, 83, 86].forEach((m, i) => I.bell(bus, t + i * 0.18, f(m - 12), 1, 0.9)); I.choir(bus, t, [f(47), f(54), f(59), f(63)], 4.5, 1.2); },
        star: () => { [88, 84, 81, 76, 72, 69].forEach((m, i) => I.musicbox(bus, t + i * 0.07, f(m - 12), 1, 1)); I.choir(bus, t + 0.3, [f(57), f(64), f(69)], 3, 1); },
        wish: () => { [67, 71, 74, 79].forEach((m, i) => I.bell(bus, t + i * 0.3, f(m - 12), 1, 0.9)); I.pad(bus, t, [f(43), f(50), f(55), f(59)], 4, 1.2); },
        stag: () => { [64, 68, 71, 76, 75, 71].forEach((m, i) => I.flute(bus, t + i * 0.28, f(m), 0.3 + (i === 5 ? 1 : 0), 1)); I.choir(bus, t, [f(52), f(59), f(64)], 4, 1); },
        festival: () => { [67, 71, 74, 79, 74, 79].forEach((m, i) => I.fiddle(bus, t + i * 0.15, f(m), 0.14, 1)); [0, 0.3, 0.45, 0.6, 0.9].forEach(d => I.drum(bus, t + d, d === 0 ? 'k' : 's', 1)); },
        letter: () => { [72, 76, 79].forEach((m, i) => I.harp(bus, t + i * 0.1, f(m), 1, 0.8)); },
        fate: () => { [57, 64, 69, 72, 76, 81].forEach((m, i) => I.harp(bus, t + i * 0.1, f(m), 1, 1)); I.choir(bus, t, [f(45), f(52), f(57), f(61)], 5, 1.3); I.bell(bus, t + 0.7, f(81), 3, 1); }
      }[kind];
      if (seq) seq();
    },

    // ------------------------------------------------------------ the world's sounds
    // Called a few times a second with what is around the listener.
    ambience(o) {
      if (!M.ready()) return;
      const c = M.ctx, now = c.currentTime, A = M.amb;
      const bed = (key, make, level) => {
        if (!A[key] && level > 0.001) A[key] = make();
        if (A[key]) A[key].g.gain.setTargetAtTime(level, now, 1.2);
      };
      const noiseBed = (type, freq, q) => () => {
        const src = c.createBufferSource(); src.buffer = ECHO.Sfx.noiseBuf; src.loop = true; src.playbackRate.value = 0.6;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = c.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(g); g.connect(M.ambOut); src.start();
        return { src, f, g };
      };
      // wind: rises in winter, on open hills and in storms; gusts
      const gust = 0.6 + 0.4 * Math.sin(now * 0.31) * Math.sin(now * 0.17 + 1);
      bed('wind', noiseBed('bandpass', 420, 0.8), o.wind * 0.09 * gust);
      if (A.wind) A.wind.f.frequency.setTargetAtTime(300 + 260 * gust, now, 1.5);
      bed('water', noiseBed('lowpass', 1100, 0.4), o.water * 0.05);
      bed('fire', noiseBed('lowpass', 500, 0.6), o.fire * 0.05);
      // birds by day
      if (o.birds > 0 && Math.random() < o.birds * 0.07) M.bird(now + Math.random() * 0.2);
      // crickets by night
      if (o.crickets > 0 && Math.random() < o.crickets * 0.12) M.cricket(now + Math.random() * 0.2);
      // a fire crackles
      if (o.fire > 0.2 && Math.random() < o.fire * 0.3) ECHO.Sfx.noise(now, 0.03, 'highpass', 2500, 4000, 0.7, 0.05 * o.fire);
    },
    bird(t) {
      const c = M.ctx, kind = Math.floor(Math.random() * 4);
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      const g = c.createGain(); g.gain.value = 0.5;
      if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan); pan.connect(M.ambOut); } else g.connect(M.ambOut);
      const s = c.createGain(); s.gain.value = 0.6; g.connect(s); s.connect(M.ambWet);
      const n = kind === 0 ? 3 + Math.floor(Math.random() * 4) : kind === 1 ? 2 : kind === 2 ? 5 : 1;
      const base = [3200, 2400, 4200, 1800][kind] * (0.85 + Math.random() * 0.3);
      for (let i = 0; i < n; i++) {
        const t0 = t + i * (kind === 2 ? 0.07 : 0.16 + Math.random() * 0.05);
        const o = c.createOscillator(); o.type = 'sine';
        const f0 = base * (kind === 1 && i === 1 ? 0.8 : 1) * (1 + (Math.random() - 0.5) * 0.1);
        o.frequency.setValueAtTime(f0 * (kind === 3 ? 0.7 : 1.15), t0);
        o.frequency.exponentialRampToValueAtTime(f0 * (kind === 3 ? 1.25 : 0.82), t0 + (kind === 3 ? 0.5 : 0.08));
        const e = c.createGain(); M.env(e, t0, 0.008, 0.035, 0, kind === 3 ? 0.45 : 0.07);
        o.connect(e); e.connect(g); o.start(t0); o.stop(t0 + 0.7);
      }
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 3000);
    },
    cricket(t) {
      const c = M.ctx;
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      const g = c.createGain(); g.gain.value = 0.35;
      if (pan) { pan.pan.value = Math.random() * 1.8 - 0.9; g.connect(pan); pan.connect(M.ambOut); } else g.connect(M.ambOut);
      const f = 4300 + Math.random() * 700;
      const pulses = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pulses; i++) {
        const t0 = t + i * 0.045;
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const e = c.createGain(); M.env(e, t0, 0.004, 0.022, 0.012, 0.012);
        o.connect(e); e.connect(g); o.start(t0); o.stop(t0 + 0.06);
      }
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 1500);
    },

    // ------------------------------------------------------------ choosing the mood
    update(game, dt) {
      M.t -= dt;
      if (M.t > 0) return;
      M.t = 0.4;
      if (!M.ready()) return;
      const world = game.world, pl = game.pl, pe = game.pe;
      if (!world || !pl || !pe) return;
      const rm = ECHO.Interior && ECHO.Interior.cur;
      const night = game.isNight();
      const s = game.currentSid ? ECHO.Sim.settlement(world, game.currentSid) : null;
      const fighting = game.combatT != null && game.time - game.combatT < 6 && game.ents.some(e => !e.dead && e !== pe && game.hostileTo(pe, e) && U.dist(e.x, e.y, pe.x, pe.y) < 14);
      const fest = ECHO.Festivals && s && ECHO.Festivals.liveAt(world, s);
      let mood;
      if (ECHO.UI.bossEnt && !ECHO.UI.bossEnt.dead) mood = 'boss';
      else if (fighting) mood = 'combat';
      else if (ECHO.Marvels && ECHO.Marvels.enchanted(game)) mood = 'wonder';
      else if (rm) mood = rm.b && rm.b.type === 'inn' ? 'inn' : rm.b && (rm.b.type === 'temple' || rm.b.type === 'shrine') ? 'sacred' : 'interior';
      else if (fest) mood = 'festival';
      else if (s) mood = night ? 'townNight' : 'town';
      else mood = night ? 'night' : 'wild';
      M.setMood(mood);
      // ambience
      const wx = ECHO.Weather && !rm ? ECHO.Weather.here(world, pe.x, pe.y) : { today: 'clear' };
      const season = ECHO.TIME.dateOf(world.day).seasonIdx;
      const wet = ['rain', 'storm', 'snow', 'blizzard'].includes(wx.today);
      const T = ECHO.TILE;
      let water = 0, trees = 0, high = 0, fire = 0;
      if (!rm) {
        for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
          const t = ECHO.World.tile(world, pe.x + dx, pe.y + dy);
          if (t === T.WATER || t === T.DEEP) water++;
          if (t === T.TREE || t === T.FOREST) trees++;
          if (t === T.ROCK || t === T.HILL) high++;
        }
        if (ECHO.Festivals && fest) fire = Math.max(0, 1 - U.dist(pe.x, pe.y, s.x, s.y) / 9);
        for (const c of world.camps) if (c.alive && Math.abs(c.x - pe.x) < 7 && Math.abs(c.y - pe.y) < 7) fire = Math.max(fire, 0.6);
      } else if (rm.b && (rm.b.type === 'inn' || rm.b.type === 'house' || rm.b.type === 'smithy')) fire = 0.35;
      const dl = ECHO.TIME.daylight(world.minute);
      M.ambience({
        wind: rm ? 0 : U.clamp(0.25 + high * 0.05 + (season === 3 ? 0.35 : 0) + (wx.today === 'storm' || wx.today === 'blizzard' ? 0.6 : wet ? 0.2 : 0), 0, 1.2),
        water: rm ? 0 : U.clamp(water / 8, 0, 1),
        fire,
        birds: rm || wet || season === 3 ? 0 : dl > 0.6 ? (s ? 0.25 : 0.5 + trees * 0.06) : dl > 0.2 ? 0.25 : 0,
        crickets: rm || wet || season === 3 || season === 0 ? 0 : dl < 0.2 ? (s ? 0.35 : 0.8) : 0
      });
    },
    quiet() {
      if (!M.ctx) return;
      for (const k of Object.keys(M.amb)) M.amb[k].g.gain.setTargetAtTime(0, M.ctx.currentTime, 0.5);
    }
  };
  ECHO.Music.MOODS = MOODS;
})();
