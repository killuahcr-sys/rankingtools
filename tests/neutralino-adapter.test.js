'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ExcelJS = require('exceljs');

function loadAdapter(overrides = {}) {
  const writes = [];
  const copied = [];
  const neutralino = {
    init() {},
    events: { on() {} },
    app: { exit() {} },
    os: {
      async showOpenDialog() { return []; },
      async showSaveDialog() { return 'ranking.xlsx'; }
    },
    filesystem: {
      async readBinaryFile() { return new ArrayBuffer(0); },
      async writeBinaryFile(filePath, data) { writes.push({ filePath, data }); }
    },
    clipboard: {
      async writeText(text) { copied.push(text); }
    },
    ...overrides
  };
  const window = { Neutralino: neutralino, ExcelJS };
  const context = vm.createContext({ window, Neutralino: neutralino, ExcelJS, ArrayBuffer, console });
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'neutralino-adapter.js'), 'utf8');
  vm.runInContext(source, context);
  return { api: window.desktopApi, writes, copied };
}

test('轻量版批量复制写入系统剪贴板', async () => {
  const { api, copied } = loadAdapter();
  await api.copyText('用户甲\n用户乙');
  assert.deepEqual(copied, ['用户甲\n用户乙']);
});

test('轻量版 Excel 导出包含最终流水 10000 门槛', async () => {
  const { api, writes } = loadAdapter();
  await api.exportExcel([
    { rank: 1, name: '保留用户', originalFlow: 15000, ships: [], deduction: 0, finalFlow: 15000 },
    { rank: 2, name: '扣除用户', originalFlow: 10000, ships: [{ type: '舰长', price: 138, quantity: 1 }], deduction: 1380, finalFlow: 8620 }
  ]);

  assert.equal(writes.length, 1);
  assert.equal(writes[0].filePath, 'ranking.xlsx');
  assert.ok(writes[0].data instanceof ArrayBuffer);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(writes[0].data));
  const sheet = workbook.getWorksheet('真实流水排名');
  assert.equal(sheet.getCell('G2').value, '是');
  assert.equal(sheet.getCell('G3').value, '否');
  assert.equal(sheet.getCell('D3').value, '舰长 138元 × 1');
});
