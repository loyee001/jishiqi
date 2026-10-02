(() => {
  'use strict';
  // Original 32-beat electronic composition. Render once, then loop on the audio
  // clock so background-tab throttling cannot interrupt a note scheduler.
  function compose(context) {
    const rate = 22050, beat = 60 / 96, length = 32 * beat;
    const buffer = context.createBuffer(1, Math.round(rate * length), rate);
    const data = buffer.getChannelData(0), tau = Math.PI * 2;
    const hz = midi => 440 * 2 ** ((midi - 69) / 12);
    function note(midi, start, duration, volume, kind = 'pluck') {
      const frequency = hz(midi), offset = Math.round(start * rate), samples = Math.round(duration * rate);
      for (let i = 0; i < samples; i++) {
        const t = i / rate, phase = tau * frequency * t;
        let wave, envelope;
        if (kind === 'pad') {
          envelope = Math.min(1, t / .7) * Math.min(1, (duration - t) / 1.1);
          wave = Math.sin(phase) * .7 + Math.sin(phase * 2) * .18 + Math.sin(phase * 1.002) * .12;
        } else if (kind === 'bass') {
          envelope = Math.min(1, t / .025) * Math.exp(-t * 2.6) * Math.min(1, (duration - t) / .1);
          wave = Math.sin(phase) * .9 + Math.sin(phase * 2) * .1;
        } else {
          envelope = Math.min(1, t / .012) * Math.exp(-t * 3.8) * Math.min(1, (duration - t) / .08);
          wave = Math.sin(phase) * .72 + Math.sin(phase * 2) * .21 + Math.sin(phase * 3) * .07;
        }
        data[(offset + i) % data.length] += wave * envelope * volume;
      }
    }
    const chords = [[57, 60, 64, 71], [53, 57, 60, 64], [48, 55, 59, 64], [55, 59, 62, 69]];
    const melodies = [[76, 79, 83, 79, 76, 74, 72, 71], [72, 76, 79, 76, 74, 72, 69, 72], [71, 74, 76, 79, 83, 79, 76, 74], [74, 78, 81, 78, 76, 74, 71, 74]];
    chords.forEach((chord, bar) => {
      const base = bar * 8 * beat;
      chord.forEach(n => note(n, base, 8 * beat + .65, .075, 'pad'));
      for (let step = 0; step < 16; step++) {
        const n = chord[[0, 2, 1, 3, 2, 1, 3, 2][step % 8]] + 12;
        note(n, base + step * beat / 2, .95, step % 2 ? .095 : .13);
      }
      melodies[bar].forEach((n, step) => {
        note(n, base + step * beat, 1.1, .13);
        note(n, base + step * beat + beat * .75, .8, .032);
      });
      for (let step = 0; step < 8; step += 2) note(chord[0] - 12, base + step * beat, 1.25, .2, 'bass');
    });
    // Gentle kick and short high-frequency ticks, kept beneath the melody.
    let seed = 173;
    for (let step = 0; step < 32; step++) {
      const offset = Math.round(step * beat * rate);
      if (step % 2 === 0) for (let i = 0; i < rate * .28; i++) {
        const t = i / rate;
        data[(offset + i) % data.length] += Math.sin(tau * (48 * t + 1.9 * (1 - Math.exp(-t * 26)))) * Math.exp(-t * 19) * Math.min(1, t / .006) * .12;
      }
      for (let i = 0; i < rate * .05; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const t = i / rate;
        data[(offset + Math.round(beat / 2 * rate) + i) % data.length] += (seed / 4294967296 * 2 - 1) * Math.exp(-t * 110) * Math.min(1, t / .004) * .026;
      }
    }
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const scale = peak ? .72 / peak : 1;
    for (let i = 0; i < data.length; i++) data[i] *= scale;
    return buffer;
  }
  class TimerMusic {
    constructor(context, onChange = () => {}) {
      this.context = context;
      this.onChange = onChange;
      this.buffer = compose(context);
      this.output = context.createGain();
      this.output.gain.value = 0;
      this.output.connect(context.destination);
      this.source = null;
      this.voice = null;
      this.offset = 0;
      this.startedAt = 0;
    }
    get playing() { return !!this.source && this.context.state === 'running'; }
    setVolume(percent) {
      const value = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
      this.output.gain.setTargetAtTime(value ** 1.4 * .7, this.context.currentTime, .04);
    }
    start(remainingSeconds) {
      if (this.source || remainingSeconds <= 0) return;
      const context = this.context, now = context.currentTime;
      const source = context.createBufferSource(), voice = context.createGain();
      source.buffer = this.buffer;
      source.loop = true;
      source.connect(voice); voice.connect(this.output);
      voice.gain.setValueAtTime(0, now);
      voice.gain.linearRampToValueAtTime(1, now + .06);
      this.source = source; this.voice = voice; this.startedAt = now;
      source.onended = () => {
        source.disconnect(); voice.disconnect();
        if (this.source === source) { this.source = null; this.voice = null; this.offset = 0; this.onChange(); }
      };
      source.start(now, this.offset % this.buffer.duration);
      if (Number.isFinite(remainingSeconds)) {
        const end = now + remainingSeconds;
        voice.gain.setValueAtTime(1, Math.max(now + .06, end - .08));
        voice.gain.linearRampToValueAtTime(0, Math.max(now + .06, end));
        source.stop(end);
      }
      this.onChange();
    }
    pause(rewind = false) {
      const source = this.source, voice = this.voice, now = this.context.currentTime;
      if (source) {
        this.offset = (this.offset + Math.max(0, now - this.startedAt)) % this.buffer.duration;
        this.source = null; this.voice = null;
        voice.gain.cancelScheduledValues(now);
        voice.gain.setValueAtTime(voice.gain.value, now);
        voice.gain.linearRampToValueAtTime(0, now + .025);
        try { source.stop(now + .03); } catch (_) {}
      }
      if (rewind) this.offset = 0;
      this.onChange();
    }
  }
  window.TimerMusic = TimerMusic;
})();
