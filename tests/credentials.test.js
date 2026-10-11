import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCredentialStore } from '../server/credentials.js';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'inkbridge-credentials-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'data', 'connections.json');
}

test('Connections persist across store restarts with private file permissions and no secrets in status', t => {
  const file = fixture(t);
  const credentials = { token: 'test-notion-token', appId: 'wx-test', appSecret: 'test-wechat-secret' };
  const status = createCredentialStore(file, {}).save(credentials);
  assert.deepEqual(createCredentialStore(file, {}).get(), credentials);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(status.notionConfigured, true);
  assert.equal(status.wechatConfigured, true);
  for (const value of Object.values(credentials)) assert.ok(!JSON.stringify(status).includes(value));
});

test('Updating one connection preserves blank fields and falls back to environment configuration', t => {
  const file = fixture(t);
  const store = createCredentialStore(file, { NOTION_TOKEN: 'env-notion', WECHAT_APP_ID: 'wx-env', WECHAT_APP_SECRET: 'env-secret' });
  assert.equal(store.status().wechatConfigured, true);
  store.save({ token: ' local-notion ', appId: '', appSecret: '' });
  store.save({ token: '', appSecret: ' new-secret ' });
  assert.deepEqual(store.get(), { token: 'local-notion', appId: 'wx-env', appSecret: 'new-secret' });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { token: 'local-notion', appSecret: 'new-secret' });
});

test('Invalid save requests preserve the existing credentials on disk and in memory', t => {
  const file = fixture(t);
  const store = createCredentialStore(file, {});
  store.save({ token: 'old-token' });
  for (const input of [null, [], { token: 42 }, { appSecret: 'x'.repeat(4097) }]) assert.throws(() => store.save(input), /格式/);
  assert.equal(store.get().token, 'old-token');
  assert.equal(createCredentialStore(file, {}).get().token, 'old-token');
});

test('Malformed configuration reports an error without exposing its contents', t => {
  const file = fixture(t);
  createCredentialStore(file, {}).save({ token: 'private-value' });
  writeFileSync(file, '{ private-value');
  assert.throws(() => createCredentialStore(file, {}), error => error.message.includes('无法读取') && !error.message.includes('private-value'));
});
