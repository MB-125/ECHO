// Sound effects, synthesized live with the Web Audio API (no audio files).
// Each sound is a few oscillators and filtered noise bursts shaped by
// envelopes; pitch is randomized slightly so repeated hits never sound
// identical. Audio starts on the first key or click (browser rule).
(function () {
  const S = ECHO.Sfx = {
    ctx: null, master: null, noiseBuf: null, enabled: true, volume: 0.7, last: {},

    init() {
      const start = () => {
        if (S.ctx) { if (S.ctx.state === 'suspended') S.ctx.resume(); return; }
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          S.ctx = new AC();
          S.master = S.ctx.createGain();
          S.master.gain.value = S.enabled ? S.volume : 0;
          const comp = S.ctx.createDynamicsCompressor();
          comp.threshold.value = -14; comp.ratio.value = 4;
          S.master.connect(comp); comp.connect(S.ctx.destination);
          const len = S.ctx.sampleRate * 1.5;
          S.noiseBuf = S.ctx.createBuffer(1, len, S.ctx.sampleRate);
          const d = S.noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
          if (ECHO.Music) ECHO.Music.setup();
        } catch (e) { S.ctx = null; }
      };
      window.addEventListener('keydown', start);
      window.addEventListener('mousedown', start);
      try { const v = JSON.parse(localStorage.getItem('echo.sound') || 'null'); if (v) { S.enabled = v.enabled !== false; S.volume = v.volume != null ? v.volume : 0.7; } } catch (e) { /* ignore */ }
    },
    setEnabled(on) {
      S.enabled = on;
      if (S.master) S.master.gain.value = on ? S.volume : 0;
      if (ECHO.Music && ECHO.Music.out) ECHO.Music.save();
      try { localStorage.setItem('echo.sound', JSON.stringify({ enabled: S.enabled, volume: S.volume })); } catch (e) { /* ignore */ }
    },

    // ---- building blocks
    env(g, t0, a, peak, dcy) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dcy);
    },
    noise(t0, dur, type, f0, f1, q, peak, attack = 0.005) {
      const c = S.ctx;
      const src = c.createBufferSource(); src.buffer = S.noiseBuf;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
      const g = c.createGain(); S.env(g, t0, attack, peak, dur);
      src.connect(f); f.connect(g); g.connect(S.master);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
    },
    tone(t0, dur, wave, f0, f1, peak, attack = 0.004) {
      const c = S.ctx;
      const o = c.createOscillator(); o.type = wave;
      o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const g = c.createGain(); S.env(g, t0, attack, peak, dur);
      o.connect(g); g.connect(S.master);
      o.start(t0); o.stop(t0 + dur + 0.05);
    },

    // A looping bed of rain, faded to the given level (0..1).
    setRain(level) {
      if (!S.ctx || S.ctx.state !== 'running') return;
      if (!S.rainNode && level > 0) {
        const src = S.ctx.createBufferSource(); src.buffer = S.noiseBuf; src.loop = true;
        const f = S.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.5;
        const f2 = S.ctx.createBiquadFilter(); f2.type = 'highshelf'; f2.frequency.value = 4000; f2.gain.value = -8;
        const g = S.ctx.createGain(); g.gain.value = 0;
        src.connect(f); f.connect(f2); f2.connect(g); g.connect(S.master); src.start();
        S.rainNode = { src, g };
      }
      if (S.rainNode) S.rainNode.g.gain.setTargetAtTime(level * 0.16, S.ctx.currentTime, 0.8);
    },
    // ---- the sounds
    play(name, o = {}) {
      if (!S.ctx || !S.enabled || S.ctx.state !== 'running') return;
      const now = S.ctx.currentTime;
      // don't stack the same sound more than every 30ms
      if (S.last[name] && now - S.last[name] < 0.03) return;
      S.last[name] = now;
      const r = (a = 0.08) => 1 + (Math.random() - 0.5) * a * 2;
      const p = o.pitch || 1, v = o.vol == null ? 1 : o.vol;
      const t = now + 0.005;
      switch (name) {
        case 'swing': S.noise(t, 0.16, 'bandpass', 900 * p * r(), 2600 * p, 1.4, 0.35 * v, 0.02); break;
        case 'swingHeavy': S.noise(t, 0.3, 'bandpass', 380 * r(), 1500, 1.1, 0.5 * v, 0.05); S.tone(t, 0.25, 'sine', 140, 70, 0.15 * v); break;
        case 'hit':
          S.tone(t, 0.12, 'sine', 160 * p * r(), 55, 0.55 * v);
          S.noise(t, 0.09, 'lowpass', 2400 * r(), 400, 0.7, 0.45 * v);
          break;
        case 'hitHeavy':
          S.tone(t, 0.22, 'sine', 120 * r(), 40, 0.75 * v);
          S.noise(t, 0.2, 'lowpass', 1800, 200, 0.7, 0.6 * v);
          S.noise(t + 0.01, 0.06, 'highpass', 3000, 6000, 0.5, 0.2 * v);
          break;
        case 'crit':
          S.tone(t, 0.1, 'square', 1400 * r(), 700, 0.12 * v);
          S.tone(t, 0.18, 'sine', 180, 50, 0.6 * v);
          S.noise(t, 0.12, 'bandpass', 3200, 1200, 2, 0.35 * v);
          break;
        case 'block':
          S.tone(t, 0.25, 'triangle', 820 * r(0.05), 760, 0.28 * v);
          S.tone(t, 0.2, 'triangle', 1230 * r(0.05), 1150, 0.14 * v);
          S.noise(t, 0.06, 'highpass', 2500, 5000, 0.7, 0.3 * v);
          break;
        case 'parry':
          S.tone(t, 0.5, 'sine', 1560, 1500, 0.3 * v); S.tone(t, 0.45, 'triangle', 2340, 2300, 0.12 * v);
          S.noise(t, 0.08, 'highpass', 3000, 7000, 0.5, 0.35 * v);
          break;
        case 'shieldBlock': S.tone(t, 0.14, 'triangle', 300 * r(), 200, 0.35 * v); S.noise(t, 0.1, 'lowpass', 1200, 300, 0.7, 0.4 * v); break;
        case 'bowDraw': S.noise(t, 0.35, 'bandpass', 500, 900, 4, 0.06 * v, 0.2); break;
        case 'bowRelease': S.tone(t, 0.16, 'sawtooth', 220 * r(), 110, 0.16 * v); S.noise(t, 0.12, 'bandpass', 1800, 900, 2, 0.2 * v); break;
        case 'arrowHit': S.noise(t, 0.07, 'bandpass', 1500 * r(), 600, 1.5, 0.4 * v); S.tone(t, 0.06, 'sine', 300, 120, 0.3 * v); break;
        case 'perfect': S.tone(t, 0.3, 'sine', 1320, 1320, 0.18 * v); S.tone(t + 0.06, 0.3, 'sine', 1980, 1980, 0.12 * v); break;
        case 'fireCharge': S.noise(t, 0.25, 'bandpass', 300, 800, 1.2, 0.12 * v, 0.1); break;
        case 'fireCast': S.noise(t, 0.35, 'bandpass', 600, 2400, 0.9, 0.45 * v, 0.03); S.tone(t, 0.3, 'sawtooth', 90, 180, 0.08 * v); break;
        case 'explode':
          S.noise(t, 0.7, 'lowpass', 1600 * p, 80, 0.7, 0.85 * v, 0.005);
          S.tone(t, 0.5, 'sine', 90, 30, 0.7 * v);
          break;
        case 'hurt': S.tone(t, 0.18, 'sawtooth', 210 * r(), 120, 0.2 * v); S.noise(t, 0.12, 'lowpass', 1400, 300, 0.7, 0.45 * v); break;
        case 'dodge': S.noise(t, 0.2, 'bandpass', 600 * r(), 1800, 0.9, 0.22 * v, 0.03); break;
        case 'kill': S.tone(t, 0.35, 'sine', 95 * r(), 35, 0.7 * v); S.noise(t, 0.3, 'lowpass', 900, 120, 0.7, 0.5 * v); break;
        case 'growl': S.noise(t, 0.5, 'bandpass', 180 * r(), 120, 3, 0.25 * v, 0.08); S.tone(t, 0.45, 'sawtooth', 70 * r(), 55, 0.08 * v, 0.08); break;
        case 'roar':
          S.noise(t, 1.3, 'bandpass', 260, 120, 1.5, 0.7 * v, 0.15);
          S.tone(t, 1.2, 'sawtooth', 75, 45, 0.25 * v, 0.15); S.tone(t, 1.1, 'square', 52, 40, 0.1 * v, 0.2);
          break;
        case 'stomp': S.tone(t, 0.4, 'sine', 70, 28, 0.9 * v); S.noise(t, 0.35, 'lowpass', 500, 60, 0.7, 0.6 * v); break;
        case 'hoof': S.noise(t, 0.045, 'bandpass', 1300 * r(0.25), 700, 2.2, 0.16 * v, 0.002); S.tone(t, 0.07, 'sine', 170 * r(0.2), 80, 0.2 * v, 0.002); break;
        case 'snort': S.noise(t, 0.22, 'bandpass', 420 * r(), 180, 1.1, 0.22 * v, 0.02); S.noise(t + 0.24, 0.14, 'bandpass', 380 * r(), 200, 1.2, 0.12 * v, 0.02); break;
        case 'neigh': {
          const f = 560 * r(0.15);
          S.tone(t, 0.22, 'sawtooth', f * 0.8, f * 1.35, 0.07 * v, 0.03);
          for (let i = 0; i < 9; i++) S.tone(t + 0.2 + i * 0.075, 0.09, 'sawtooth', f * (1.35 - i * 0.07) * (i % 2 ? 1.05 : 0.95), f * (1.3 - i * 0.07), 0.065 * v * (1 - i / 11), 0.01);
          S.noise(t, 0.9, 'bandpass', 1400, 900, 1.5, 0.04 * v, 0.05);
          break;
        }
        case 'whistle': S.tone(t, 0.18, 'sine', 1500, 2300, 0.12 * v, 0.02); S.tone(t + 0.22, 0.32, 'sine', 2300, 1500, 0.12 * v, 0.02); break;
        case 'splash': S.noise(t, 0.35, 'lowpass', 1800 * r(0.2), 300, 0.8, 0.45 * v, 0.005); S.noise(t + 0.03, 0.25, 'bandpass', 2600 * r(0.2), 1200, 1.2, 0.18 * v, 0.01); S.tone(t, 0.12, 'sine', 160 * r(), 70, 0.12 * v); break;
        case 'wade': S.noise(t, 0.18, 'bandpass', 900 * r(0.3), 500, 1.4, 0.12 * v, 0.03); break;
        case 'hiss': S.noise(t, 0.6, 'highpass', 3000, 5000, 0.7, 0.18 * v, 0.02); break;
        case 'step': S.noise(t, 0.05, 'lowpass', 700 * r(0.2), 300, 0.7, 0.05 * v); break;
        case 'door': S.tone(t, 0.35, 'triangle', 140, 110, 0.12 * v, 0.05); S.noise(t + 0.25, 0.12, 'lowpass', 800, 200, 0.7, 0.35 * v); break;
        case 'coin': S.tone(t, 0.12, 'square', 1900, 1900, 0.06 * v); S.tone(t + 0.07, 0.22, 'square', 2530, 2530, 0.06 * v); break;
        case 'heal': S.tone(t, 0.5, 'sine', 520, 780, 0.15 * v, 0.05); S.tone(t + 0.1, 0.5, 'sine', 660, 990, 0.1 * v, 0.05); break;
        case 'thunder':
          S.noise(t, 2.6, 'lowpass', 300 * r(), 40, 0.8, 0.9 * v, 0.04);
          S.noise(t + 0.05, 1.2, 'lowpass', 900, 100, 0.7, 0.4 * v, 0.01);
          S.tone(t, 2.2, 'sine', 48, 28, 0.35 * v, 0.1);
          break;
        case 'levelup': [523, 659, 784].forEach((f, i) => S.tone(t + i * 0.08, 0.4, 'triangle', f, f, 0.12 * v)); break;
      }
    }
  };
})();
