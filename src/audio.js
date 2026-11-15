// Audio System for Johann's Folly
// Fully compatible with Safari (macOS & iOS), Chrome, Firefox, and WebKit browsers.

function getAudioUrl(fileRelativePath) {
  if (typeof window === 'undefined') return fileRelativePath;
  try {
    let baseUrl = window.location.href;
    if (!baseUrl.endsWith('/') && !baseUrl.split('/').pop().includes('.')) {
      baseUrl += '/';
    }
    return new URL(fileRelativePath, baseUrl).href;
  } catch {
    return fileRelativePath;
  }
}

const SOUND_FILES = {
  silverlining: 'audio/silverlining.mp3',
  curse: 'audio/curse.mp3',
  onedartatatime: 'audio/onedartatatime.m4a',
  mf1: 'audio/mf1.m4a',
  mf2: 'audio/mf2.m4a',
  mf3: 'audio/mf3.m4a',
  mf4: 'audio/mf4.m4a',
  mf5: 'audio/mf5.m4a',
  mf6: 'audio/mf6.m4a',
  mf7: 'audio/mf7.m4a',
};

let soundEnabled = true;

try {
  const saved = localStorage.getItem('jf:sound');
  if (saved !== null) soundEnabled = JSON.parse(saved);
} catch { /* ignore */ }

export function isSoundEnabled() {
  return soundEnabled;
}

export function toggleSound() {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem('jf:sound', JSON.stringify(soundEnabled));
  } catch { /* ignore */ }
  return soundEnabled;
}

// Global Web Audio API Context
let globalAudioCtx = null;
const audioBuffers = new Map();

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!globalAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) globalAudioCtx = new AudioCtx();
  }
  if (globalAudioCtx && (globalAudioCtx.state === 'suspended' || globalAudioCtx.state === 'interrupted')) {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export async function preloadMp3Buffer(key, relativeUrl) {
  const ctx = getAudioContext();
  if (!ctx || audioBuffers.has(key)) return;
  try {
    const fullUrl = getAudioUrl(relativeUrl);
    const res = await fetch(fullUrl);
    if (!res.ok) return;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) return;
    const arrayBuf = await res.arrayBuffer();

    // Support callback & promise syntax for WebKit / Safari
    if (ctx.decodeAudioData.length === 2) {
      ctx.decodeAudioData(arrayBuf, (decoded) => {
        audioBuffers.set(key, decoded);
      }, () => {});
    } else {
      const decoded = await ctx.decodeAudioData(arrayBuf).catch(() => null);
      if (decoded) audioBuffers.set(key, decoded);
    }
  } catch {
    /* ignore fetch/decode errors */
  }
}

export function preloadAllMp3s() {
  Object.entries(SOUND_FILES).forEach(([key, path]) => {
    preloadMp3Buffer(key, path);
  });
  preloadMp3Buffer('newround1', 'audio/newroundexcited.mp3');
  preloadMp3Buffer('newround2', 'audio/newroundsad.mp3');
  preloadMp3Buffer('newround3', 'audio/newround.mp3');
}

export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      ctx.resume().catch(() => {});
    }
    try {
      // Silent buffer trick to unlock Safari / iOS WebKit audio engine
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch { /* ignore */ }
  }
  preloadAllMp3s();
}

export function reunlockAllAudio() {
  audioBuffers.clear();
  unlockAudio();
}

if (typeof window !== 'undefined') {
  const unlockEvents = ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'];
  unlockEvents.forEach(evt => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });
  setTimeout(() => unlockAudio(), 100);
}

