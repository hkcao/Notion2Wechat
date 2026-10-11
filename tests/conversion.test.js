import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import sharp from 'sharp';
import { convertArticle, formulaImage, cleanHtml } from '../server/convert.js';
import { blocksToHtml, importNotion, pageId } from '../server/notion.js';
import { createDraft } from '../server/wechat.js';
import { fetchImage, isPublicAddress } from '../server/network.js';

const rt = (text, annotations = {}) => [{ type: 'text', plain_text: text, text: { content: text }, annotations }];
const block = (type, data, children = []) => ({ type, [type]: data, children });
const coverBuffer = await readFile(new URL('../public/demo-cover.png', import.meta.url));
const cover = `data:image/png;base64,${coverBuffer.toString('base64')}`;

test('Markdown preserves nested lists, tables, links and inline/display equations as PNG', async () => {
  const result = await convertArticle({ title: '<标题>', markdown: `**重点** $a+b$\n\n$$\nE=mc^2\n$$\n\n- 外层\n  - 内层\n\n| A | B |\n|---|---|\n|1|2|\n\n[来源](https://example.com)`, options: { theme: 'green', includeTitle: true } });
  const $ = load(result.html);
  assert.equal(result.stats.formulas, 2);
  assert.equal(result.stats.images, 0);
  assert.equal($('table').length, 1);
  assert.equal($('ul ul').length, 1);
  assert.equal($('a').first().attr('href'), 'https://example.com');
  assert.equal($('h1').text(), '<标题>');
  assert.ok($('h1').attr('style'));
  for (const image of $('img').toArray()) assert.equal((await sharp(Buffer.from($(image).attr('src').split(',')[1], 'base64')).metadata()).format, 'png');
});

test('Notion preserves annotations, captions, table header, nested lists and degrades unsupported blocks visibly', () => {
  const warnings = [];
  const html = blocksToHtml([
    block('paragraph', { rich_text: rt('重点', { bold: true, underline: true, color: 'blue_background' }) }),
    block('numbered_list_item', { rich_text: rt('父级') }, [block('bulleted_list_item', { rich_text: rt('子级') })]),
    block('image', { type: 'external', external: { url: 'https://example.com/image.png' }, caption: rt('说明') }),
    block('table', { has_column_header: true }, [block('table_row', { cells: [rt('列一'), rt('列二')] })]),
    block('column_list', {}, [block('column', {}, [block('paragraph', { rich_text: rt('分栏') })])]),
    block('unsupported', {}),
  ], warnings);
  const $ = load(html);
  assert.equal($('strong').text(), '重点');
  assert.equal($('u').text(), '重点');
  assert.equal($('ol li ul li').text(), '子级');
  assert.equal($('figcaption').text(), '说明');
  assert.equal($('th').length, 2);
  assert.ok(warnings.some(w => w.includes('多列')));
  assert.ok(warnings.some(w => w.includes('unsupported')));
});

test('Notion accepts app.notion.com copy links while rejecting lookalike domains', () => {
  const id = '123456781234123412341234567890ab';
  for (const input of [`https://app.notion.com/p/${id}?source=copy_link`, `https://demo.notion.site/Article-${id}`, id, '12345678-1234-1234-1234-1234567890ab']) {
    assert.equal(pageId(input), id);
  }
  for (const host of ['app.notion.com.evil.com', 'evilnotion.com']) {
    assert.throws(() => pageId(`https://${host}/p/${id}`), /Notion/);
  }
});

test('Notion paginates and recursively retrieves child blocks', async () => {
  const id = '123456781234123412341234567890ab';
  const called = [];
  const request = async (url, opts) => {
    called.push(url); assert.equal(opts.headers['Notion-Version'], '2026-03-11');
    if (url.includes('/pages/')) return { properties: { Name: { type: 'title', title: rt('测试') } }, url: `https://notion.so/${id}` };
    if (url.includes('start_cursor=')) return { results: [block('paragraph', { rich_text: rt('第二页') })], has_more: false };
    if (url.includes('/blocks/child/')) return { results: [block('paragraph', { rich_text: rt('子内容') })], has_more: false };
    return { results: [{ ...block('bulleted_list_item', { rich_text: rt('第一层') }), id: 'child', has_children: true }], has_more: true, next_cursor: 'next' };
  };
  const result = await importNotion(`https://app.notion.com/p/${id}?source=copy_link`, 'test-token', request);
  assert.ok(called.includes(`https://api.notion.com/v1/pages/${id}`));
  assert.equal(result.title, '测试'); assert.equal(result.blockCount, 3); assert.equal(called.length, 4);
  assert.match(result.rawHtml, /子内容/); assert.match(result.rawHtml, /第二页/);
});

