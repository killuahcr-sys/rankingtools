'use strict';

const SHIP_PRICES = {
  '舰长': [138, 168, 198],
  '提督': [1558, 1998],
  '总督': [15558, 19998]
};
const ORIGINAL_FLOW_MIN = 10000;
const COPY_FLOW_MIN = 10000;

const ASSET_ROOT = typeof window.NL_OS === 'string' ? '/assets' : 'app://local/assets';

let users = [];
let editingUserId = null;
let editingShips = [];
let toastTimer = null;
let ocrInstancePromise = null;

const $ = (selector) => document.querySelector(selector);
const elements = {
  recognizeButton: $('#recognizeButton'),
  emptyRecognizeButton: $('#emptyRecognizeButton'),
  manualAddButton: $('#manualAddButton'),
  clearButton: $('#clearButton'),
  copyButton: $('#copyButton'),
  exportButton: $('#exportButton'),
  userCount: $('#userCount'),
  originalTotal: $('#originalTotal'),
  deductionTotal: $('#deductionTotal'),
  copyCount: $('#copyCount'),
  emptyState: $('#emptyState'),
  tableArea: $('#tableArea'),
  userTableBody: $('#userTableBody'),
  progressPanel: $('#progressPanel'),
  progressTitle: $('#progressTitle'),
  progressDetail: $('#progressDetail'),
  progressBar: $('#progressBar'),
  shipModal: $('#shipModal'),
  shipModalTitle: $('#shipModalTitle'),
  closeShipModal: $('#closeShipModal'),
  cancelShipModal: $('#cancelShipModal'),
  saveShipsButton: $('#saveShipsButton'),
  addShipRow: $('#addShipRow'),
  shipRows: $('#shipRows'),
  modalOriginalFlow: $('#modalOriginalFlow'),
  modalDeduction: $('#modalDeduction'),
  modalFinalFlow: $('#modalFinalFlow'),
  confirmModal: $('#confirmModal'),
  cancelClearButton: $('#cancelClearButton'),
  confirmClearButton: $('#confirmClearButton'),
  toast: $('#toast')
};

function createId(prefix = 'user') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(numberValue(value));
}

function deductionFor(ships) {
  return (ships || []).reduce((total, ship) => {
    return total + Math.max(0, numberValue(ship.price)) * Math.max(0, Math.floor(numberValue(ship.quantity))) * 10;
  }, 0);
}

function calculate(user) {
  const deduction = deductionFor(user.ships);
  const originalFlow = numberValue(user.originalFlow);
  return { ...user, originalFlow, deduction, finalFlow: originalFlow - deduction };
}

function rankedUsers() {
  return users
    .map(calculate)
    .sort((a, b) => b.finalFlow - a.finalFlow || b.originalFlow - a.originalFlow || a.name.localeCompare(b.name, 'zh-CN'))
    .map((user, index) => ({ ...user, rank: index + 1 }));
}

function mergeUsers(incoming) {
  const byName = new Map(users.map((user) => [String(user.name).trim(), user]));
  for (const candidate of incoming || []) {
    const name = String(candidate.name || '').trim();
    const originalFlow = numberValue(candidate.originalFlow);
    if (!name || originalFlow < ORIGINAL_FLOW_MIN) continue;
    const existing = byName.get(name);
    if (!existing || originalFlow > numberValue(existing.originalFlow)) {
      byName.set(name, {
        id: existing?.id || candidate.id || createId('ocr'),
        name,
        originalFlow,
        ships: existing?.ships || []
      });
    }
  }
  users = [...byName.values()];
}

function render() {
  const ranked = rankedUsers();
  const originalTotal = ranked.reduce((sum, user) => sum + user.originalFlow, 0);
  const deductionTotal = ranked.reduce((sum, user) => sum + user.deduction, 0);
  const copyCount = ranked.filter((user) => user.finalFlow >= COPY_FLOW_MIN && user.name.trim()).length;

  elements.userCount.textContent = formatNumber(ranked.length);
  elements.originalTotal.textContent = formatNumber(originalTotal);
  elements.deductionTotal.textContent = formatNumber(deductionTotal);
  elements.copyCount.textContent = formatNumber(copyCount);
  elements.copyButton.disabled = copyCount === 0;
  elements.exportButton.disabled = ranked.length === 0;
  elements.clearButton.disabled = ranked.length === 0;
  elements.emptyState.classList.toggle('hidden', ranked.length > 0);
  elements.tableArea.classList.toggle('hidden', ranked.length === 0);

  elements.userTableBody.replaceChildren(...ranked.map(createUserRow));
}

