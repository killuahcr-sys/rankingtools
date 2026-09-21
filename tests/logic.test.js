'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateUser,
  copyableNames,
  mergeRecognizedUsers,
  rankUsers,
  shipBatteryCost
} = require('../src/logic');

test('上船流水按价格乘数量乘 10 扣除', () => {
  assert.equal(shipBatteryCost({ type: '舰长', price: 138, quantity: 2 }), 2760);
  assert.equal(calculateUser({ originalFlow: 10000, ships: [{ price: 138, quantity: 2 }] }).finalFlow, 7240);
});

test('一个用户可记录多种船并重新排名', () => {
  const ranked = rankUsers([
    { id: 'a', name: '甲', originalFlow: 30000, ships: [{ type: '舰长', price: 138, quantity: 1 }] },
    { id: 'b', name: '乙', originalFlow: 29000, ships: [] },
    { id: 'c', name: '丙', originalFlow: 50000, ships: [{ type: '提督', price: 1998, quantity: 1 }, { type: '舰长', price: 168, quantity: 2 }] }
  ]);
  assert.deepEqual(ranked.map((user) => user.name), ['乙', '甲', '丙']);
  assert.equal(ranked[2].finalFlow, 26660);
});

test('重复用户名保留最高原始流水且忽略低于 10000 的新记录', () => {
  const merged = mergeRecognizedUsers(
    [{ id: 'old', name: '同名用户', originalFlow: 12000, ships: [{ price: 138, quantity: 1 }] }],
    [
      { id: 'low', name: '同名用户', originalFlow: 11000 },
      { id: 'high', name: '同名用户', originalFlow: 18000 },
      { id: 'ignored', name: '未达门槛', originalFlow: 9999 }
    ]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'old');
  assert.equal(merged[0].originalFlow, 18000);
  assert.equal(merged[0].ships.length, 1);
});

test('批量复制只包含最终流水至少 1000 的用户名并按排名换行', () => {
  const text = copyableNames([
    { name: '用户甲', originalFlow: 1200, ships: [] },
    { name: '用户乙', originalFlow: 999, ships: [] },
    { name: '用户丙', originalFlow: 2000, ships: [{ price: 100, quantity: 1 }] }
  ]);
  assert.equal(text, '用户甲\n用户丙');
});

test('最终流水允许为负数', () => {
  const user = calculateUser({ originalFlow: 1000, ships: [{ price: 138, quantity: 1 }] });
  assert.equal(user.finalFlow, -380);
});