test('Notion errors explain missing authorization and invalid page URL', async () => {
  assert.equal(pageId('https://www.notion.so/My-title-123456781234123412341234567890ab?v=other'), '123456781234123412341234567890ab');
  assert.throws(() => pageId('https://evil.com/123456781234123412341234567890ab'), /Notion/);
  await assert.rejects(importNotion('123456781234123412341234567890ab', 'token', async () => { throw new Error('HTTP 404'); }), error => /404/.test(error.message) && /同一个/.test(error.message) && /工作空间/.test(error.message));
  await assert.rejects(importNotion('123456781234123412341234567890ab', 'token', async () => { throw new Error('HTTP 403'); }), error => /403/.test(error.message) && /读取内容/.test(error.message));
});

test('HTML removes scripts, event handlers, unsafe links and CSS requests', () => {
  const safe = cleanHtml('<script>alert(1)</script><img src="https://example.com/x" onerror="alert(1)"><a href="javascript:alert(1)">x</a><p style="background-image:url(http://127.0.0.1);color:#ff0000;position:fixed">hi</p>');
  assert.doesNotMatch(safe, /script|onerror|javascript|127.0.0.1|position/);
  assert.match(safe, /color:#ff0000/);
});

test('Image downloads block internal addresses, unsupported schemes and malformed data', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1']) assert.equal(isPublicAddress(ip), false);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  await assert.rejects(fetchImage('https://127.0.0.1/x.png'), /内网/);
  await assert.rejects(fetchImage('http://example.com/x.png'), /HTTPS/);
  await assert.rejects(fetchImage('data:image/svg+xml;base64,AAAA'), /仅支持/);
});

test('Images embed successfully; failures produce explicit warnings and text placeholders', async () => {
  const result = await convertArticle({ markdown: '![caption](https://example.com/image.png)\n\n![bad](https://example.com/fail.png)', title: '图片' }, { imageLoader: async url => { if (url.includes('fail')) throw new Error('expired'); return coverBuffer; } });
  assert.equal(result.stats.images, 1); assert.match(result.html, /data:image\/png;base64/); assert.match(result.html, /图片未导入/); assert.ok(result.warnings.some(w => w.includes('expired')));
});

test('Invalid formula is reported without dropping original expression', async () => {
  const result = await convertArticle({ markdown: '$\\invalidcommand{a}$', title: '公式' });
  assert.ok(result.warnings.some(w => w.includes('公式'))); assert.match(result.html, /invalidcommand/);
  const { src } = await formulaImage('\\frac{a}{b}'); assert.match(src, /^data:image\/png;base64,/);
});

test('Links remain clickable in export, with optional footnotes', async () => {
  const result = await convertArticle({ markdown: '[a](https://example.com) [b](https://example.com)', options: { footnotes: false, includeTitle: false } });
  assert.equal(result.stats.links, 1); assert.doesNotMatch(result.html, /参考链接|<h1/); assert.equal(load(result.html)('a').length, 2);
});

test('default Notion conversion does not repeat the article title or append link footnotes', async () => {
  const input = { source: 'notion', title: '测试标题', document: { rawHtml: '<h1>测试标题</h1><p>正文 <a href="https://example.com/source">来源</a></p>' } };
  const result = await convertArticle(input);
  const $ = load(result.html);
  assert.equal($('h1').length, 0);
  assert.equal($('p').length, 1);
  assert.equal($('a').length, 1);
  assert.doesNotMatch(result.html, /参考链接|<sup/);
  const enabled = load((await convertArticle({ ...input, options: { includeTitle: true, footnotes: true } })).html);
  assert.equal(enabled('h1').length, 1);
  assert.equal(enabled('a').length, 2);
  assert.match(enabled.text(), /参考链接/);
});

test('Wechat uploads images once, creates permanent cover, then adds draft with replaced URLs', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('stable_token')) return { access_token: 'test-access-token' };
    if (url.includes('media/uploadimg')) { assert.ok(options.body.get('media') instanceof Blob); return { url: 'https://mmbiz.qpic.cn/test.png' }; }
    if (url.includes('material/add_material')) return { media_id: 'cover-id' };
    if (url.includes('draft/add')) { const article = JSON.parse(options.body).articles[0]; assert.equal(article.thumb_media_id, 'cover-id'); assert.equal(article.title, '测试草稿'); assert.doesNotMatch(article.content, /data:image/); assert.match(article.content, /mmbiz.qpic.cn/); return { media_id: 'draft-id' }; }
    throw new Error('Unexpected request');
  };
  const result = await createDraft({ title: '测试草稿', html: `<p>正文</p><img src="${cover}"><img src="${cover}">` }, { appId: 'wx-test', appSecret: 'secret-test' }, { request });
  assert.equal(result.mediaId, 'draft-id'); assert.equal(result.uploadedImages, 1); assert.equal(calls.length, 4);
});

