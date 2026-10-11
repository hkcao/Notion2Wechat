import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { load } from 'cheerio';
import { createWebDraft, createWebSession } from '../server/wechat-web.js';
import { extractWebMeta, buildWebDraftForm, checkWebResponse } from '../server/wechat-web-protocol.js';

const image = await readFile(new URL('../public/demo-cover.png', import.meta.url));
const picture = `data:image/png;base64,${image.toString('base64')}`;
const meta = { token: 'test-token', ticket: 'test-ticket', userName: 'test-user', nickName: '测试公众号', svrTime: 123 };

test('web metadata parser rejects logged-out pages and extracts only known session fields', () => {
  assert.equal(extractWebMeta('<html>扫码登录</html>'), null);
  assert.deepEqual(extractWebMeta(`t:"test-token" || "", ticket:'test-ticket', user_name:'test-user', nick_name:'测试公众号', time:'123'`), meta);
});

test('web draft form keeps full long HTML, cover fields and article metadata', () => {
  const html = '<p style="color:#123456">全文<strong>重点</strong></p>'.repeat(1000) + '<p>最后一句</p>';
  const form = buildWebDraftForm(meta, { title: '标题', content: html, author: '作者', digest: '摘要', sourceUrl: 'https://example.com' }, { url: 'https://mmbiz.qpic.cn/cover', fileId: '1234' });
  assert.equal(form.get('content0'), html);
  assert.equal(form.get('cdn_url0'), 'https://mmbiz.qpic.cn/cover');
  assert.equal(form.get('fileid0'), '1234');
  assert.equal(form.get('sourceurl0'), 'https://example.com');
  assert.equal(form.get('count'), '1');
  assert.equal(form.get('AppMsgId'), '');
});

test('web sync uploads inline formula and images once, preserves styles and link destinations', async () => {
  let uploads = 0;
  let saved;
  const session = {
    requireLogin: async () => meta,
    upload: async () => ({ url: `https://mmbiz.qpic.cn/image-${++uploads}`, fileId: String(uploads) }),
    save: async (_meta, payload, cover) => { saved = { payload, cover }; return { appMsgId: '987' }; },
  };
  const html = `<section style="line-height:1.9"><p style="color:#123456">全文</p>${'<p><strong>保留内容</strong></p>'.repeat(1000)}<img src="${picture}"><img src="${picture}" data-formula="true" style="width:120px"><a href="https://example.com/doc?q=1&amp;x=2">外链</a><a href="https://mp.weixin.qq.com/s/test">微信文章</a><a href="https://mp.weixin.qq.com.evil.test">仿冒域名</a><p>最后一句</p></section>`;
  const result = await createWebDraft({ html, title: '文章' }, session);
  const $ = load(saved.payload.content);
  assert.equal(uploads, 1);
  assert.equal(result.mediaId, '987');
  assert.equal(result.externalLinks, 2);
  assert.equal($('img').length, 2);
  assert.equal($('img').eq(1).attr('style'), 'width:120px');
  assert.equal($('strong').length, 1000);
  assert.ok($.text().includes('最后一句'));
  assert.ok($.text().includes('https://example.com/doc?q=1&x=2'));
  assert.doesNotMatch($.text(), /链接出处/);
  assert.ok($('a').first().prev().text().includes('https://example.com/doc?q=1&x=2'));
  assert.equal($('a').length, 1);
  assert.equal(saved.cover.fileId, '1');
  assert.ok(saved.payload.content.length > 20000);
});

test('web draft validates cover before writes; expired sessions and save failures do not retry', async () => {
  let writes = 0;
  const session = { requireLogin: async () => meta, upload: async () => { writes++; return { url: 'https://mmbiz.qpic.cn/image', fileId: '1' }; }, save: async () => { writes++; throw new Error('网络超时'); } };
  await assert.rejects(createWebDraft({ title: '标题', html: `<img src="${picture}" data-formula="true">` }, session), /封面/);
  assert.equal(writes, 0);
  await assert.rejects(createWebDraft({ title: '标题', html: '<p>全文</p>', cover: picture }, { ...session, requireLogin: async () => { throw new Error('请扫码登录'); } }), /扫码登录/);
  assert.equal(writes, 0);
  await assert.rejects(createWebDraft({ title: '标题', html: '<p>全文</p>', cover: picture }, session), /先检查草稿箱/);
  assert.equal(writes, 2);
  assert.throws(() => checkWebResponse({ base_resp: { ret: 200003 } }, '保存'), /过期.*扫码/);
  assert.throws(() => checkWebResponse({}, '保存'), /未返回有效/);
});

