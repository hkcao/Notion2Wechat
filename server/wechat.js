import { load } from 'cheerio';
import { cleanHtml, normalizeImage } from './convert.js';
import { fetchImage, jsonRequest } from './network.js';

const base = 'https://api.weixin.qq.com/cgi-bin';
function check(data, stage = '') {
  if (data.errcode) {
    const errors = { 40164: '请把本机出口 IP 加入公众号开发者 IP 白名单', 40013: 'AppID 无效', 40125: 'AppSecret 无效', 48001: '该账号没有此接口权限，请在公众号后台检查接口权限', 45009: '接口调用超过限额，请稍后重试', 40007: '封面素材 ID 无效，请重新选择封面', 40001: '公众号访问令牌无效，请重试' };
    throw new Error(`微信${stage ? `（${stage}）` : ''}接口 ${data.errcode}：${errors[data.errcode] || data.errmsg || '请求失败'}`);
  }
  return data;
}

export async function createDraft({ html, title, author = '', digest = '', sourceUrl = '', cover, thumbMediaId }, credentials, { request = jsonRequest, imageLoader = fetchImage } = {}) {
  if (!credentials.appId || !credentials.appSecret) throw new Error('请在连接设置或 .env 中配置公众号 AppID 和 AppSecret');
  if (!title?.trim() || [...title].length > 64) throw new Error('标题需要为 1–64 个字符');
  if ([...author].length > 8) throw new Error('作者最多 8 个字符');
  if ([...digest].length > 120) throw new Error('摘要最多 120 个字符');
  if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) throw new Error('原文链接需要使用 HTTP 或 HTTPS');
  const $ = load(cleanHtml(html, false), null, false);
  if (!$.text().trim() && !$('img').length) throw new Error('文章内容为空');
  const coverSource = cover || $('img').filter((_i, el) => $(el).attr('data-formula') !== 'true').first().attr('src');
  if (!thumbMediaId && !coverSource) throw new Error('请选择封面图片，或填写已有的永久封面素材 ID');
  // Preflight all images before creating any remote material.
  const images = new Map();
  for (const el of $('img').toArray()) {
    const src = $(el).attr('src');
    if (!images.has(src)) images.set(src, await normalizeImage(await imageLoader(src)));
  }
  const coverBuffer = thumbMediaId ? null : await normalizeImage(await imageLoader(coverSource));
  const placeholder = $.html().replace(/src="[^"]*"/g, 'src="https://mmbiz.qpic.cn/placeholder"');
  if (Buffer.byteLength(placeholder) >= 1024 * 1024) throw new Error('排版后的 HTML 超过本工具的 1 MB 大小上限，请精简排版后重试');
  const tokenResponse = check(await request(`${base}/stable_token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credential', appid: credentials.appId, secret: credentials.appSecret, force_refresh: false }),
  }));
  const token = tokenResponse.access_token;
  if (!token) throw new Error('微信接口没有返回 access_token');
  const stages = { 'media/uploadimg': '正文图片上传', 'material/add_material': '封面上传', 'draft/add': '草稿保存' };
  const api = async (path, options) => check(await request(`${base}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, options), stages[path.split('?')[0]]);
  const upload = (path, buffer) => {
    const form = new FormData();
    form.append('media', new Blob([buffer], { type: 'image/png' }), 'image.png');
    return api(path, { method: 'POST', body: form });
  };
  const uploaded = new Map();
  for (const [src, buffer] of images) {
    const result = await upload('media/uploadimg', buffer);
    if (!result.url) throw new Error('微信未返回正文图片地址');
    uploaded.set(src, result.url);
  }
  $('img').each((_i, el) => $(el).attr('src', uploaded.get($(el).attr('src'))).removeAttr('data-formula'));
  const content = $.html();
  if (Buffer.byteLength(content) >= 1024 * 1024) throw new Error('图片转存后的 HTML 超过本工具的 1 MB 大小上限；已上传图片可能保留在素材库');
  let mediaId = thumbMediaId;
  if (!mediaId) mediaId = (await upload('material/add_material?type=image', coverBuffer)).media_id;
  if (!mediaId) throw new Error('微信没有返回封面素材 ID');
  try {
    const result = await api('draft/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articles: [{ title: title.trim(), author, digest, content, content_source_url: sourceUrl, thumb_media_id: mediaId, need_open_comment: 0, only_fans_can_comment: 0 }] }),
    });
    if (!result.media_id) throw new Error('微信没有返回草稿 ID');
    return { mediaId: result.media_id, uploadedImages: uploaded.size };
  } catch (error) { throw new Error(`${error.message}。如网络超时，请先检查草稿箱再重试，避免重复；已上传素材可能保留在素材库。`); }
}
