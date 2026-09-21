'use strict';

const ORIGINAL_FLOW_MIN = 10000;
const COPY_FLOW_MIN = 10000;

const SHIP_PRICES = Object.freeze({
  '舰长': Object.freeze([138, 168, 198]),
  '提督': Object.freeze([1558, 1998]),
  '总督': Object.freeze([15558, 19998])
});

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeName(name) {
  return String(name ?? '').trim();
}

function shipBatteryCost(ship) {
  const price = Math.max(0, toFiniteNumber(ship?.price));
  const quantity = Math.max(0, Math.floor(toFiniteNumber(ship?.quantity)));
  return price * quantity * 10;
}

function shipDeduction(ships = []) {
  return ships.reduce((total, ship) => total + shipBatteryCost(ship), 0);
}

function calculateUser(user) {
  const originalFlow = toFiniteNumber(user?.originalFlow);
  const ships = Array.isArray(user?.ships) ? user.ships : [];
  const deduction = shipDeduction(ships);
  return {
    ...user,
    name: normalizeName(user?.name),
    originalFlow,
    ships,
    deduction,
    finalFlow: originalFlow - deduction
  };
}

function rankUsers(users = []) {
  return users
    .map(calculateUser)
    .sort((a, b) => b.finalFlow - a.finalFlow || b.originalFlow - a.originalFlow || a.name.localeCompare(b.name, 'zh-CN'))
    .map((user, index) => ({ ...user, rank: index + 1 }));
}

function mergeRecognizedUsers(existing = [], incoming = []) {
  const merged = new Map();

  for (const raw of existing) {
    const user = calculateUser(raw);
    if (!user.name) continue;
    merged.set(user.name, user);
  }

  for (const raw of incoming) {
    const user = calculateUser(raw);
    if (!user.name || user.originalFlow < ORIGINAL_FLOW_MIN) continue;
    const prior = merged.get(user.name);
    if (!prior || user.originalFlow > prior.originalFlow) {
      merged.set(user.name, {
        ...user,
        id: prior?.id || user.id,
        ships: prior?.ships || user.ships || [],
        needsReview: true
      });
    }
  }

  return rankUsers([...merged.values()]);
}

function copyableNames(users = []) {
  return rankUsers(users)
    .filter((user) => user.finalFlow >= COPY_FLOW_MIN && user.name)
    .map((user) => user.name)
    .join('\n');
}

function shipDetailText(ships = []) {
  return ships
    .filter((ship) => toFiniteNumber(ship?.quantity) > 0)
    .map((ship) => `${ship.type} ${toFiniteNumber(ship.price)}元 × ${Math.floor(toFiniteNumber(ship.quantity))}`)
    .join('；');
}

module.exports = {
  ORIGINAL_FLOW_MIN,
  COPY_FLOW_MIN,
  SHIP_PRICES,
  calculateUser,
  copyableNames,
  mergeRecognizedUsers,
  rankUsers,
  shipBatteryCost,
  shipDeduction,
  shipDetailText
};
