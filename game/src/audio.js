// Every sound is synthesized with WebAudio: filtered noise bursts for gunfire,
// oscillators for beeps and jingles. No audio files, no network, nothing to load.
// The context is created lazily on the first user gesture (pointer lock click).
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
    const length = Math.floor(context.sampleRate * 0.5);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise({ duration, type = 'lowpass', frequency = 1200, gain = 0.9, when = 0, sweepTo = null }) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, t);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(t, Math.random() * 0.3, duration + 0.05);
    source.stop(t + duration + 0.05);
  }

  function tone({ frequency, duration, type = 'sine', gain = 0.25, when = 0, slideTo = null }) {
    if (!ensure()) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Shot character per weapon: pistol cracks, SMG chatters, rifle thumps, sniper booms.
  const SHOTS = {
    pistol: () => { noise({ duration: 0.09, frequency: 2600, gain: 0.8 }); tone({ frequency: 190, duration: 0.07, type: 'square', gain: 0.16, slideTo: 90 }); },
    smg: () => { noise({ duration: 0.07, frequency: 2100, gain: 0.65 }); tone({ frequency: 240, duration: 0.05, type: 'square', gain: 0.12, slideTo: 120 }); },
    rifle: () => { noise({ duration: 0.12, frequency: 1500, gain: 0.95 }); tone({ frequency: 150, duration: 0.1, type: 'square', gain: 0.2, slideTo: 70 }); },
    sniper: () => { noise({ duration: 0.28, frequency: 900, gain: 1.0, sweepTo: 140 }); tone({ frequency: 110, duration: 0.22, type: 'sine', gain: 0.3, slideTo: 45 }); },
    enemy: () => { noise({ duration: 0.09, frequency: 1100, gain: 0.35 }); },
  };

  return {
    unlock() { ensure(); },
    shot(kind) { if (SHOTS[kind]) SHOTS[kind](); },
    dryFire() { tone({ frequency: 1400, duration: 0.03, type: 'square', gain: 0.12 }); },
    reload() {
      tone({ frequency: 900, duration: 0.04, type: 'square', gain: 0.14 });
      tone({ frequency: 620, duration: 0.05, type: 'square', gain: 0.14, when: 0.22 });
      tone({ frequency: 1100, duration: 0.04, type: 'square', gain: 0.16, when: 0.55 });
    },
    hit() { tone({ frequency: 1900, duration: 0.05, type: 'sine', gain: 0.2 }); },
    kill() {
      tone({ frequency: 1320, duration: 0.06, type: 'sine', gain: 0.22 });
      tone({ frequency: 1760, duration: 0.09, type: 'sine', gain: 0.22, when: 0.07 });
    },
    hurt() { noise({ duration: 0.12, frequency: 500, gain: 0.5 }); tone({ frequency: 130, duration: 0.12, type: 'sawtooth', gain: 0.12, slideTo: 70 }); },
    grenadeThrow() { noise({ duration: 0.15, frequency: 800, gain: 0.3, sweepTo: 300 }); },
    explosion() {
      noise({ duration: 0.7, frequency: 700, gain: 1.0, sweepTo: 60 });
      tone({ frequency: 70, duration: 0.6, type: 'sine', gain: 0.5, slideTo: 28 });
    },
    plantBeep() { tone({ frequency: 880, duration: 0.07, type: 'square', gain: 0.18 }); },
    bombBeep() { tone({ frequency: 1180, duration: 0.06, type: 'square', gain: 0.14 }); },
    defuseBeep() { tone({ frequency: 660, duration: 0.07, type: 'square', gain: 0.18 }); },
    roundWin() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ frequency: f, duration: 0.16, type: 'triangle', gain: 0.22, when: i * 0.11 }));
    },
    roundLose() {
      [392, 330, 262, 196].forEach((f, i) => tone({ frequency: f, duration: 0.18, type: 'triangle', gain: 0.2, when: i * 0.12 }));
    },
    buy() {
      tone({ frequency: 990, duration: 0.05, type: 'sine', gain: 0.18 });
      tone({ frequency: 1320, duration: 0.08, type: 'sine', gain: 0.18, when: 0.06 });
    },
    denied() { tone({ frequency: 220, duration: 0.12, type: 'square', gain: 0.16 }); },
    step() { noise({ duration: 0.04, frequency: 400, gain: 0.08 }); },
  };
}
