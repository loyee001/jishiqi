(() => {
  'use strict';
  // Stream the composer's published player source; no audio is bundled here.
  const SOURCE = 'https://davidlowemusic.com/wp-content/uploads/2018/07/BBC-World-News-2013-Countdown.mp3';
  class TimerMusic {
    constructor(onChange = () => {}) {
      this.onChange = onChange;
      this.audio = document.createElement('audio');
      this.audio.id = 'background-music';
      this.audio.hidden = true;
      this.audio.preload = 'none';
      this.audio.loop = true;
      this.audio.src = SOURCE;
      document.body.append(this.audio);
      this.requested = false;
      this.loading = false;
      this.error = '';
      this.revision = 0;
      this.deadline = 0;
      this.stopTimer = null;
      this.tail = false;
      this.completed = false;
      this.countdownDuration = 0;
      this.seekStartedAt = null;
      this.seekLatency = 0;
      this.tailSeekPending = false;
      this.audio.addEventListener('loadedmetadata', () => {
        if (!this.requested) return;
        this.tail = Number.isFinite(this.audio.duration) && this.audio.duration > 0 &&
          this.countdownDuration > 0 && this.countdownDuration <= this.audio.duration;
        this.audio.loop = !this.tail;
        if (!this.tail) this.audio.muted = false;
        this.alignTail(true);
      });
      this.audio.addEventListener('seeked', () => {
        if (!this.requested) return;
        if (this.seekStartedAt !== null) {
          this.seekLatency = Math.max(0, Date.now() - this.seekStartedAt) / 1000;
          this.seekStartedAt = null;
        }
        if (!this.audio.paused) this.alignTail();
      });
      this.audio.addEventListener('playing', () => {
        if (!this.requested || this.expired()) { this.pause(this.expired()); return; }
        this.loading = false; this.error = '';
        this.alignTail();
        this.onChange();
      });
      this.audio.addEventListener('waiting', () => {
        this.loading = this.requested; this.onChange();
      });
      this.audio.addEventListener('pause', () => this.onChange());
      this.audio.addEventListener('timeupdate', () => {
        if (this.requested && this.expired()) this.pause(true);
        else if (this.requested && !this.audio.paused) this.alignTail();
      });
      this.audio.addEventListener('ended', () => {
        if (!this.requested || !this.tail || !this.audio.ended) return;
        this.completed = true;
        this.requested = false;
        this.loading = false;
        clearTimeout(this.stopTimer);
        this.stopTimer = null;
        this.onChange();
      });
      this.audio.addEventListener('error', () => {
        if (!this.requested) return;
        this.pause();
        this.error = '音乐加载失败，请检查网络后重新开启';
        this.onChange();
      });
    }
    get playing() { return this.requested && !this.loading && !this.audio.paused && this.audio.readyState >= 2; }
    expired() { return this.deadline > 0 && Date.now() >= this.deadline; }
    setVolume(percent) {
      this.audio.volume = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
    }
    // Align to the timer's deadline, including time spent loading or seeking.
    // Small clock corrections preserve the final note without repeated jumps.
    alignTail(forceSeek = false) {
      if (!this.requested || !this.tail) return;
      if (this.expired()) { this.pause(true); return; }
      if (forceSeek) this.tailSeekPending = true;
      const length = this.audio.duration;
      if (!Number.isFinite(length) || length <= 0 || this.audio.seeking) return;
      const remaining = (this.deadline - Date.now()) / 1000;
      const target = Math.max(0, length - remaining);
      // Do not chase the latency of our own seek with yet another seek.
      const tolerance = Math.max(0.25, this.seekLatency + 0.05);
      if (this.tailSeekPending || (remaining > 2 && Math.abs(this.audio.currentTime - target) > tolerance)) {
        this.tailSeekPending = false;
        this.audio.muted = true;
        this.loading = true;
        this.seekStartedAt = Date.now();
        this.audio.currentTime = target;
        return;
      }
      // Leave a 40 ms scheduling margin so the media ends before the stop tick.
      const rate = (length - this.audio.currentTime) / Math.max(0.01, remaining - 0.04);
      // Near zero, another seek can consume the entire remaining time. Catch up
      // through playback instead, including the final note after a brief stall.
      this.audio.playbackRate = Math.max(0.95, Math.min(remaining <= 2 ? 4 : 1.05, rate));
      this.audio.muted = false;
      this.loading = this.audio.paused || this.audio.readyState < 2;
    }
    async start(remainingSeconds, { countdown = false, totalSeconds = 0 } = {}) {
      if (!(remainingSeconds > 0)) { this.pause(true); return; }
      // A visibility update in the final few milliseconds must not replay the ending.
      if (this.completed && this.deadline > 0 && remainingSeconds < 0.1) return;
      const wasPlaying = this.requested && !this.audio.paused;
      const revision = ++this.revision;
      this.requested = true;
      this.completed = false;
      this.error = '';
      this.countdownDuration = countdown ? totalSeconds : 0;
      const length = Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : 64;
      this.tail = this.countdownDuration > 0 && this.countdownDuration <= length;
      this.audio.loop = !this.tail;
      this.audio.playbackRate = 1;
      this.audio.muted = this.tail;
      this.deadline = Date.now() + remainingSeconds * 1000;
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        if (this.requested && this.expired()) this.pause(true);
      }, remainingSeconds * 1000);
      this.alignTail(!wasPlaying);
      if (!this.audio.paused) { this.onChange(); return; }
      this.loading = true;
      // Called within the start/toggle gesture, before any asynchronous work.
      if (this.audio.error) this.audio.load();
      this.onChange();
      try {
        await this.audio.play();
        if (revision !== this.revision) {
          if (!this.requested) this.audio.pause();
          return;
        }
        if (!this.requested || this.expired()) { this.pause(this.expired()); return; }
        this.loading = false;
        this.alignTail();
      } catch (error) {
        if (revision !== this.revision) return;
        this.pause();
        this.error = error.name === 'NotAllowedError'
          ? '请关闭后重新开启音乐，允许浏览器播放'
          : '音乐加载失败，请检查网络后重新开启';
      }
      this.onChange();
    }
    pause(rewind = false) {
      ++this.revision;
      this.requested = false;
      this.loading = false;
      this.error = '';
      this.deadline = 0;
      this.seekStartedAt = null;
      this.tailSeekPending = false;
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      this.audio.pause();
      this.audio.playbackRate = 1;
      this.audio.muted = false;
      if (rewind) {
        this.completed = false;
        try { this.audio.currentTime = 0; } catch (_) {}
      }
      this.onChange();
    }
  }
  window.TimerMusic = TimerMusic;
})();
