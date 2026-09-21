'use strict';

(function initializeNeutralinoAdapter() {
  if (!window.Neutralino) return;

  Neutralino.init();
  Neutralino.events.on('windowClose', () => Neutralino.app.exit());

  function baseName(filePath) {
    return String(filePath).split(/[\\/]/).pop() || String(filePath);
  }

  function shipDetailText(ships = []) {
    return ships
      .filter((ship) => Number(ship?.quantity) > 0)
      .map((ship) => `${ship.type} ${Number(ship.price)}元 × ${Math.floor(Number(ship.quantity))}`)
      .join('；');
  }

  function toArrayBuffer(value) {
    if (value instanceof ArrayBuffer) return value;
    if (ArrayBuffer.isView(value)) {
      return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    }
    throw new Error('无法生成 Excel 二进制数据');
  }

  async function chooseImages() {
    const paths = await Neutralino.os.showOpenDialog('选择流水截图', {
      multiSelections: true,
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp'] }]
    });
    if (!paths?.length) return { canceled: true, files: [], errors: [] };

    const files = [];
    const errors = [];
    for (const filePath of paths) {
      try {
        const bytes = await Neutralino.filesystem.readBinaryFile(filePath);
        files.push({ name: baseName(filePath), bytes });
      } catch (error) {
        errors.push(`${baseName(filePath)}：${error.message}`);
      }
    }
    return { canceled: false, files, errors };
  }

  async function exportExcel(rows) {
    if (!window.ExcelJS) throw new Error('Excel 导出组件未加载');

    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    let filePath = await Neutralino.os.showSaveDialog('导出 Excel', {
      defaultPath: `真实流水排名-${stamp}.xlsx`,
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    });
    if (!filePath) return { canceled: true };
    if (!filePath.toLowerCase().endsWith('.xlsx')) filePath += '.xlsx';

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
        copyable: row.finalFlow >= 10000 ? '是' : '否'
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
      if (rowNumber <= 1) return;
      row.alignment = { vertical: 'middle' };
      row.height = 23;
      if (rowNumber % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FC' } };
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    await Neutralino.filesystem.writeBinaryFile(filePath, toArrayBuffer(buffer));
    return { canceled: false, filePath };
  }

  window.desktopApi = {
    chooseImages,
    copyText: async (text) => {
      await Neutralino.clipboard.writeText(String(text || ''));
      return true;
    },
    exportExcel
  };
})();
