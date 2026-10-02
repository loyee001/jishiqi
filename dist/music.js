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
      this.audio.addEventListener('playing', () => {
        if (!this.requested || this.expired()) { this.pause(this.expired()); return; }
        this.loading = false; this.error = ''; this.onChange();
      });
      this.audio.addEventListener('waiting', () => {
        this.loading = this.requested; this.onChange();
      });
      this.audio.addEventListener('pause', () => this.onChange());
      this.audio.addEventListener('timeupdate', () => {
        if (this.requested && this.expired()) this.pause(true);
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
    async start(remainingSeconds) {
      if (!(remainingSeconds > 0)) { this.pause(true); return; }
      const revision = ++this.revision;
      this.requested = true;
      this.error = '';
      this.deadline = Date.now() + remainingSeconds * 1000;
      clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(() => {
        if (this.requested && this.expired()) this.pause(true);
      }, remainingSeconds * 1000);
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
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      this.audio.pause();
      if (rewind) {
        try { this.audio.currentTime = 0; } catch (_) {}
      }
      this.onChange();
    }
  }
  window.TimerMusic = TimerMusic;
})();