test('web transport sends browser-authenticated uploads and cover form, and invalidates expired login', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'inkbridge-web-transport-'));
  const html = `t:"test-token" || "", ticket:'test-ticket', user_name:'test-user', nick_name:'测试公众号', time:'123'`;
  const calls = [];
  let saveExpired = false;
  const page = { goto: async () => {}, bringToFront: async () => {}, url: () => 'https://mp.weixin.qq.com/', content: async () => html };
  const context = { pages: () => [page], on: () => {}, close: async () => {}, cookies: async () => [], addCookies: async () => {}, request: {
    get: async () => ({ text: async () => html }),
    post: async (url, options) => {
      calls.push({ url, options });
      return { json: async () => url.includes('filetransfer') ? { base_resp: { ret: 0 }, cdn_url: 'https://mmbiz.qpic.cn/picture', file_id: 111 } : (saveExpired ? { base_resp: { ret: 200003 } } : { base_resp: { ret: 0 }, appMsgId: 222 }) };
    },
  } };
  const session = createWebSession(profile, { launch: async () => context });
  try {
    await session.login();
    const auth = await session.requireLogin();
    const cover = await session.upload(auth, image);
    assert.equal(calls[0].options.multipart.file.buffer, image);
    assert.equal(new URL(calls[0].url).searchParams.get('ticket'), 'test-ticket');
    assert.deepEqual(await session.save(auth, { title: '标题', content: '<p>完整正文</p>' }, cover), { appMsgId: '222' });
    const form = new URLSearchParams(calls[1].options.data);
    assert.equal(form.get('fileid0'), '111');
    assert.equal(form.get('content0'), '<p>完整正文</p>');
    saveExpired = true;
    await assert.rejects(session.save(auth, { title: '标题', content: '<p>完整正文</p>' }, cover), /过期.*扫码/);
    assert.equal((await session.status()).loggedIn, false);
  } finally { await session.close(); await rm(profile, { recursive: true, force: true }); }
});

test('session status does not launch a browser or expose secrets; session cookies persist privately', async () => {
  let launches = 0;
  const page = { goto: async () => {}, bringToFront: async () => {}, url: () => 'https://mp.weixin.qq.com/cgi-bin/home', content: async () => `t:"test-token" || "", ticket:'test-ticket', user_name:'test-user', nick_name:'测试公众号', time:'123'` };
  const cookies = [{ name: 'test-session', value: 'cookie-secret', domain: 'mp.weixin.qq.com', path: '/', expires: -1 }];
  let restored;
  const context = { pages: () => [page], on: () => {}, close: async () => {}, cookies: async () => cookies, addCookies: async (value) => { restored = value; } };
  const profile = await mkdtemp(path.join(tmpdir(), 'inkbridge-web-test-'));
  const session = createWebSession(profile, { launch: async () => { launches++; return context; } });
  try {
  assert.equal((await session.status()).loggedIn, false);
  assert.equal(launches, 0);
  assert.equal((await session.login()).loggedIn, true);
  assert.equal(launches, 1);
  const status = await session.status();
  assert.equal(status.nickName, '测试公众号');
  for (const value of ['test-token', 'test-ticket', 'test-user', 'cookie-secret']) assert.ok(!JSON.stringify(status).includes(value));
  assert.equal((await stat(path.join(profile, 'inkbridge-cookies.json'))).mode & 0o777, 0o600);
  assert.equal((await stat(profile)).mode & 0o777, 0o700);
  await session.close();
  assert.equal((await session.status()).loggedIn, false);
  await session.login();
  assert.deepEqual(restored, cookies);
  await session.close();
  } finally { await rm(profile, { recursive: true, force: true }); }
});
