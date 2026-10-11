// Adapted from xihe-lab/wechat-mp-mcp-server (Apache-2.0).
// Changed to support cover metadata and safe error messages. See THIRD_PARTY_NOTICES.md.
export const webOrigin = 'https://mp.weixin.qq.com';

export function extractWebMeta(html) {
  const token = html.match(/\bt:\s*["']([^"']+)["']\s*\|\|/)?.[1];
  if (!token) return null;
  return {
    token,
    ticket: html.match(/\bticket:\s*["']([^"']+)["']/)?.[1] || '',
    userName: html.match(/\buser_name:\s*["']([^"']+)["']/)?.[1] || '',
    nickName: html.match(/\bnick_name:\s*["']([^"']+)["']/)?.[1] || '',
    svrTime: Number(html.match(/\btime:\s*["'](\d+)["']/)?.[1] || Math.floor(Date.now() / 1000)),
  };
}

export function checkWebResponse(data, action) {
  const ret = data.ret ?? data.base_resp?.ret;
  if (ret === undefined || ret === null) throw new Error(`${action}未返回有效状态，请在公众号窗口检查登录和验证提示`);
  if (Number(ret) === 0) return data;
  const hints = {
    200003: '登录已过期，请重新扫码登录',
    '-6': '需要验证码，请在公众号窗口完成验证',
    '-8': '需要验证码，请在公众号窗口完成验证',
    '-99': '正文超过公众号网页的字数限制',
    64705: '正文超过公众号网页的字数限制',
    64507: '账号不允许正文中的外部超链接',
    64562: '账号不允许正文中的外部超链接',
    64506: '正文或阅读原文中包含不合法链接',
    412: '正文中包含不被接受的链接',
    220002: '公众号图片库已达到存储上限',
  };
  throw new Error(`${action}失败（${ret}）：${hints[ret] || '请在公众号窗口检查账号提示'}`);
}

export function buildWebDraftForm(meta, article, cover) {
  const fields = {
    token: meta.token, lang: 'zh_CN', f: 'json', ajax: '1', random: String(Math.random()),
    AppMsgId: '', count: '1', data_seq: '0', operate_from: 'Chrome', isnew: '0',
    title0: article.title, author0: article.author || '', writerid0: '0', fileid0: cover.fileId || '',
    digest0: article.digest || '', auto_gen_digest0: article.digest ? '0' : '1',
    content0: article.content, sourceurl0: article.sourceUrl || '',
    need_open_comment0: '0', only_fans_can_comment0: '0',
    cdn_url0: cover.url, cdn_235_1_url0: cover.url, cdn_1_1_url0: cover.url, cdn_url_back0: cover.url,
    show_cover_pic0: '0', can_reward0: '0', is_video_recommend0: '-1',
    copyright_type0: '0', fee0: '0', is_share_copyright0: '0', share_page_type0: '0',
    share_imageinfo0: '{"list":[]}', dot0: '{}', categories_list0: '[]',
  };
  for (const name of ['ad_video_transition', 'related_video', 'crop_list', 'music_id', 'video_id', 'voteid', 'voteismlt', 'supervoteid', 'cardid', 'cardquantity', 'cardlimit', 'vid_type', 'shortvideofileid', 'releasefirst', 'platform', 'reprint_permit_type', 'allow_reprint', 'allow_reprint_modify', 'original_article_type', 'ori_white_list', 'free_content', 'ad_id', 'guide_words', 'share_copyright_url', 'source_article_type', 'reprint_recommend_title', 'reprint_recommend_content', 'share_video_id', 'share_voice_id', 'insert_ad_mode']) fields[`${name}0`] = '';
  return new URLSearchParams(fields);
}
