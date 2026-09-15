// Web Audio API Synthesizer, Sound Effects & Background Music

class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('bottle_flip_muted') === 'true';
    this.isInitialized = false;

    // Background music state
    this._bgNodes = [];
    this._bgPlaying = false;
    this._bgScheduled = false;
    this._bgPatternTimeout = null;
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.isInitialized = true;
      }
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  resumeCtx() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    localStorage.setItem('bottle_flip_muted', this.isMuted);
    if (this.isMuted) {
      this.stopBgMusic();
    } else if (this._bgPlaying) {
      this.startBgMusic();
    }
    return this.isMuted;
  }

  // ── Whoosh ──────────────────────────────────────────────────────────────

  playWhoosh(speedFactor = 1) {
    if (this.isMuted) return;
    this.init(); this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = 0.25;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200 * speedFactor, now);
    filter.frequency.exponentialRampToValueAtTime(1200 * speedFactor, now + dur * 0.5);
    filter.frequency.exponentialRampToValueAtTime(100, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    noise.start(now); noise.stop(now + dur);
  }

  // ── Thud ────────────────────────────────────────────────────────────────

  playThud(impactSpeed = 1, isUpright = false) {
    if (this.isMuted) return;
    this.init(); this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const baseFreq = isUpright ? 180 : 130;
    osc.frequency.setValueAtTime(baseFreq * Math.min(impactSpeed, 1.5), now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

    const vol = Math.min(0.5, 0.15 + impactSpeed * 0.15);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.15);

    this.vibrate(isUpright ? [40, 30, 40] : [70]);
  }

  // ── Crash ────────────────────────────────────────────────────────────────

  playCrash(impactSpeed = 1) {
    if (this.isMuted) return;
    this.init(); this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = 0.35;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2500, now);
    const vol = Math.min(0.6, 0.2 + impactSpeed * 0.2);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    noise.start(now); noise.stop(now + dur);

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(30, now + 0.2);
    oscGain.gain.setValueAtTime(vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(oscGain); oscGain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.2);

    this.vibrate([120, 50, 100]);
  }

  // ── Success ──────────────────────────────────────────────────────────────

  playSuccess(combo = 1) {
    if (this.isMuted) return;
    this.init(); this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const basePitch = 523.25;
    const intervals = [0, 4, 7, 12, 16, 19, 24];
    const offset = intervals[Math.min(combo - 1, intervals.length - 1)];
    const freq = basePitch * Math.pow(2, offset / 12);
    const notes = [freq, freq * 1.25, freq * 1.5];

    notes.forEach((f, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.05);
      gain.gain.setValueAtTime(0, now + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.05 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.35);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.05); osc.stop(now + idx * 0.05 + 0.35);
    });

    this.vibrate([30, 40, 50]);
  }

  // ── Bullseye Chime (distinct) ────────────────────────────────────────────

  playBullseye() {
    if (this.isMuted) return;
    this.init(); this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Rising 4-note fanfare: C5 → E5 → G5 → C6
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === freqs.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.08);
      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.22, now + i * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.45);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now + i * 0.08); osc.stop(now + i * 0.08 + 0.5);
    });

    this.vibrate([20, 20, 20, 20, 80]);
  }

  // ── Crowd Cheer ──────────────────────────────────────────────────────────

  playCrowdCheer(intensity = 1) {
    if (this.isMuted) return;
    this.init(); this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = 0.6 + intensity * 0.15;

    // Band-pass noise burst that mimics crowd hubbub
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(800, now);
    bp.frequency.linearRampToValueAtTime(1800, now + dur * 0.5);
    bp.Q.setValueAtTime(0.5, now);

    const vol = Math.min(0.18, 0.07 + intensity * 0.04);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.setValueAtTime(vol, now + dur - 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(bp); bp.connect(gain); gain.connect(this.ctx.destination);
    noise.start(now); noise.stop(now + dur);
  }

  // ── Click ────────────────────────────────────────────────────────────────

  playClick() {
    if (this.isMuted) return;
    this.init(); this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.04);
  }

  // ── Background Music ─────────────────────────────────────────────────────

  startBgMusic() {
    this._bgPlaying = true;
    if (this.isMuted || !this.isInitialized) return;
    if (this._bgScheduled) return;
    this._scheduleBgLoop();
  }

  stopBgMusic() {
    this._bgPlaying = false;
    this._bgScheduled = false;
    clearTimeout(this._bgPatternTimeout);
    this._bgNodes.forEach(n => { try { n.stop(); } catch (_) {} });
    this._bgNodes = [];
  }

  _scheduleBgLoop() {
    if (!this._bgPlaying || this.isMuted || !this.ctx) return;
    this._bgScheduled = true;
    this._playBgPattern();
  }

  _playBgPattern() {
    if (!this._bgPlaying || this.isMuted || !this.ctx) { this._bgScheduled = false; return; }

    const now = this.ctx.currentTime;
    const bpm = 82;
    const beat = 60 / bpm;
    const totalBeats = 16;
    const dur = totalBeats * beat;

    // Lo-fi chord pads: two stacked sine oscillators per chord
    const chords = [
      [261.63, 329.63, 392.00], // C maj
      [293.66, 369.99, 440.00], // D min
      [261.63, 329.63, 392.00], // C maj
      [246.94, 311.13, 392.00], // B min
    ];

    const chordDur = (totalBeats / chords.length) * beat;

    chords.forEach((chord, ci) => {
      const startAt = now + ci * chordDur;
      chord.forEach(freq => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 0.5, startAt); // one octave down for warmth
        gain.gain.setValueAtTime(0, startAt);
        gain.gain.linearRampToValueAtTime(0.028, startAt + 0.3);
        gain.gain.setValueAtTime(0.028, startAt + chordDur - 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + chordDur);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(startAt); osc.stop(startAt + chordDur + 0.1);
        this._bgNodes.push(osc);
      });
    });

    // Soft kick drum on beats 1 & 9
    [0, 8].forEach(beatOffset => {
      const t = now + beatOffset * beat;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
      gain.gain.setValueAtTime(0.09, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.25);
      this._bgNodes.push(osc);
    });

    // Hi-hat on every other beat
    for (let b = 0; b < totalBeats; b += 2) {
      const t = now + b * beat + beat;
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.06, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(7000, t);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.025, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      src.connect(hp); hp.connect(g); g.connect(this.ctx.destination);
      src.start(t); src.stop(t + 0.07);
      this._bgNodes.push(src);
    }

    // Schedule next loop
    this._bgPatternTimeout = setTimeout(() => {
      this._bgNodes = [];
      this._playBgPattern();
    }, dur * 1000 - 200);
  }

  // ── Haptics ──────────────────────────────────────────────────────────────

  vibrate(pattern) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (_) {}
    }
  }

  vibrateStreak(streak) {
    const patterns = {
      2: [30, 20, 30],
      3: [40, 20, 40, 20, 40],
      4: [50, 15, 50, 15, 50, 15, 50],
      5: [60, 10, 60, 10, 60, 10, 60, 10, 100],
    };
    this.vibrate(patterns[Math.min(streak, 5)] || [30]);
  }
}

export const soundManager = new SoundManager();
