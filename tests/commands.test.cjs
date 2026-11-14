const test = require('node:test');
const assert = require('node:assert/strict');
const { parse } = require('../dist/commands.js');

test('Arabic and Chinese durations, including mixed units and half units', () => {
  const cases = {
    '倒计时4分钟': 240, '倒计时四分钟': 240, '请帮我倒计时四分钟。': 240,
    '开始倒计时４分钟！': 240, '倒计时1小时2分钟3秒': 3723,
    '倒计时一小时半': 5400, '倒计时半小时': 1800, '倒计时两分半': 150,
    '倒计时1.5分钟': 90, '倒计时90分钟': 5400, '倒计时一百小时': 360000,
    '倒计时100小时': 360000, '倒计时一百零一秒': 101,
    '倒计时四分钟立即开始': 240, '倒计时0小时0分钟1秒': 1,
    '倒計時兩分鐘': 120, '倒计时4.1分钟': 246, '倒计时0.14小时': 504
  };
  for (const [input, seconds] of Object.entries(cases)) assert.deepEqual(parse(input), { action: 'countdown', seconds }, input);
});

test('reject ambiguous, negated, incomplete and out-of-range commands', () => {
  const cases = ['', '倒计时', '倒计时0秒', '倒计时100小时1秒', '倒计时一百零一小时',
    '倒计时-4分钟', '倒计时负4分钟', '不要倒计时4分钟', '倒计时4分钟或5分钟',
    '倒计时4分钟垃圾', '倒计时四', '倒计时1e2小时', '倒计时0.1秒', '倒计时4分4分',
    '倒计时4秒1小时', '倒计时十百小时', '倒计时一二十分钟', 'x'.repeat(101)];
  for (const input of cases) assert.ok(parse(input).error, input);
});

test('control commands have distinct, idempotent actions', () => {
  const cases = { 暂停: 'pause', 暂停倒计时: 'pause', 继续: 'resume', 重置: 'reset',
    开始计时: 'start', 正计时: 'stopwatch', 开始正计时: 'stopwatch' };
  for (const [input, action] of Object.entries(cases)) assert.deepEqual(parse(input), { action });
});