test('Wechat submits complete styled HTML over 20000 characters without truncation', async () => {
  const html = '<p style="margin:0 0 18px;color:#373735;">长文<strong>重点</strong></p>'.repeat(1000) + '<p>完整文章终点</p>';
  let submitted = false;
  const request = async (url, options) => {
    if (url.includes('stable_token')) return { access_token: 'test-token' };
    if (url.includes('draft/add')) {
      const content = JSON.parse(options.body).articles[0].content;
      assert.ok(content.length > 20000);
      const $ = load(content);
      assert.equal($('p').length, 1001);
      assert.equal($('strong').length, 1000);
      assert.equal($('p').last().text(), '完整文章终点');
      assert.match($('p').first().attr('style'), /color:#373735/);
      submitted = true;
      return { media_id: 'long-draft' };
    }
    throw new Error('Unexpected API');
  };
  const result = await createDraft({ title: '长文', html, thumbMediaId: 'existing-cover' }, { appId: 'test', appSecret: 'test' }, { request });
  assert.equal(submitted, true);
  assert.equal(result.mediaId, 'long-draft');
});

test('Wechat validation prevents empty content, missing cover and oversized metadata before remote calls', async () => {
  const creds = { appId: 'test', appSecret: 'test' }; const request = async () => { assert.fail('Must not call API'); };
  await assert.rejects(createDraft({ title: '测试', html: '' }, creds, { request }), /为空/);
  await assert.rejects(createDraft({ title: '测试', html: '<p>Hi</p>' }, creds, { request }), /封面/);
  await assert.rejects(createDraft({ title: '测试', html: `<img data-formula="true" src="${cover}">` }, creds, { request }), /封面/);
  await assert.rejects(createDraft({ title: 'a'.repeat(65), html: '<p>Hi</p>' }, creds, { request }), /64/);
  await assert.rejects(createDraft({ title: '测试', author: 'a'.repeat(9) }, creds, { request }), /8/);
  await assert.rejects(createDraft({ title: '测试', digest: 'a'.repeat(121) }, creds, { request }), /120/);
  await assert.rejects(createDraft({ title: '测试', html: `<p>${'字'.repeat(400000)}</p>`, thumbMediaId: 'existing-cover' }, creds, { request }), /1 MB/);
});

test('Wechat uses existing cover and exposes permission errors without credentials', async () => {
  const request = async url => url.includes('stable_token') ? { access_token: 'token' } : { errcode: 48001, errmsg: 'api unauthorized' };
  await assert.rejects(createDraft({ title: '测试', html: '<p>正文</p>', thumbMediaId: 'existing-cover' }, { appId: 'wx-test', appSecret: 'secret-test' }, { request }), error => error.message.includes('权限') && !error.message.includes('secret-test'));
});

test('Wechat identifies image-upload authorization failure and stops before cover or draft creation', async () => {
  const calls = [];
  const request = async url => {
    calls.push(url);
    if (url.includes('stable_token')) return { access_token: 'test-token' };
    if (url.includes('media/uploadimg')) return { errcode: 48001, errmsg: 'api unauthorized' };
    assert.fail('Must stop after upload permission failure');
  };
  await assert.rejects(createDraft({ title: '图片', html: `<p>正文</p><img src="${cover}">` }, { appId: 'test', appSecret: 'secret-test' }, { request }), error => error.message.includes('正文图片上传') && error.message.includes('48001') && !error.message.includes('secret-test'));
  assert.equal(calls.length, 2);
});

test('End-to-end conversion sends text, image, formulas and links to draft payload', async () => {
  const converted = await convertArticle({ title: '完整文章', markdown: `文本 **重点** $a+b$\n\n![说明](${cover})\n\n$$\nE=mc^2\n$$\n\n[参考](https://example.com)` });
  let uploads = 0;
  const request = async (url, options) => {
    if (url.includes('stable_token')) return { access_token: 'token' };
    if (url.includes('media/uploadimg')) {
      assert.equal((await sharp(Buffer.from(await options.body.get('media').arrayBuffer())).metadata()).format, 'png');
      return { url: `https://mmbiz.qpic.cn/${++uploads}.png` };
    }
    if (url.includes('draft/add')) {
      const article = JSON.parse(options.body).articles[0];
      const $ = load(article.content);
      assert.equal($('img').length, 3);
      assert.equal($('strong').text(), '重点');
      assert.equal($('a').first().attr('href'), 'https://example.com');
      assert.ok($('img').first().attr('style').includes('display:inline'));
      assert.doesNotMatch(article.content, /data:image/);
      return { media_id: 'full-draft' };
    }
    throw new Error('Unexpected API');
  };
  const result = await createDraft({ html: converted.html, title: '完整文章', thumbMediaId: 'existing-cover' }, { appId: 'test', appSecret: 'test' }, { request });
  assert.equal(uploads, 3); assert.equal(result.mediaId, 'full-draft');
});
