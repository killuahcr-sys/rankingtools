'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'light', 'resources');

function copy(source, destination) {
  const from = path.join(root, source);
  const to = path.join(output, destination);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

copy('src/renderer/styles.css', 'styles.css');
copy('src/renderer/app.js', 'app.js');
copy('src/renderer/neutralino-adapter.js', 'neutralino-adapter.js');
copy('src/renderer/vendor/paddleocr.bundle.js', 'vendor/paddleocr.bundle.js');
copy('node_modules/exceljs/dist/exceljs.min.js', 'vendor/exceljs.min.js');
copy('node_modules/@neutralinojs/lib/dist/neutralino.js', 'js/neutralino.js');
copy('assets/models', 'assets/models');
copy('assets/ort', 'assets/ort');

const sourceHtml = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const scriptMarker = [
  '    <script src="vendor/paddleocr.bundle.js"></script>',
  '    <script src="app.js"></script>'
].join('\n');
const lightScripts = [
  '    <script src="js/neutralino.js"></script>',
  '    <script src="vendor/exceljs.min.js"></script>',
  '    <script src="vendor/paddleocr.bundle.js"></script>',
  '    <script src="neutralino-adapter.js"></script>',
  '    <script src="app.js"></script>'
].join('\n');

if (!sourceHtml.includes(scriptMarker)) {
  throw new Error('无法定位页面脚本入口，轻量版构建已停止。');
}

fs.writeFileSync(path.join(output, 'index.html'), sourceHtml.replace(scriptMarker, lightScripts));
console.log(`Lightweight resources prepared at ${output}`);
