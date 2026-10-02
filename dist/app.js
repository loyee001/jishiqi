(() => {
  'use strict';
  const MAX = 100 * 60 * 60 * 1000;
  const $ = id => document.getElementById(id);
  const fields = ['hours', 'minutes', 'seconds'].map($);
  const tabs = [...document.querySelectorAll('[data-mode]')];
  const presets = [...document.querySelectorAll('[data-seconds]')];
  let mode = 'countdown', status = 'idle', duration = 25 * 60 * 1000;
  let elapsed = 0, startedAt = 0, audio = null, valid = true;
  let music = null, musicRevision = 0, musicIssue = ''; 
  const elapsedNow = () => Math.min(mode === 'countdown' ? duration : MAX, elapsed + (status === 'running' ? Math.max(0, Date.now() - startedAt) : 0));
  const parts = ms => { const s = Math.max(0, ms); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]; };
  const format = seconds => parts(seconds).map(v => String(v).padStart(2, '0')).join(':');
  const human = ms => parts(Math.round(ms / 1000)).map((n, i) => n ? `${n} ${['小时', '分钟', '秒'][i]}` : '').filter(Boolean).join(' ') || '0 秒';
  // Beveled, angular seven-segment glyphs; actual time remains accessible as text.
  const segments = {
    a: 'M14 5H43L50 11L43 17H14L7 11Z',
    b: 'M46 19L52 13V44L46 50L40 44V25Z',
    c: 'M46 58L52 64V92L46 98L40 92V64Z',
    d: 'M14 94H38L45 100L38 106H9L3 100Z',
    e: 'M6 58L12 64V89L6 95L0 89V64Z',
    f: 'M6 17L12 23V44L6 50L0 44V23Z',
    g: 'M13 48H30L26 53H45L49 57L40 62H23L27 57H9L4 53Z'
  };
  const digitSegments = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd'];
  function paintDigits(id, value) {
    const target = $(id);
    if (target.dataset.value === value) return;
    target.dataset.value = value;
    target.innerHTML = `<span class="digit-value">${value}</span>` + [...value].map((n, i) => {
      const key = `${id}-${i}`;
      const paths = [...digitSegments[Number(n)]].map(segment => `<path d="${segments[segment]}"/>`).join('');
      return `<svg class="tech-digit" viewBox="-2 0 66 116" aria-hidden="true" focusable="false"><defs><linearGradient id="metal-${key}" x1="0" y1="0" x2="0.65" y2="1"><stop class="metal-top" offset="0"/><stop class="metal-mid" offset=".42"/><stop class="metal-low" offset=".5"/><stop class="metal-mid" offset=".78"/><stop class="metal-top" offset="1"/></linearGradient><mask id="cut-${key}" x="-5" y="0" width="75" height="120" maskUnits="userSpaceOnUse"><rect x="-5" y="0" width="75" height="120" fill="white"/><path d="M-4 65L29 45L22 55L60 33" fill="none" stroke="black" stroke-width="2.1"/></mask></defs><g transform="translate(10 0) skewX(-6)"><g class="segment-depth" transform="translate(0 4)">${paths}</g><g mask="url(#cut-${key})"><g class="segment-face" fill="url(#metal-${key})">${paths}</g><g class="segment-bevel">${paths}</g></g></g></svg>`;
    }).join('');
  }
  function message(text) { $('input-error').textContent = text; }
  function readDuration() {
    const values = fields.map(el => el.value === '' ? 0 : Number(el.value));
    valid = values.every(Number.isInteger) && values.every(v => v >= 0) && values[0] <= 100 && values[1] <= 59 && values[2] <= 59;
    const total = (values[0] * 3600 + values[1] * 60 + values[2]) * 1000;
    valid = valid && total <= MAX;
    if (!valid) message('请输入 0–100 小时；分钟、秒为 0–59，合计不超过 100 小时。');
    else { duration = total; message(total === 0 ? '设置至少 1 秒，即可开始倒计时。' : ''); }
    fields.forEach(el => el.setAttribute('aria-invalid', String(!valid)));
    presets.forEach(el => el.classList.toggle('selected', valid && Number(el.dataset.seconds) * 1000 === duration));
    if (status === 'done') { status = 'idle'; elapsed = 0; $('completion').hidden = true; }
    render();
    return valid;
  }
  function render() {
    const spent = elapsedNow();
    const seconds = mode === 'countdown' ? Math.ceil(Math.max(0, duration - spent) / 1000) : Math.floor(spent / 1000);
    const nums = parts(seconds);
    const urgent = mode === 'countdown' && status !== 'idle' && seconds <= 10;
    $('timer-panel').classList.toggle('is-urgent', urgent);
    $('digits').classList.toggle('has-three-hours', nums[0] >= 100);
    ['display-hours', 'display-minutes', 'display-seconds'].forEach((id, i) => paintDigits(id, String(nums[i]).padStart(2, '0')));
    $('digits').setAttribute('aria-label', `${mode === 'countdown' ? '剩余' : '已计时'} ${nums[0]} 小时 ${nums[1]} 分钟 ${nums[2]} 秒`);
    const busy = status === 'running' || status === 'paused';
    fields.forEach(el => el.disabled = busy);
    presets.forEach(el => el.disabled = busy);
    tabs.forEach(el => el.disabled = busy);
    const statusText = { idle: '准备就绪', running: '计时中', paused: '已暂停', done: mode === 'countdown' ? '时间到' : '已达 100 小时' }[status];
    $('status').textContent = statusText;
    $('status').className = `status ${status}`;
    $('start-label').textContent = { idle: '开始计时', running: '暂停计时', paused: '继续计时', done: '再来一次' }[status];
    $('play-icon').innerHTML = status === 'running' ? '<path d="M8 5v14M16 5v14" stroke-width="4"/>' : '<path d="m8 5 11 7-11 7Z"/>';
    $('start').disabled = mode === 'countdown' && (!valid || duration === 0);
    $('timer-detail').textContent = status === 'done' ? (mode === 'countdown' ? '这一段时间，完成了。' : '已达到计时上限') : status === 'paused' ? '休息一下，随时继续' : urgent ? '最后 10 秒' : mode === 'countdown' ? `共 ${human(duration)}` : '从 0 开始 · 最长 100 小时';
    const progress = mode === 'countdown' ? (duration ? 1 - spent / duration : 0) : spent / MAX;
    $('dial-progress').style.strokeDashoffset = String(1294.337 * (1 - Math.max(0, Math.min(1, progress))));
    const title = status === 'idle' ? '此刻 · 100 小时计时器' : `${format(seconds)} ${status === 'done' ? '· 时间到' : status === 'paused' ? '· 已暂停' : '· 此刻'}`;
    if (document.title !== title) document.title = title;
  }
  function getAudio() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audio) { audio = new Ctx(); audio.addEventListener('statechange', renderMusicStatus); }
      return audio;
    } catch (_) { return null; }
  }
  function unlockAudio() {
    if (!$('sound').checked && !$('music').checked) return;
    const context = getAudio();
    if (context && context.state !== 'running') context.resume().catch(() => {});
  }
  function renderMusicStatus() {
    let text = '开始计时后播放';
    if (!$('music').checked) text = '音乐已关闭';
    else if (musicIssue || music?.error) text = musicIssue || music.error;
    else if (Number($('music-volume').value) === 0) text = '音量为 0，已静音';
    else if (status === 'paused') text = '已随计时暂停';
    else if (status === 'running') text = music?.playing ? '正在播放 · BBC Countdown 2013' : '正在加载在线音乐…';
    else if (status === 'done') text = '计时结束，音乐已停止';
    if ($('music-status').textContent !== text) $('music-status').textContent = text;
    $('music-status').classList.toggle('is-playing', !!(status === 'running' && music?.playing && $('music').checked && Number($('music-volume').value) > 0));
  }
  async function syncMusic() {
    const revision = ++musicRevision;
    if (status !== 'running' || !$('music').checked) {
      music?.pause(status === 'idle' || status === 'done');
      musicIssue = ''; renderMusicStatus(); return;
    }
    musicIssue = ''; renderMusicStatus();
    try {
      if (!window.TimerMusic) throw new Error('unsupported');
      const limit = mode === 'countdown' ? duration : MAX;
      if (elapsedNow() >= limit) { tick(); return; }
      music ||= new window.TimerMusic(renderMusicStatus);
      music.setVolume($('music-volume').value);
      // Keep the online player's stop time aligned with the timer deadline.
      const remaining = (limit - elapsedNow()) / 1000;
      if (remaining <= 0) { tick(); return; }
      await music.start(remaining);
    } catch (_) {
      if (revision === musicRevision) musicIssue = '音乐未能播放，请检查网络后重新开启';
    }
    renderMusicStatus();
  }
  function chime() {
    if (!$('sound').checked || !audio || audio.state !== 'running') return;
    try {
      [0, .28, .56].forEach((offset, i) => {
        const osc = audio.createOscillator(), gain = audio.createGain(), t = audio.currentTime + offset;
        osc.frequency.value = [660, 880, 1100][i]; osc.type = 'sine';
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(.19, t + .02); gain.gain.exponentialRampToValueAtTime(.001, t + .45);
        osc.connect(gain); gain.connect(audio.destination); osc.start(t); osc.stop(t + .5);
      });
    } catch (_) {}
  }
  function finish() {
    if (status !== 'running') return;
    elapsed = mode === 'countdown' ? duration : MAX; status = 'done';
    $('completion-title').textContent = mode === 'countdown' ? '时间到' : '已达 100 小时';
    $('completion-text').textContent = mode === 'countdown' ? '这一段时间，完成了。' : '本次计时已自动停止。';
    $('completion').hidden = false; syncMusic(); chime(); render();
  }
  function tick() {
    if (status === 'running' && elapsedNow() >= (mode === 'countdown' ? duration : MAX)) finish();
    else render();
  }
  function startPause() {
    if (status === 'running') { tick(); if (status !== 'running') return; elapsed = elapsedNow(); status = 'paused'; }
    else {
      if (mode === 'countdown' && (status === 'idle' || status === 'done') && (!readDuration() || duration === 0)) return;
      if (status === 'done') elapsed = 0;
      unlockAudio(); $('completion').hidden = true; startedAt = Date.now(); status = 'running';
    }
    syncMusic(); render();
  }
  function reset() { status = 'idle'; elapsed = 0; startedAt = 0; $('completion').hidden = true; syncMusic(); render(); }
  function setMode(next) {
    if (!['countdown', 'stopwatch'].includes(next)) throw new Error('无效的计时模式');
    if (status === 'running' || status === 'paused') throw new Error('请先重置当前计时');
    mode = next; reset();
    tabs.forEach(el => { const active = el.dataset.mode === mode; el.setAttribute('aria-selected', String(active)); el.tabIndex = active ? 0 : -1; });
    $('duration-settings').hidden = mode !== 'countdown'; $('stopwatch-settings').hidden = mode !== 'stopwatch';
    $('timer-panel').setAttribute('aria-labelledby', `${mode}-tab`);
    $('mode-label').textContent = mode === 'countdown' ? '倒计时' : '正计时';
    $('timer-caption').textContent = mode === 'countdown' ? '剩余时间' : '已经过时间'; render();
  }
  tabs.forEach(el => { el.addEventListener('click', () => setMode(el.dataset.mode)); el.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? tabs[0] : e.key === 'End' ? tabs[1] : tabs.find(t => t !== el); setMode(next.dataset.mode); next.focus(); } }); });
  fields.forEach(el => el.addEventListener('input', readDuration));
  presets.forEach(el => el.addEventListener('click', () => { const nums = parts(Number(el.dataset.seconds)); fields.forEach((f, i) => f.value = nums[i]); readDuration(); }));
  $('start').addEventListener('click', startPause); $('reset').addEventListener('click', reset);
  $('dismiss').addEventListener('click', () => $('completion').hidden = true);
  $('sound').addEventListener('change', unlockAudio);
  $('music').addEventListener('change', () => { unlockAudio(); syncMusic(); });
  $('music-volume').addEventListener('input', () => {
    $('music-volume-value').textContent = `${$('music-volume').value}%`;
    music?.setVolume($('music-volume').value);
    renderMusicStatus();
  });
  window.addEventListener('pagehide', () => { ++musicRevision; music?.pause(); });
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !e.target.closest('input,button,a,textarea,select,[contenteditable]')) { e.preventDefault(); startPause(); } });
  $('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (_) { $('fullscreen').title = '当前浏览器不支持全屏'; } });
  if (!document.documentElement.requestFullscreen) $('fullscreen').hidden = true;
  document.addEventListener('fullscreenchange', () => { $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '进入全屏'); });
  document.addEventListener('visibilitychange', () => { tick(); if (!document.hidden) syncMusic(); }); window.addEventListener('pageshow', () => { tick(); syncMusic(); });
  window.setInterval(tick, 100); render(); renderMusicStatus();
  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const result = () => ({ mode, status, durationSeconds: duration / 1000, elapsedSeconds: Math.floor(elapsedNow() / 1000) });
    const tool = { name: 'control_timer', title: '控制此刻计时器', description: '设置或操作 0–100 小时的计时器；configure 只设置，不开始计时。', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['read', 'configure', 'start', 'pause', 'reset'] }, mode: { type: 'string', enum: ['countdown', 'stopwatch'] }, seconds: { type: 'integer', minimum: 0, maximum: 360000 } }, required: ['action'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
      if (!input || typeof input !== 'object' || !['read', 'configure', 'start', 'pause', 'reset'].includes(input.action) || Object.keys(input).some(k => !['action', 'mode', 'seconds'].includes(k))) throw new Error('无效的操作');
      if (input.mode !== undefined && !['countdown', 'stopwatch'].includes(input.mode)) throw new Error('无效模式');
      if (input.seconds !== undefined && (!Number.isInteger(input.seconds) || input.seconds < 0 || input.seconds > 360000)) throw new Error('时长必须是 0–360000 之间的整数秒');
      if (input.action !== 'configure' && (input.mode !== undefined || input.seconds !== undefined)) throw new Error('请使用 configure 设置模式和时长');
      if (input.action === 'configure') { if (status === 'running' || status === 'paused') throw new Error('请先重置当前计时'); setMode(input.mode || mode); if (input.seconds !== undefined) { const nums = parts(input.seconds); fields.forEach((f, i) => f.value = nums[i]); readDuration(); } }
      if (input.action === 'start') { if (status === 'running') return result(); if (mode === 'countdown' && (!valid || duration === 0)) throw new Error('请先设置有效的非零时长'); startPause(); }
      if (input.action === 'pause' && status === 'running') startPause();
      if (input.action === 'reset') reset();
      tick(); return result();
    } };
    try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch (_) {}
  }
})();
