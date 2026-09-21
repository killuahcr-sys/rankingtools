'use strict';

const fs = require('fs');
const path = require('path');
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  protocol
} = require('electron');
const ExcelJS = require('exceljs');
const { COPY_FLOW_MIN, shipDetailText } = require('./logic');

let mainWindow;

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.tar': 'application/x-tar',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  }[extension] || 'application/octet-stream';
}

async function handleAppRequest(request) {
  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const appRoot = app.getAppPath();
  const rendererRoot = path.join(appRoot, 'src', 'renderer');
  const assetsRoot = path.join(appRoot, 'assets');
  const isAsset = relative.startsWith('assets/');
  const root = isAsset ? assetsRoot : rendererRoot;
  const child = isAsset ? relative.slice('assets/'.length) : (relative || 'index.html');
  const filePath = path.resolve(root, child);

  if (!filePath.startsWith(`${path.resolve(root)}${path.sep}`) && filePath !== path.resolve(root)) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const data = await fs.promises.readFile(filePath);
    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': contentType(filePath),
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin'
      }
    });
  } catch (_error) {
    return new Response('Not found', { status: 404 });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#f4f6fb',
    title: '真实流水排名助手',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL('app://local/index.html');
}

ipcMain.handle('images:choose', async () => {
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: '选择流水截图',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
  });
  if (selection.canceled || !selection.filePaths.length) return { canceled: true, files: [] };

  const files = [];
  const errors = [];
  for (const filePath of selection.filePaths) {
    try {
      const bytes = await fs.promises.readFile(filePath);
      files.push({ name: path.basename(filePath), bytes });
    } catch (error) {
      errors.push(`${path.basename(filePath)}：${error.message}`);
    }
  }
  return { canceled: false, files, errors };
});

ipcMain.handle('clipboard:write', async (_event, text) => {
  await clipboard.writeText(String(text || ''));
  return true;
});

ipcMain.handle('excel:export', async (_event, rows) => {
  const date = new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const selection = await dialog.showSaveDialog(mainWindow, {
    title: '导出 Excel',
    defaultPath: `真实流水排名-${stamp}.xlsx`,
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
  });
  if (selection.canceled || !selection.filePath) return { canceled: true };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '真实流水排名助手';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('真实流水排名', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  sheet.columns = [
    { header: '排名', key: 'rank', width: 10 },
    { header: '用户名', key: 'name', width: 30 },
    { header: '原始电池流水', key: 'originalFlow', width: 18 },
    { header: '上船明细', key: 'shipDetails', width: 45 },
    { header: '上船扣除电池', key: 'deduction', width: 18 },
    { header: '最终真实流水', key: 'finalFlow', width: 18 },
    { header: '进入复制名单', key: 'copyable', width: 16 }
  ];

  for (const row of rows || []) {
    sheet.addRow({
      rank: row.rank,
      name: row.name,
      originalFlow: row.originalFlow,
      shipDetails: shipDetailText(row.ships),
      deduction: row.deduction,
      finalFlow: row.finalFlow,
      copyable: row.finalFlow >= COPY_FLOW_MIN ? '是' : '否'
    });
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3157D5' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };
  header.height = 26;
  sheet.autoFilter = { from: 'A1', to: 'G1' };
  sheet.getColumn('C').numFmt = '#,##0';
  sheet.getColumn('E').numFmt = '#,##0';
  sheet.getColumn('F').numFmt = '#,##0';
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'middle' };
      row.height = 23;
      if (rowNumber % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
      }
    }
  });

  await workbook.xlsx.writeFile(selection.filePath);
  return { canceled: false, filePath: selection.filePath };
});

app.whenReady().then(async () => {
  protocol.handle('app', handleAppRequest);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