export function playBuffer(key) {
  const ctx = getAudioContext();
  if (!ctx) return false;
  if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
    ctx.resume().catch(() => {});
  }
  const buffer = audioBuffers.get(key);
  if (!buffer) return false;
  try {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.95;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

export function playNewRoundSound() {
  if (!soundEnabled) return;
  unlockAudio();
  const keys = ['newround1', 'newround2', 'newround3'];
  const key = keys[Math.floor(Math.random() * keys.length)];
  const played = playBuffer(key);
  if (!played) {
    playSynthSound('newround');
  }
}

export function playSound(name) {
  if (!soundEnabled) return;
  unlockAudio();
  const played = playBuffer(name);
  if (!played) {
    playSynthSound(name);
  }
}

/** How long the bridge sound runs, so the new-round sound waits for it. */
export const BRIDGE_SOUND_MS = 2800;

/**
 * Something big falling off a bridge: a cartoon whistle dropping in pitch, then a deep
 * whoomp and a heavy splash as it hits the water, and the water crashing back down.
 */
export function playBridgeSplash() {
  if (!soundEnabled) return;
  unlockAudio();
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const impact = t0 + 0.8;

    // Every layer goes through a compressor, so the splash is loud without distorting.
    const out = ctx.createDynamicsCompressor();
    out.threshold.value = -12;
    out.ratio.value = 4;
    out.connect(ctx.destination);

    // The fall
    const whistle = ctx.createOscillator();
    const whistleGain = ctx.createGain();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(1400, t0);
    whistle.frequency.exponentialRampToValueAtTime(300, impact);
    whistleGain.gain.setValueAtTime(0.0001, t0);
    whistleGain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.05);
    whistleGain.gain.setValueAtTime(0.12, impact - 0.15);
    whistleGain.gain.exponentialRampToValueAtTime(0.0001, impact);
    whistle.connect(whistleGain);
    whistleGain.connect(out);
    whistle.start(t0);
    whistle.stop(impact);

    // A deep whoomp as it hits the water
    const whoomp = ctx.createOscillator();
    const whoompGain = ctx.createGain();
    whoomp.type = 'sine';
    whoomp.frequency.setValueAtTime(140, impact);
    whoomp.frequency.exponentialRampToValueAtTime(32, impact + 0.5);
    whoompGain.gain.setValueAtTime(0.0001, impact);
    whoompGain.gain.exponentialRampToValueAtTime(0.9, impact + 0.015);
    whoompGain.gain.exponentialRampToValueAtTime(0.0001, impact + 0.6);
    whoomp.connect(whoompGain);
    whoompGain.connect(out);
    whoomp.start(impact);
    whoomp.stop(impact + 0.65);

    const length = Math.floor(ctx.sampleRate * 2);
    const noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;

    // Filtered noise that starts bright and gets deeper as the water settles.
    function wash(at, gain, fromHz, toHz, seconds) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.Q.value = 0.8;
      lowpass.frequency.setValueAtTime(fromHz, at);
      lowpass.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 50;
      const level = ctx.createGain();
      level.gain.setValueAtTime(0.0001, at);
      level.gain.exponentialRampToValueAtTime(gain, at + 0.03);
      level.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(level);
      level.connect(out);
      source.start(at);
      source.stop(at + seconds + 0.05);
    }

    // The splash, then the water crashing back down
    wash(impact, 1.0, 3500, 220, 1.7);
    wash(impact + 0.3, 0.45, 1600, 180, 1.4);
  } catch { /* ignore */ }
}

export function playRandomMissSwear() {
  if (!soundEnabled) return;
  const keys = ['mf1', 'mf2', 'mf3', 'mf4', 'mf5', 'mf6', 'mf7'];
  const key = keys[Math.floor(Math.random() * keys.length)];
  playSound(key);
}

function playSynthSound(name) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (name === 'miss') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } else if (name === 'single') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else if (name === 'double') {
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);
        gain.gain.setValueAtTime(0.35, ctx.currentTime + i * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.06 + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.06);
        osc.stop(ctx.currentTime + i * 0.06 + 0.15);
      });
    } else if (name === 'triple') {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.05);
        gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.05 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.05);
        osc.stop(ctx.currentTime + i * 0.05 + 0.18);
      });
    } else if (name === 'bullseye') {
      [587.33, 880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);
        gain.gain.setValueAtTime(0.45, ctx.currentTime + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.07 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.07);
        osc.stop(ctx.currentTime + i * 0.07 + 0.3);
      });
    } else if (name === 'perfect' || name === 'newround') {
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);
        gain.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.35);
      });
    }
  } catch { /* ignore */ }
}
