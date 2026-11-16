// Sound effects generated with Web Audio (no audio files).

export function createAudio() {
  let ctx = null;
  let master = null;
  let noise = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function env(gainNode, t, attack, peak, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  return {
    /** Call from a user gesture (click) so the browser allows audio. */
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    shot(volume = 1) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.15;
      const bp = ctx.createBiquadFilter();
      bp.type = 'lowpass';
      bp.frequency.setValueAtTime(5200, t);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
      const g = ctx.createGain();
      env(g, t, 0.002, 0.9 * volume, 0.16);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.25);

      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const og = ctx.createGain();
      env(og, t, 0.002, 0.7 * volume, 0.12);
      o.connect(og).connect(master);
      o.start(t);
      o.stop(t + 0.2);
    },
    hit(headshot = false, shield = false) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = shield ? 'square' : 'sine';
      const f = headshot ? 2100 : shield ? 1300 : 1600;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.06);
      const g = ctx.createGain();
      env(g, t, 0.002, shield ? 0.12 : 0.22, 0.07);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.1);
    },
    kill() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [660, 990].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ctx.createGain();
        env(g, t + i * 0.07, 0.004, 0.25, 0.18);
        o.connect(g).connect(master);
        o.start(t + i * 0.07);
        o.stop(t + i * 0.07 + 0.25);
      });
    },
    reload() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [0, 0.18].forEach((dt) => {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const hp = ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.frequency.value = 2400;
        const g = ctx.createGain();
        env(g, t + dt, 0.002, 0.25, 0.05);
        src.connect(hp).connect(g).connect(master);
        src.start(t + dt);
        src.stop(t + dt + 0.08);
      });
    },
    explosion(volume = 1) {
      if (!ensure() || volume < 0.02) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.playbackRate.value = 0.5;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1800, t);
      lp.frequency.exponentialRampToValueAtTime(120, t + 0.8);
      const g = ctx.createGain();
      env(g, t, 0.005, 1.2 * volume, 0.9);
      src.connect(lp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 1);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.5);
      const og = ctx.createGain();
      env(og, t, 0.005, 1.0 * volume, 0.5);
      o.connect(og).connect(master);
      o.start(t);
      o.stop(t + 0.6);
    },
    pickup() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(520, t);
      o.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      const g = ctx.createGain();
      env(g, t, 0.004, 0.18, 0.1);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.15);
    },
    chest(vault = false) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const notes = vault ? [523, 659, 784, 1047] : [587, 784, 988];
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        env(g, t + i * 0.07, 0.005, 0.2, 0.35);
        o.connect(g).connect(master);
        o.start(t + i * 0.07);
        o.stop(t + i * 0.07 + 0.45);
      });
    },
  };
}
