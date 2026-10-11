// Web request formats adapted from xihe-lab/wechat-mp-mcp-server (Apache-2.0).
// Modified for InkBridge; see THIRD_PARTY_NOTICES.md.
import { mkdir, chmod, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { load } from 'cheerio';
import { cleanHtml, normalizeImage } from './convert.js';
import { fetchImage } from './network.js';
import { webOrigin, extractWebMeta, buildWebDraftForm, checkWebResponse } from './wechat-web-protocol.js';

export function createWebSession(profileDir, { launch } = {}) {
  let context = null;
  let launching = null;
  let meta = null;
  let loginPending = false;
  let expired = false;
  const cookieFile = path.join(profileDir, 'inkbridge-cookies.json');
  async function persistCookies() {
    // Chrome drops session cookies on normal exit, so also preserve these locally.
    const cookies = await context.cookies(webOrigin);
    const temporary = `${cookieFile}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(cookies), { mode: 0o600 });
    await rename(temporary, cookieFile);
  }
  const requestOptions = () => ({ headers: { Origin: webOrigin, Referer: `${webOrigin}/cgi-bin/home?token=${encodeURIComponent(meta.token)}&lang=zh_CN` }, timeout: 30000, maxRedirects: 0 });
  async function responseJson(response, action) {
    try {
      const data = await response.json();
      if (Number(data.ret ?? data.base_resp?.ret) === 200003) { meta = null; expired = true; }
      return checkWebResponse(data, action);
    }
    catch (error) {
      if (error instanceof SyntaxError) { meta = null; expired = true; throw new Error(`${action}返回了登录或验证页面，请重新扫码登录`); }
      throw error;
    }
  }
  async function status() {
    if (context && !expired) {
      let current = null;
      for (const page of context.pages()) {
        if (!page.url().startsWith(`${webOrigin}/`)) continue;
        const candidate = extractWebMeta(await page.content().catch(() => ''));
        if (candidate) { current = candidate; loginPending = false; break; }
      }
      const changed = current && current.token !== meta?.token;
      meta = current;
      if (changed) await persistCookies();
    }
    return { loggedIn: !!meta, browserOpen: !!context, loginPending, nickName: meta?.nickName || '' };
  }
  async function login() {
    if (!context && !launching) {
      launching = (async () => {
        await mkdir(profileDir, { recursive: true, mode: 0o700 });
        await chmod(profileDir, 0o700);
        try {
          const start = launch || (async (dir) => {
            const { chromium } = await import('playwright-core');
            return chromium.launchPersistentContext(dir, { channel: 'chrome', headless: false, viewport: null, timeout: 30000 });
          });
          context = await start(profileDir);
          context.on('close', () => { context = null; meta = null; loginPending = false; });
          try { await context.addCookies(JSON.parse(await readFile(cookieFile, 'utf8'))); }
          catch (error) { if (error.code !== 'ENOENT') throw new Error('本机登录状态损坏'); }
        } catch { throw new Error('无法打开扫码窗口，请确认本机已安装 Google Chrome；若旧窗口还在运行，请先关闭该公众号窗口再试'); }
        finally { launching = null; }
      })();
    }
    if (launching) await launching;
    const page = context.pages()[0] || await context.newPage();
    meta = null;
    expired = false;
    loginPending = true;
    await page.goto(webOrigin, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.bringToFront();
    return status();
  }
  async function requireLogin() {
    if (!context) throw new Error('请在连接设置中点击「打开公众号登录窗口」，扫码或恢复本机登录');
    await status();
    if (!meta) throw new Error('请先在公众号窗口扫码登录');
    let response;
    try { response = await context.request.get(`${webOrigin}/cgi-bin/home?t=home/index&token=${encodeURIComponent(meta.token)}&lang=zh_CN`, { ...requestOptions(), maxRedirects: 5 }); }
    catch { throw new Error('无法验证公众号登录，请检查网络后重试'); }
    const current = extractWebMeta(await response.text());
    if (!current) { meta = null; expired = true; throw new Error('公众号登录已过期，请重新打开登录窗口并扫码'); }
    meta = current;
    await persistCookies();
    return meta;
  }
  async function upload(auth, buffer) {
    const seq = String(Date.now());
    const query = new URLSearchParams({ action: 'upload_material', f: 'json', scene: '8', writetype: 'doublewrite', groupid: '1', ticket_id: auth.userName, ticket: auth.ticket, svr_time: String(auth.svrTime), token: auth.token, lang: 'zh_CN', seq, t: String(Math.random()) });
    let response;
    try {
      response = await context.request.post(`${webOrigin}/cgi-bin/filetransfer?${query}`, { ...requestOptions(), multipart: { type: 'image/png', id: seq, name: 'inkbridge.png', lastModifiedDate: new Date().toString(), size: String(buffer.length), file: { name: 'inkbridge.png', mimeType: 'image/png', buffer } } });
    } catch { throw new Error('公众号网页图片上传失败，请检查网络；已上传图片可能保留在素材库'); }
    const result = await responseJson(response, '图片上传');
    const url = result.cdn_url;
    if (!url || !/^https?:\/\/(?:[^/]+\.)?(?:qpic|qlogo)\.cn\//i.test(url)) throw new Error('图片上传没有返回有效的微信图片地址');
    return { url, fileId: String(result.file_id ?? result.fileid ?? '') };
  }
  async function save(auth, article, cover) {
    const query = new URLSearchParams({ t: 'ajax-response', sub: 'create', type: '77', token: auth.token, lang: 'zh_CN' });
    let response;
    try { response = await context.request.post(`${webOrigin}/cgi-bin/operate_appmsg?${query}`, { ...requestOptions(), headers: { ...requestOptions().headers, 'Content-Type': 'application/x-www-form-urlencoded' }, data: buildWebDraftForm(auth, article, cover).toString() }); }
    catch { throw new Error('公众号网页草稿保存请求超时或网络中断'); }
    const result = await responseJson(response, '草稿保存');
    const appMsgId = String(result.appMsgId ?? result.AppMsgId ?? '');
    if (!/^\d+$/.test(appMsgId)) throw new Error('草稿保存未返回有效草稿 ID');
    return { appMsgId };
  }
  async function openDraft(appMsgId) {
    if (!/^\d+$/.test(appMsgId || '')) throw new Error('无效草稿 ID');
    const auth = await requireLogin();
    const page = context.pages()[0] || await context.newPage();
    const query = new URLSearchParams({ t: 'media/appmsg_edit', action: 'edit', type: '77', appmsgid: appMsgId, token: auth.token, lang: 'zh_CN' });
    try {
      await page.goto(`${webOrigin}/cgi-bin/appmsg?${query}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.bringToFront();
    } catch { throw new Error('无法打开草稿编辑页，请在公众号窗口进入草稿箱查看'); }
    return { opened: true };
  }
  async function close() {
    if (context) {
      if (meta) await persistCookies();
      await context.close();
    }
    context = null; meta = null; loginPending = false;
  }
  return { login, status, requireLogin, upload, save, openDraft, close };
}