function createUserRow(user) {
  const row = document.createElement('tr');
  row.dataset.id = user.id;

  const rankCell = document.createElement('td');
  rankCell.className = 'rank-column';
  const rankBadge = document.createElement('span');
  rankBadge.className = `rank-badge${user.rank <= 3 ? ' top' : ''}`;
  rankBadge.textContent = user.rank;
  rankCell.append(rankBadge);

  const nameCell = document.createElement('td');
  const nameInput = document.createElement('input');
  nameInput.className = 'cell-input';
  nameInput.value = user.name;
  nameInput.setAttribute('aria-label', `第 ${user.rank} 名用户名`);
  nameInput.addEventListener('change', () => updateUser(user.id, { name: nameInput.value.trim() }));
  nameCell.append(nameInput);

  const originalCell = document.createElement('td');
  originalCell.className = 'number-column';
  const originalInput = document.createElement('input');
  originalInput.className = 'cell-input flow-input';
  originalInput.type = 'number';
  originalInput.step = '1';
  originalInput.value = user.originalFlow;
  originalInput.setAttribute('aria-label', `${user.name}原始流水`);
  originalInput.addEventListener('change', () => updateUser(user.id, { originalFlow: numberValue(originalInput.value) }));
  originalCell.append(originalInput);

  const deductionCell = document.createElement('td');
  deductionCell.className = 'numeric deduction';
  deductionCell.textContent = user.deduction ? `− ${formatNumber(user.deduction)}` : '0';

  const finalCell = document.createElement('td');
  finalCell.className = 'numeric final-flow';
  finalCell.textContent = formatNumber(user.finalFlow);

  const actionsCell = document.createElement('td');
  actionsCell.className = 'actions-column';
  const actionWrap = document.createElement('div');
  actionWrap.className = 'row-actions';
  const shipButton = document.createElement('button');
  shipButton.className = 'small-button primary';
  shipButton.textContent = user.ships.length ? `上船明细 (${user.ships.length})` : '记录上船';
  shipButton.addEventListener('click', () => openShipModal(user.id));
  const deleteButton = document.createElement('button');
  deleteButton.className = 'small-button danger';
  deleteButton.textContent = '删除';
  deleteButton.addEventListener('click', () => {
    users = users.filter((item) => item.id !== user.id);
    render();
  });
  actionWrap.append(shipButton, deleteButton);
  actionsCell.append(actionWrap);

  row.append(rankCell, nameCell, originalCell, deductionCell, finalCell, actionsCell);
  return row;
}

function updateUser(id, patch) {
  users = users.map((user) => user.id === id ? { ...user, ...patch } : user);
  render();
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', isError);
  elements.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), 3300);
}

function setProgress(title, detail, percent) {
  elements.progressPanel.classList.remove('hidden');
  elements.progressTitle.textContent = title;
  elements.progressDetail.textContent = detail;
  elements.progressBar.style.width = `${Math.max(4, Math.min(100, percent))}%`;
}

async function getOcrInstance() {
  if (!ocrInstancePromise) {
    setProgress('正在准备高精度识别', '首次使用正在加载本地中英文模型…', 5);
    ocrInstancePromise = window.PaddleOCRSdk.create({
      textDetectionModelName: 'PP-OCRv5_mobile_det',
      textDetectionModelAsset: {
        url: `${ASSET_ROOT}/models/PP-OCRv5_mobile_det_onnx_infer.tar`
      },
      textRecognitionModelName: 'PP-OCRv5_mobile_rec',
      textRecognitionModelAsset: {
        url: `${ASSET_ROOT}/models/PP-OCRv5_mobile_rec_onnx_infer.tar`
      },
      textDetectionBatchSize: 1,
      textRecognitionBatchSize: 8,
      ortOptions: {
        backend: 'wasm',
        wasmPaths: `${ASSET_ROOT}/ort/`,
        numThreads: 1,
        simd: true
      }
    }).catch((error) => {
      ocrInstancePromise = null;
      throw error;
    });
  }
  return ocrInstancePromise;
}

