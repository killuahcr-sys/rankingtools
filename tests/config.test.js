'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('轻量版启动页目录与打包资源目录保持一致', () => {
  const configPath = path.join(__dirname, '..', 'neutralino.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  assert.equal(config.documentRoot, config.cli.resourcesPath);
  assert.equal(config.url, '/');
  assert.equal(config.enableServer, true);
});
