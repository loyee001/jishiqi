const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function app({ voice = true } = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
  const elements = new Map();
  function element(id) {
    const listeners = new Map(), classes = new Set(), attributes = {};
    return { id, value: '', checked: false, hidden: false, disabled: false, dataset: {}, style: {}, textContent: '',
      className: '', innerHTML: '', attributes,
      classList: { toggle(name, active) { if (active) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
      setAttribute(name, value) { attributes[name] = value; },
      addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
      fire(name, extra = {}) { for (const callback of listeners.get(name) || []) callback({ preventDefault() {}, ...extra }); },
      focus() {}
    };
  }
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements.set(id, element(id));
  const get = id => elements.get(id);
  ['hours', 'minutes', 'seconds'].forEach((id, i) => get(id).value = [0, 25, 0][i]);
  get('music-volume').value = 35;
  const tabs = ['countdown', 'stopwatch'].map(mode => Object.assign(get(`${mode}-tab`), { dataset: { mode } }));
  const presets = [300, 1500, 3600, 360000].map(seconds => Object.assign(element(), { dataset: { seconds } }));
  const windowEvents = {}, instances = [];
  class Recognition {
    constructor() { instances.push(this); }
    start() { this.onstart?.(); }
    stop() { this.stopped = true; }
    abort() { this.aborted = true; this.onend?.(); }
    result(transcript, isFinal = true) { this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] }); }
  }
  let now = 10000;
  const document = { title: '', hidden: false, getElementById: get,
    querySelectorAll: selector => selector === '[data-mode]' ? tabs : presets,
    documentElement: {}, addEventListener() {} };
  const window = { TimerCommands: require('../dist/commands.js'), isSecureContext: true,
    setInterval() {}, addEventListener(name, callback) { windowEvents[name] = callback; } };
  if (voice) window.SpeechRecognition = Recognition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8'), { window, document, Date: { now: () => now }, console });
  return { get, instances, advance: ms => now += ms, windowEvents,
    submit(text) { get('command-input').value = text; get('command-form').fire('submit'); },
    status: () => get('status').textContent, display: () => get('digits').attributes['aria-label'] };
}

test('text starts countdown, invalid commands preserve it, pause/resume are idempotent', () => {
  const a = app();
  a.submit('倒计时4分钟'); assert.equal(a.status(), '计时中');
  assert.match(a.display(), /0 小时 4 分钟 0 秒/);
  a.advance(5000); a.submit('不要倒计时4分钟');
  assert.equal(a.status(), '计时中'); assert.match(a.get('command-status').className, /error/);
  a.submit('暂停'); assert.equal(a.status(), '已暂停');
  const paused = a.display(); a.advance(10000); a.submit('暂停'); assert.equal(a.display(), paused);
  a.submit('继续'); a.advance(1000); a.submit('继续'); assert.equal(a.status(), '计时中');
  assert.match(a.display(), /3 分钟 54 秒/);
  a.submit('倒计时100小时'); assert.match(a.display(), /100 小时 0 分钟 0 秒/);
  a.submit('重置'); assert.equal(a.status(), '准备就绪');
  a.submit('开始正计时'); assert.equal(a.get('mode-label').textContent, '正计时');
  a.advance(5000); a.submit('暂停'); assert.match(a.display(), /0 分钟 5 秒/);
});

test('speech interim results do not execute; final result executes exactly once', () => {
  const a = app(); a.get('voice-button').fire('click');
  const r = a.instances[0];
  assert.equal(r.lang, 'zh-CN'); assert.equal(r.continuous, false);
  r.result('倒计时四', false); assert.equal(a.status(), '准备就绪');
  r.result('倒计时四分钟'); assert.equal(a.status(), '计时中');
  a.advance(1000); r.result('倒计时十分钟');
  r.onend(); assert.match(a.get('command-status').textContent, /已开始 4 分钟/);
  a.submit('暂停'); assert.match(a.display(), /3 分钟 59 秒/);
  assert.equal(a.get('voice-button').attributes['aria-pressed'], 'false');
});

test('speech cancellation, stale results and permission failure preserve timer', () => {
  const a = app(); a.submit('倒计时4分钟'); a.get('voice-button').fire('click');
  const r = a.instances[0]; a.get('command-input').fire('input');
  assert.ok(r.aborted); r.result('倒计时十分钟'); assert.match(a.display(), /4 分钟/);
  a.get('voice-button').fire('click'); const next = a.instances[1];
  next.onerror({ error: 'not-allowed' }); next.onend();
  assert.match(a.get('command-status').textContent, /未获得麦克风权限/);
  assert.equal(a.status(), '计时中');
  a.submit('暂停'); assert.equal(a.status(), '已暂停');
});

test('unsupported browser retains complete text command flow', () => {
  const a = app({ voice: false }); assert.equal(a.get('voice-button').disabled, true);
  a.submit('倒计时半小时'); assert.equal(a.status(), '计时中'); assert.match(a.display(), /30 分钟/);
});

test('composing Chinese text does not submit a premature command', () => {
  const a = app();
  a.get('command-input').fire('compositionstart');
  a.submit('倒计时四分钟'); assert.equal(a.status(), '准备就绪');
  let prevented = false;
  a.get('command-input').fire('keydown', { key: 'Enter', isComposing: true, preventDefault() { prevented = true; } });
  assert.ok(prevented);
  a.get('command-input').fire('compositionend');
  a.submit('倒计时四分钟'); assert.equal(a.status(), '计时中');
});