export async function createWebDraft({ html, title, author = '', digest = '', sourceUrl = '', cover }, session, { imageLoader = fetchImage } = {}) {
  if (!title?.trim() || [...title].length > 64) throw new Error('标题需要为 1–64 个字符');
  if ([...author].length > 8) throw new Error('作者最多 8 个字符');
  if ([...digest].length > 120) throw new Error('摘要最多 120 个字符');
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new Error('原文链接需要使用 HTTP 或 HTTPS');
  const $ = load(cleanHtml(html, false), null, false);
  if (!$.text().trim() && !$('img').length) throw new Error('文章内容为空');
  const coverSource = cover || $('img').filter((_i, el) => $(el).attr('data-formula') !== 'true').first().attr('src');
  if (!coverSource) throw new Error('请选择封面图片；公式不会自动用作封面');
  // Preserve external destinations at their original position; never force a link appendix.
  let externalLinks = 0;
  $('a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#')) return;
    let host = '';
    try { host = new URL(href).hostname.toLowerCase(); } catch {}
    if (host === 'weixin.qq.com' || host.endsWith('.weixin.qq.com')) return;
    const replacement = $('<span>').attr('style', $(el).attr('style') || '').append($(el).contents());
    if (!replacement.text().includes(href)) replacement.append($('<span>').text(`（${href}）`));
    $(el).replaceWith(replacement);
    externalLinks++;
  });
  const placeholder = $.html().replace(/src="[^"]*"/g, 'src="https://mmbiz.qpic.cn/placeholder"');
  if (Buffer.byteLength(placeholder) >= 1024 * 1024) throw new Error('排版后的 HTML 超过本工具的 1 MB 大小上限，请精简排版后重试');
  const auth = await session.requireLogin();
  const buffers = new Map();
  const sources = [...new Set($('img').toArray().map(el => $(el).attr('src')))];
  for (const src of new Set([...sources, coverSource])) buffers.set(src, await normalizeImage(await imageLoader(src)));
  const uploaded = new Map();
  for (const [src, buffer] of buffers) uploaded.set(src, await session.upload(auth, buffer));
  $('img').each((_i, el) => $(el).attr('src', uploaded.get($(el).attr('src')).url).removeAttr('data-formula'));
  const content = $.html();
  if (Buffer.byteLength(content) >= 1024 * 1024) throw new Error('图片转存后的 HTML 超过本工具的 1 MB 大小上限；已上传图片可能保留在素材库');
  try {
    const result = await session.save(auth, { title: title.trim(), author, digest, sourceUrl, content }, uploaded.get(coverSource));
    return { mediaId: result.appMsgId, mode: 'web', uploadedImages: sources.length, externalLinks };
  } catch (error) { throw new Error(`${error.message}。请先检查草稿箱再重试，避免重复；已上传图片可能保留在素材库。`); }
}
