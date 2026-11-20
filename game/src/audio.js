// audio.js — every sound in Ember Bay is synthesized with WebAudio: there are
// no audio files in the entry at all. The engine is two detuned oscillators
// through a low-pass filter whose pitch follows the driven car's speed; the
// siren is a triangle wave alternating two tones; horns, chimes and crashes
// are short one-shot voices. The context is created lazily on the first user
// gesture so browser autoplay rules are respected.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlipAt = 0;
    this.sirenHigh = false;
  }

  // Must be called from a click/keypress handler at least once.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.buildEngineVoice();
    this.buildSirenVoice();
  }

  buildEngineVoice() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 52;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 26;
    this.engineOsc.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
  }

  buildSirenVoice() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 680;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  // speedRatio in [0,1]; active only while the player is driving.
  setEngine(speedRatio, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const targetGain = driving ? 0.05 + speedRatio * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(targetGain, t, 0.09);
    const freq = 50 + speedRatio * 165;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speedRatio * 900, t, 0.1);
  }

  // distance to the nearest police car; silent when far or no police.
  setSiren(distance, anyPolice) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = anyPolice ? Math.max(0, 0.075 * (1 - distance / 70)) : 0;
    this.sirenGain.gain.setTargetAtTime(vol, t, 0.12);
    if (anyPolice && t > this.sirenFlipAt) {
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setValueAtTime(this.sirenHigh ? 950 : 660, t);
      this.sirenFlipAt = t + 0.36;
    }
  }

  blip(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  horn() {
    this.blip(370, 0.28, 'square', 0.1);
    this.blip(466, 0.28, 'square', 0.08);
  }

  pickupChime() {
    this.blip(784, 0.14, 'sine', 0.16);
    this.blip(1046, 0.22, 'sine', 0.16, 0.09);
  }

  cashFanfare() {
    this.blip(659, 0.13, 'triangle', 0.18);
    this.blip(784, 0.13, 'triangle', 0.18, 0.1);
    this.blip(1046, 0.3, 'triangle', 0.2, 0.2);
  }

  failSting() {
    this.blip(392, 0.2, 'triangle', 0.16);
    this.blip(311, 0.34, 'triangle', 0.16, 0.16);
  }

  crash(intensity) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.16 + Math.min(0.2, intensity * 0.02);
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(0.5, 0.14 + intensity * 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }
}
