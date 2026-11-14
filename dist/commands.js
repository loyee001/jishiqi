(function (root) {
  'use strict';
  const MAX_SECONDS = 360000;
  const digits = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  function number(text) {
    if (text === '半') return 0.5;
    if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if (!/^[零〇一二两三四五六七八九十百千]+$/.test(text)) return NaN;
    if (!/[十百千]/.test(text)) return Number([...text].map(char => digits[char]).join(''));
    let total = 0, digit = null, previousUnit = Infinity;
    for (const char of text) {
      if (char in digits) {
        if (digit !== null && digit !== 0) return NaN;
        digit = digits[char];
      } else {
        const unit = { 十: 10, 百: 100, 千: 1000 }[char];
        if (unit >= previousUnit) return NaN;
        total += (digit === null ? 1 : digit) * unit;
        digit = null; previousUnit = unit;
      }
    }
    return total + (digit || 0);
  }
  function parseDuration(text) {
    const pattern = /([0-9]+(?:\.[0-9]+)?|[零〇一二两三四五六七八九十百千]+|半)(个小时|小时|钟头|分钟|分|秒钟|秒)(半)?/gy;
    let seconds = 0, position = 0, previousUnit = Infinity, match;
    while ((match = pattern.exec(text))) {
      if (match.index !== position) return NaN;
      const unit = /小时|钟头/.test(match[2]) ? 3600 : /分/.test(match[2]) ? 60 : 1;
      if (unit >= previousUnit) return NaN;
      const value = number(match[1]);
      if (!Number.isFinite(value) || (match[3] && (value % 1 || unit === 1))) return NaN;
      seconds += (value + (match[3] ? 0.5 : 0)) * unit;
      position = pattern.lastIndex; previousUnit = unit;
    }
    return position === text.length && position > 0 ? seconds : NaN;
  }
  function parse(input) {
    if (typeof input !== 'string' || input.length > 100) return { error: '指令太长，请只说一条计时指令。' };
    let text = input.normalize('NFKC').trim().replace(/\s+/g, '').replace(/[。.!！?？]+$/g, '');
    text = text.replace(/計時/g, '计时').replace(/分鐘/g, '分钟').replace(/小時/g, '小时').replace(/兩/g, '两');
    text = text.replace(/^(?:请)?(?:帮我)?/, '');
    if (!text) return { error: '请输入指令，例如“倒计时4分钟”。' };
    if (/^(?:暂停|暂停计时|暂停倒计时)$/.test(text)) return { action: 'pause' };
    if (/^(?:继续|继续计时|继续倒计时|恢复计时)$/.test(text)) return { action: 'resume' };
    if (/^(?:重置|重置计时|重置计时器|取消计时)$/.test(text)) return { action: 'reset' };
    if (/^(?:开始|开始计时)$/.test(text)) return { action: 'start' };
    if (/^(?:开始)?正计时$/.test(text)) return { action: 'stopwatch' };
    const countdown = text.match(/^(?:开始)?倒计时(.+?)(?:并开始|立即开始|开始计时)?$/);
    if (!countdown) return { error: '没听懂这条指令。试试“倒计时4分钟”“暂停”或“继续”。' };
    const parsed = parseDuration(countdown[1]);
    const seconds = Math.round(parsed);
    if (!Number.isFinite(parsed)) return { error: '请说完整时长，例如“倒计时4分钟”或“倒计时一小时半”。' };
    if (Math.abs(parsed - seconds) > 1e-7 || seconds < 1 || seconds > MAX_SECONDS) return { error: '倒计时须为 1 秒到 100 小时，且精确到整秒。' };
    return { action: 'countdown', seconds };
  }
  const api = { parse };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TimerCommands = api;
})(typeof window === 'undefined' ? globalThis : window);