function itemBounds(item) {
  const points = Array.isArray(item.poly) ? item.poly : [];
  const xs = points.map((point) => numberValue(point[0]));
  const ys = points.map((point) => numberValue(point[1]));
  if (!xs.length || !ys.length) return { left: 0, right: 0, top: 0, bottom: 0, centerX: 0, centerY: 0 };
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return { left, right, top, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}

function cleanFlowNumber(text) {
  const normalized = String(text || '')
    .replace(/[OoＯｏ]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[,，.。\s]/g, '');
  return /^\d{4,9}$/.test(normalized) ? Number(normalized) : null;
}

function normalizeRecognizedName(text) {
  return String(text || '')
    .replace(/(?<=[A-Za-z0-9])\s+(?=[A-Za-z0-9])/g, '_')
    .replace(/[\r\n\s]+/g, '')
    .replace(/^\d{1,3}[.)、]?/, '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim();
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function extractUsersFromItems(items, imageWidth, sourceName) {
  const enriched = items.map((item) => ({ ...item, bounds: itemBounds(item) }));
  const rawFlows = enriched
    .map((item) => ({ ...item, value: cleanFlowNumber(item.text) }))
    .filter((item) => item.value !== null && item.value >= ORIGINAL_FLOW_MIN)
    .filter((item) => item.bounds.centerX >= imageWidth * 0.72)
    .sort((a, b) => a.bounds.centerY - b.bounds.centerY);

  const flows = [];
  const yTolerance = Math.max(8, imageWidth * 0.025);
  for (const flow of rawFlows) {
    const duplicate = flows.find((entry) => Math.abs(entry.bounds.centerY - flow.bounds.centerY) < yTolerance);
    if (!duplicate) flows.push(flow);
    else if ((flow.score || 0) > (duplicate.score || 0)) Object.assign(duplicate, flow);
  }

  const gaps = flows.slice(1).map((flow, index) => flow.bounds.centerY - flows[index].bounds.centerY).filter((gap) => gap > yTolerance);
  const rowHeight = median(gaps) || imageWidth * 0.15;

  return flows.map((flow, index) => {
    const targetY = flow.bounds.centerY - rowHeight * 0.24;
    const candidates = enriched
      .filter((item) => item !== flow && item.text)
      .filter((item) => item.bounds.left >= imageWidth * 0.20 && item.bounds.right <= imageWidth * 0.84)
      .filter((item) => item.bounds.centerY >= flow.bounds.centerY - rowHeight * 0.65)
      .filter((item) => item.bounds.centerY <= flow.bounds.centerY + rowHeight * 0.03)
      .map((item) => ({ ...item, cleanName: normalizeRecognizedName(item.text) }))
      .filter((item) => item.cleanName && cleanFlowNumber(item.cleanName) === null)
      .filter((item) => !/^(?:V?\d{1,3}|饼?OK\d*|舰长|提督|总督)$/i.test(item.cleanName))
      .map((item) => ({
        ...item,
        rankScore:
          (item.score || 0) * 20 +
          Math.min(item.cleanName.length, 18) -
          Math.abs(item.bounds.centerY - targetY) / rowHeight * 12
      }))
      .sort((a, b) => b.rankScore - a.rankScore);

    const name = candidates[0]?.cleanName || `未识别用户名${index + 1}`;
    return {
      id: createId('ocr'),
      name,
      originalFlow: flow.value,
      ships: [],
      source: sourceName
    };
  });
}

async function recognizeFile(ocr, file, fileIndex, fileCount) {
  const blob = new Blob([file.bytes]);
  const bitmap = await createImageBitmap(blob);
  const scale = Math.max(1, Math.min(4, 900 / bitmap.width));
  const imageWidth = Math.round(bitmap.width * scale);
  const imageHeight = Math.round(bitmap.height * scale);
  const chunkHeight = 1800;
  const overlap = 120;
  const step = chunkHeight - overlap;
  const chunks = Math.max(1, Math.ceil(Math.max(0, imageHeight - overlap) / step));
  const allItems = [];

  for (let chunkIndex = 0; chunkIndex < chunks; chunkIndex += 1) {
    const offsetY = chunkIndex * step;
    const height = Math.min(chunkHeight, imageHeight - offsetY);
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.imageSmoothingEnabled = false;
    context.drawImage(
      bitmap,
      0,
      offsetY / scale,
      bitmap.width,
      height / scale,
      0,
      0,
      imageWidth,
      height
    );
    const overall = ((fileIndex - 1) + (chunkIndex + 0.35) / chunks) / fileCount;
    setProgress(
      `正在识别第 ${fileIndex}/${fileCount} 张截图`,
      chunks > 1 ? `长图分段识别 ${chunkIndex + 1}/${chunks}` : file.name,
      12 + overall * 82
    );
    const [result] = await ocr.predict(canvas, {
      textDetLimitSideLen: 1920,
      textDetLimitType: 'max',
      textDetMaxSideLimit: 2200,
      textDetThresh: 0.25,
      textDetBoxThresh: 0.35,
      textRecScoreThresh: 0.2
    });
    for (const item of result.items || []) {
      allItems.push({
        ...item,
        poly: item.poly.map((point) => [point[0], point[1] + offsetY])
      });
    }
  }
  bitmap.close();
  return extractUsersFromItems(allItems, imageWidth, file.name);
}

async function recognizeImages() {
  elements.recognizeButton.disabled = true;
  elements.emptyRecognizeButton.disabled = true;
  try {
    const selection = await window.desktopApi.chooseImages();
    if (selection.canceled) return;
    const ocr = await getOcrInstance();
    const recognized = [];
    const errors = [...(selection.errors || [])];
    for (let index = 0; index < selection.files.length; index += 1) {
      try {
        recognized.push(...await recognizeFile(ocr, selection.files[index], index + 1, selection.files.length));
      } catch (error) {
        errors.push(`${selection.files[index].name}：${error.message}`);
      }
    }
    mergeUsers(recognized);
    render();
    setProgress('识别完成', `共读取 ${recognized.length} 条符合条件的记录`, 100);
    if (errors.length) {
      showToast(`部分图片未能识别：${errors.join('；')}`, true);
    } else if (!recognized.length) {
      showToast('没有识别到原始流水达到 10,000 的用户，请换一张更清晰的截图或手动添加。', true);
    } else {
      showToast(`识别完成，已读取 ${recognized.length} 条记录。`);
    }
  } catch (error) {
    showToast(`识别失败：${error.message}`, true);
  } finally {
    setTimeout(() => elements.progressPanel.classList.add('hidden'), 600);
    elements.recognizeButton.disabled = false;
    elements.emptyRecognizeButton.disabled = false;
  }
}

function addManualUser() {
  users.push({
    id: createId('manual'),
    name: '新用户',
    originalFlow: ORIGINAL_FLOW_MIN,
    ships: []
  });
  render();
  requestAnimationFrame(() => {
    const rows = [...elements.userTableBody.querySelectorAll('tr')];
    const row = rows.find((item) => item.dataset.id === users.at(-1).id);
    row?.querySelector('input')?.select();
  });
}

function openShipModal(userId) {
  const user = users.find((item) => item.id === userId);
  if (!user) return;
  editingUserId = userId;
  editingShips = user.ships.map((ship) => ({ ...ship }));
  elements.shipModalTitle.textContent = `${user.name} · 上船明细`;
  elements.shipModal.classList.remove('hidden');
  renderShipRows();
}

function closeShipModal() {
  elements.shipModal.classList.add('hidden');
  editingUserId = null;
  editingShips = [];
}

function renderShipRows() {
  const user = users.find((item) => item.id === editingUserId);
  if (!user) return;
  const deduction = deductionFor(editingShips);
  elements.modalOriginalFlow.textContent = formatNumber(user.originalFlow);
  elements.modalDeduction.textContent = formatNumber(deduction);
  elements.modalFinalFlow.textContent = formatNumber(numberValue(user.originalFlow) - deduction);
  elements.shipRows.replaceChildren(...editingShips.map((ship, index) => createShipRow(ship, index)));
  if (!editingShips.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.style.padding = '24px 12px';
    empty.innerHTML = '<p>还没有上船记录。点击下方按钮添加舰长、提督或总督。</p>';
    elements.shipRows.append(empty);
  }
}

function createShipRow(ship, index) {
  const row = document.createElement('div');
  row.className = 'ship-row';

  const typeField = fieldWrap('船类型');
  const typeSelect = document.createElement('select');
  for (const type of Object.keys(SHIP_PRICES)) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    option.selected = ship.type === type;
    typeSelect.append(option);
  }
  typeSelect.addEventListener('change', () => {
    editingShips[index].type = typeSelect.value;
    editingShips[index].price = SHIP_PRICES[typeSelect.value][0];
    renderShipRows();
  });
  typeField.append(typeSelect);

  const priceField = fieldWrap('人民币价格');
  const priceSelect = document.createElement('select');
  for (const price of SHIP_PRICES[ship.type]) {
    const option = document.createElement('option');
    option.value = price;
    option.textContent = `${price} 元`;
    option.selected = numberValue(ship.price) === price;
    priceSelect.append(option);
  }
  priceSelect.addEventListener('change', () => {
    editingShips[index].price = numberValue(priceSelect.value);
    renderShipRows();
  });
  priceField.append(priceSelect);

  const quantityField = fieldWrap('数量');
  const quantityInput = document.createElement('input');
  quantityInput.type = 'number';
  quantityInput.min = '1';
  quantityInput.step = '1';
  quantityInput.value = Math.max(1, Math.floor(numberValue(ship.quantity)));
  quantityInput.addEventListener('change', () => {
    editingShips[index].quantity = Math.max(1, Math.floor(numberValue(quantityInput.value)));
    renderShipRows();
  });
  quantityField.append(quantityInput);

  const costField = fieldWrap('扣除电池');
  const cost = document.createElement('div');
  cost.className = 'ship-cost';
  cost.textContent = formatNumber(numberValue(ship.price) * numberValue(ship.quantity) * 10);
  costField.append(cost);

  const remove = document.createElement('button');
  remove.className = 'remove-ship';
  remove.title = '删除此条';
  remove.textContent = '×';
  remove.addEventListener('click', () => {
    editingShips.splice(index, 1);
    renderShipRows();
  });

  row.append(typeField, priceField, quantityField, costField, remove);
  return row;
}

function fieldWrap(labelText) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  wrapper.append(label);
  return wrapper;
}

