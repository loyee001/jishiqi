const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${fs.readFileSync(path.join(root, 'dist/styles.css'), 'utf8')}\n</style>`);
for (const name of ['music.js', 'commands.js', 'app.js']) {
  const script = fs.readFileSync(path.join(root, 'dist', name), 'utf8').replace(/<\/script/gi, '<\\/script');
  html = html.replace(`<script src="${name}" defer></script>`, () => `<script>\ndocument.addEventListener('DOMContentLoaded', () => {\n${script}\n});\n</script>`);
}
fs.writeFileSync(path.join(root, '此刻计时器.html'), html);
console.log('已更新单文件版：此刻计时器.html');
