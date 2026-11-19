// Neon Tide — every sound is synthesized with WebAudio: no audio files, no
// network. A low engine drone, a two-tone siren, gunshots, pickups and a short
// bass-led music loop that plays under the game.
const MUSIC_NOTES = [55, 0, 55, 65.41, 55, 0, 49, 58.27, 55, 0, 55, 65.41, 82.41, 0, 73.42, 65.41];
const MUSIC_STEP = 0.21;

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a low gain, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc2 = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc2.type = 'square';
      engineOsc.frequency.value = 50;
      engineOsc2.frequency.value = 75;
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineOsc2.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Siren: one oscillator that alternates between two notes.
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch { /* sound is decoration; never break the game */ }
  }

  function noiseBurst(dur, vol, lowpass) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start();
    } catch { /* see above */ }
  }

  function playMusicStep() {
    if (!ctx || muted) return;
    const freq = MUSIC_NOTES[musicStep % MUSIC_NOTES.length];
    musicStep += 1;
    if (freq > 0) blip(freq, MUSIC_STEP * 0.9, 'triangle', 0.10);
    if (musicStep % 4 === 0) noiseBurst(0.05, 0.05, 6000);
  }

  return {
    /** Call from any user gesture: browsers only allow audio after one. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (ctx && !musicTimer) musicTimer = window.setInterval(playMusicStep, MUSIC_STEP * 1000);
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() { return muted; },
    /** Engine pitch and loudness follow the driven car's speed (0 when on foot). */
    setEngine(speedRatio, driving) {
      if (!ctx || muted) return;
      try {
        const target = driving ? 0.05 + speedRatio * 0.05 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
        engineOsc.frequency.setTargetAtTime(50 + speedRatio * 130, ctx.currentTime, 0.1);
        engineOsc2.frequency.setTargetAtTime(75 + speedRatio * 195, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
    },
    /** The siren wails while any wanted stars are lit. */
    setSiren(on, time) {
      if (!ctx || muted) return;
      try {
        sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, ctx.currentTime, 0.2);
        if (on) sirenOsc.frequency.setTargetAtTime(Math.floor(time * 2) % 2 === 0 ? 720 : 960, ctx.currentTime, 0.05);
      } catch { /* ignore */ }
    },
    pickup() { blip(660, 0.12, 'sine', 0.22, 990); },
    cash() { blip(880, 0.1, 'sine', 0.2); window.setTimeout(() => blip(1320, 0.14, 'sine', 0.2), 90); },
    gunshot() { noiseBurst(0.12, 0.35, 2500); },
    melee() { noiseBurst(0.08, 0.2, 1200); },
    crash() { noiseBurst(0.2, 0.3, 900); },
    steal() { blip(300, 0.15, 'square', 0.15, 180); },
    missionComplete() {
      blip(523, 0.12, 'sine', 0.22);
      window.setTimeout(() => blip(659, 0.12, 'sine', 0.22), 120);
      window.setTimeout(() => blip(784, 0.22, 'sine', 0.22), 240);
    },
    busted() { blip(220, 0.5, 'sawtooth', 0.2, 110); },
  };
}

/** A silent stand-in for screenshots and tests, where no audio context exists. */
export function createSilentAudio() {
  const noop = () => {};
  return {
    unlock: noop, setMuted: noop, isMuted: () => true, setEngine: noop,
    setSiren: noop, pickup: noop, cash: noop, gunshot: noop, melee: noop,
    crash: noop, steal: noop, missionComplete: noop, busted: noop,
  };
}
