import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { load } from 'cheerio';
import sharp from 'sharp';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import { escapeHtml } from './notion.js';
import { fetchImage } from './network.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mathDocument = mathjax.document('', {
  InputJax: new TeX({ packages: AllPackages.filter(p => !['require', 'autoload', 'html', 'noerrors', 'noundefined'].includes(p)), maxBuffer: 10000, maxMacros: 1000 }),
  OutputJax: new SVG({ fontCache: 'none' }),
});
const markdown = new Marked({ gfm: true, breaks: true });
markdown.use({ extensions: [
  {
    name: 'blockMath', level: 'block', start: src => src.indexOf('$$'),
    tokenizer(src) { const m = /^\$\$\s*\n?([\s\S]+?)\n?\$\$(?:\n|$)/.exec(src); if (m) return { type: 'blockMath', raw: m[0], tex: m[1].trim() }; },
    renderer: token => `<div data-tex="${escapeHtml(token.tex)}" data-display="true"></div>`,
  },
  {
    name: 'inlineMath', level: 'inline', start: src => src.indexOf('$'),
    tokenizer(src) { const m = /^\$(?!\$)([^\n$]+?)\$(?!\$)/.exec(src); if (m) return { type: 'inlineMath', raw: m[0], tex: m[1] }; },
    renderer: token => `<span data-tex="${escapeHtml(token.tex)}"></span>`,
  },
] });

