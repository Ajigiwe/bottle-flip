// Web Audio API Synthesizer & Sound Effects

class SoundManager {
  constructor() {
    this.ctx = null;
    this.isMuted = localStorage.getItem('bottle_flip_muted') === 'true';
    this.isInitialized = false;
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
      console.warn("Web Audio API not supported", e);
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
    return this.isMuted;
  }

  // Play Whoosh sound during phone flick / swipe throw
  playWhoosh(speedFactor = 1) {
    if (this.isMuted) return;
    this.init();
    this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = 0.25;

    // Buffer source with noise
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    // Swept lowpass filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const startFreq = 200 * speedFactor;
    const endFreq = 1200 * speedFactor;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(endFreq, now + dur * 0.5);
    filter.frequency.exponentialRampToValueAtTime(100, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + dur * 0.4);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + dur);
  }

  // Wood / Table thud landing sound
  playThud(impactSpeed = 1, isUpright = false) {
    if (this.isMuted) return;
    this.init();
    this.resumeCtx();
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

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

    this.vibrate(isUpright ? [40, 30, 40] : [70]);
  }

  // Glass crash / fail clatter sound
  playCrash(impactSpeed = 1) {
    if (this.isMuted) return;
    this.init();
    this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const dur = 0.35;

    // High pitched glass noise burst
    const bufferSize = this.ctx.sampleRate * dur;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(2500, now);

    const gain = this.ctx.createGain();
    const vol = Math.min(0.6, 0.2 + impactSpeed * 0.2);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(now);
    noise.stop(now + dur);

    // Also low rumble impact
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(30, now + 0.2);
    oscGain.gain.setValueAtTime(vol, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(oscGain);
    oscGain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);

    this.vibrate([120, 50, 100]);
  }

  // Success chime on upright landing with combo scale
  playSuccess(combo = 1) {
    if (this.isMuted) return;
    this.init();
    this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Major chord notes based on combo
    const basePitch = 523.25; // C5
    const intervals = [0, 4, 7, 12, 16, 19, 24]; // Major scale arpeggio
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

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.35);
    });

    this.vibrate([30, 40, 50]);
  }

  playClick() {
    if (this.isMuted) return;
    this.init();
    this.resumeCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  vibrate(pattern) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignored if device doesn't support or disallows haptics
      }
    }
  }
}

export const soundManager = new SoundManager();