function addShip() {
  editingShips.push({ type: '舰长', price: 138, quantity: 1 });
  renderShipRows();
  requestAnimationFrame(() => elements.shipRows.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
}

function saveShips() {
  users = users.map((user) => user.id === editingUserId
    ? { ...user, ships: editingShips.map((ship) => ({ ...ship })) }
    : user);
  closeShipModal();
  render();
  showToast('上船明细已保存，排名已重新计算。');
}

async function copyNames() {
  const names = rankedUsers()
    .filter((user) => user.finalFlow >= COPY_FLOW_MIN && user.name.trim())
    .map((user) => user.name.trim());
  if (!names.length) return;
  await window.desktopApi.copyText(names.join('\n'));
  showToast(`已批量复制 ${names.length} 个用户名，按最终排名排列。`);
}

async function exportExcel() {
  const ranked = rankedUsers();
  if (!ranked.length) return;
  try {
    const result = await window.desktopApi.exportExcel(ranked);
    if (!result.canceled) showToast('Excel 已成功导出。');
  } catch (error) {
    showToast(`导出失败：${error.message}`, true);
  }
}

elements.recognizeButton.addEventListener('click', recognizeImages);
elements.emptyRecognizeButton.addEventListener('click', recognizeImages);
elements.manualAddButton.addEventListener('click', addManualUser);
elements.copyButton.addEventListener('click', copyNames);
elements.exportButton.addEventListener('click', exportExcel);
elements.clearButton.addEventListener('click', () => elements.confirmModal.classList.remove('hidden'));
elements.cancelClearButton.addEventListener('click', () => elements.confirmModal.classList.add('hidden'));
elements.confirmClearButton.addEventListener('click', () => {
  users = [];
  elements.confirmModal.classList.add('hidden');
  render();
  showToast('当前数据已清空。');
});
elements.closeShipModal.addEventListener('click', closeShipModal);
elements.cancelShipModal.addEventListener('click', closeShipModal);
elements.addShipRow.addEventListener('click', addShip);
elements.saveShipsButton.addEventListener('click', saveShips);
elements.shipModal.addEventListener('click', (event) => {
  if (event.target === elements.shipModal) closeShipModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!elements.shipModal.classList.contains('hidden')) closeShipModal();
    elements.confirmModal.classList.add('hidden');
  }
});

render();