export function cleanHtml(html, allowMath = true) {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'aside', 'span', 'div', 'section', 'strong', 'b', 'em', 'i', 's', 'del', 'u', 'code', 'pre', 'a', 'img', 'figure', 'figcaption', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'sup', 'sub'],
    allowedAttributes: { '*': ['style'], a: ['href', 'title'], img: ['src', 'alt', 'width', 'height', 'data-formula'], ...(allowMath ? { span: ['style', 'data-tex'], div: ['style', 'data-tex', 'data-display'] } : {}) },
    allowedSchemes: ['https', 'http', 'mailto'], allowedSchemesByTag: { img: ['https', 'data'] }, allowProtocolRelative: false,
    allowedStyles: { '*': {
      'color': [/^#[\da-f]{3,8}$/i, /^rgb\([\d\s,.]+\)$/],
      'background-color': [/^#[\da-f]{3,8}$/i],
      'font-size': [/^\d+(\.\d+)?px$/], 'font-weight': [/^(bold|normal|[1-9]00)$/],
      'font-style': [/^(italic|normal)$/], 'font-family': [/^[\w\s,"'-]+$/],
      'line-height': [/^\d+(\.\d+)?$/], 'letter-spacing': [/^[\d.]+px$/],
      'text-align': [/^(left|center|right|justify)$/], 'text-decoration': [/^(underline|line-through|none)$/],
      'margin': [/^[\d.\s%pxauto-]+$/], 'margin-bottom': [/^[\d.]+px$/],
      'padding': [/^[\d.\s%px]+$/], 'padding-left': [/^[\d.]+px$/],
      'border': [/^[\d.]+px solid #[\da-f]{3,8}$/i], 'border-bottom': [/^[\d.]+px solid #[\da-f]{3,8}$/i],
      'border-left': [/^[\d.]+px solid #[\da-f]{3,8}$/i], 'border-radius': [/^[\d.]+px$/],
      'width': [/^(\d+(\.\d+)?(px|%)|auto)$/], 'max-width': [/^\d+(px|%)$/],
      'height': [/^(\d+(\.\d+)?px|auto)$/], 'display': [/^(block|inline|inline-block)$/],
      'vertical-align': [/^(middle|[\d.-]+px)$/], 'overflow-wrap': [/^anywhere$/],
      'white-space': [/^(pre-wrap|normal)$/], 'border-collapse': [/^collapse$/],
    } },
  });
}

export async function formulaImage(tex, display = false) {
  if (tex.length > 5000) throw new Error('单个公式不能超过 5000 字符');
  const node = mathDocument.convert(tex, { display, em: 16, ex: 8, containerWidth: 375 });
  const svgNode = adaptor.firstChild(node);
  let svg = adaptor.outerHTML(svgNode);
  if (svg.includes('data-mjx-error')) throw new Error('LaTeX 公式无效，请检查语法');
  const viewbox = adaptor.getAttribute(svgNode, 'viewBox').split(/\s+/).map(Number);
  const width = Math.max(1, Math.ceil(viewbox[2] / 1000 * 17));
  const height = Math.max(1, Math.ceil(viewbox[3] / 1000 * 17));
  if (width > 10000 || height > 10000) throw new Error('公式尺寸过大，请拆分公式');
  svg = svg.replace(/width="[^"]*"/, `width="${width * 3}px"`).replace(/height="[^"]*"/, `height="${height * 3}px"`).replaceAll('currentColor', '#272725');
  const png = await sharp(Buffer.from(svg), { limitInputPixels: 40_000_000 }).png().toBuffer();
  return { src: `data:image/png;base64,${png.toString('base64')}`, width, height };
}

export async function normalizeImage(buffer) {
  return sharp(buffer, { limitInputPixels: 40_000_000, animated: false })
    .rotate().resize({ width: 1600, withoutEnlargement: true }).png().toBuffer();
}

export async function convertArticle({ source = 'markdown', markdown: text = '', document, title = '未命名文章', options = {} }, { imageLoader = fetchImage } = {}) {
  const warnings = [...(document?.warnings || [])];
  const rawHtml = source === 'notion' ? document?.rawHtml : markdown.parse(String(text));
  if (!rawHtml) throw new Error('请先导入文章内容');
  const $ = load(cleanHtml(rawHtml), null, false);
  const first = $.root().children().first();
  const hasTitle = /^h[1-4]$/.test(first[0]?.tagName || '') && first.text().trim() === String(title).trim();
  if (hasTitle && options.includeTitle !== true) first.remove();
  const theme = ['ink', 'green', 'blue'].includes(options.theme) ? options.theme : 'ink';
  const accent = { ink: '#743947', green: '#33745e', blue: '#345e86' }[theme];
  const fontSize = Math.min(20, Math.max(14, Number(options.fontSize) || 16));
  const lineHeight = Math.min(2.5, Math.max(1.5, Number(options.lineHeight) || 1.9));
  let formulaCount = 0;
  for (const element of $('[data-tex]').toArray()) {
    const tex = $(element).attr('data-tex');
    const display = $(element).attr('data-display') === 'true';
    try {
      const image = await formulaImage(tex, display);
      $(element).replaceWith(`<${display ? 'p' : 'span'}${display ? ' style="text-align:center;"' : ''}><img data-formula="true" src="${image.src}" alt="${escapeHtml(tex)}" width="${image.width}" height="${image.height}" style="width:${image.width}px;height:auto;max-width:100%;vertical-align:middle;display:${display ? 'inline-block' : 'inline'};"></${display ? 'p' : 'span'}>`);
      formulaCount++;
    } catch (error) { warnings.push(`公式转换失败：${error.message}`); $(element).replaceWith(`<code>${escapeHtml(tex)}</code>`); }
  }
  const imageCache = new Map();
  for (const element of $('img').toArray()) {
    const url = $(element).attr('src');
    if (url?.startsWith('data:')) {
      // Validate data images too; retain already generated formula dimensions.
      try { await sharp(await imageLoader(url), { limitInputPixels: 40_000_000 }).metadata(); }
      catch { $(element).replaceWith('<p>［图片无法解析］</p>'); warnings.push('内嵌图片无法解析，请重新导入'); }
      continue;
    }
    try {
      if (!imageCache.has(url)) imageCache.set(url, `data:image/png;base64,${(await normalizeImage(await imageLoader(url))).toString('base64')}`);
      $(element).attr('src', imageCache.get(url));
    } catch (error) {
      warnings.push(`图片未导入：${error.message}`);
      $(element).replaceWith(`<p style="color:#b34e45;">［图片未导入：${escapeHtml($(element).attr('alt') || '请检查图片地址')}］</p>`);
    }
  }
  const links = [];
  $('a').each((_i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let index = links.indexOf(href);
    if (index === -1) { links.push(href); index = links.length - 1; }
    if (options.footnotes === true) $(el).after(`<sup style="color:${accent};">[${index + 1}]</sup>`);
  });
  if (links.length) warnings.push('超链接已保留；实际可点击范围由公众号账号和编辑器决定，建议保留文末链接');
  if (options.footnotes === true && links.length) {
    $.root().append(`<hr><h3>参考链接</h3>${links.map((url, i) => `<p style="font-size:12px;color:#787774;overflow-wrap:anywhere;">[${i + 1}] <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`).join('')}`);
  }
  const styles = {
    p: 'margin:0 0 18px;',
    h1: `font-size:26px;line-height:1.4;font-weight:700;margin:32px 0 18px;color:${accent};`,
    h2: `font-size:21px;line-height:1.5;font-weight:700;margin:30px 0 16px;padding-left:12px;border-left:3px solid ${accent};`,
    h3: 'font-size:18px;line-height:1.6;font-weight:700;margin:24px 0 12px;',
    h4: 'font-size:17px;font-weight:700;margin:20px 0 12px;',
    blockquote: `margin:20px 0;padding:16px 20px;border-left:3px solid ${accent};background-color:#f5f3ef;color:#666666;`,
    aside: 'margin:20px 0;padding:18px;background-color:#f5f3ef;border-radius:6px;',
    a: `color:${accent};text-decoration:underline;overflow-wrap:anywhere;`,
    pre: 'margin:20px 0;padding:18px;background-color:#f5f3ef;border-radius:6px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.7;',
    code: 'font-family:Menlo,Consolas,monospace;font-size:14px;background-color:#f5f3ef;color:#743947;',
    ul: 'margin:16px 0;padding-left:24px;', ol: 'margin:16px 0;padding-left:24px;', li: 'margin:0 0 8px;',
    figure: 'margin:24px 0;', img: 'max-width:100%;height:auto;display:block;margin:0 auto;border-radius:4px;',
    figcaption: 'font-size:12px;color:#8d8b87;text-align:center;margin:10px 0 0;',
    hr: 'border:0px solid #e5e1d9;border-bottom:1px solid #e5e1d9;margin:28px 0;',
    table: 'width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;',
    th: 'border:1px solid #e5e1d9;padding:10px;background-color:#f5f3ef;font-weight:700;',
    td: 'border:1px solid #e5e1d9;padding:10px;',
  };
  for (const [tag, style] of Object.entries(styles)) $(tag).each((_i, el) => $(el).attr('style', style + ($(el).attr('style') || '')));
  const heading = options.includeTitle !== true || hasTitle ? '' : `<h1 style="font-size:28px;font-weight:700;line-height:1.4;margin:0 0 24px;color:#272725;">${escapeHtml(title)}</h1>`;
  const html = `<section style="font-family:${options.serif ? 'Georgia,Songti SC,SimSun,serif' : 'Arial,PingFang SC,Microsoft YaHei,sans-serif'};font-size:${fontSize}px;line-height:${lineHeight};color:#373735;letter-spacing:0.5px;overflow-wrap:anywhere;">${heading}${$.html()}</section>`;
  const plain = load(html).text();
  return { html, warnings: [...new Set(warnings)], stats: { characters: plain.replace(/\s/g, '').length, images: $('img').length - formulaCount, formulas: formulaCount, links: links.length, readingMinutes: Math.max(1, Math.ceil(plain.length / 450)) } };
}
