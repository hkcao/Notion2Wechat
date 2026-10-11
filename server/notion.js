import { jsonRequest } from './network.js';

export const escapeHtml = (text = '') => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colors = { gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#b99518', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };

export function colorStyle(color) {
  if (!color || color === 'default') return '';
  if (color.endsWith('_background')) return `background-color:${colors[color.replace('_background', '')] || '#787774'}22;`;
  return `color:${colors[color] || '#333333'};`;
}

export function richText(parts = []) {
  return parts.map(part => {
    if (part.type === 'equation') return `<span data-tex="${escapeHtml(part.equation.expression)}"></span>`;
    let html = escapeHtml(part.plain_text ?? part.text?.content ?? '').replace(/\n/g, '<br>');
    const a = part.annotations || {};
    if (a.code) html = `<code>${html}</code>`;
    if (a.bold) html = `<strong>${html}</strong>`;
    if (a.italic) html = `<em>${html}</em>`;
    if (a.strikethrough) html = `<s>${html}</s>`;
    if (a.underline) html = `<u>${html}</u>`;
    if (a.color && a.color !== 'default') html = `<span style="${colorStyle(a.color)}">${html}</span>`;
    const href = part.href || part.text?.link?.url;
    if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
    return html;
  }).join('');
}

export function pageId(input) {
  const value = String(input || '').trim();
  let path = value;
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (!/(^|\.)notion\.(so|site|com)$/.test(url.hostname)) throw new Error('请粘贴 Notion 页面链接或页面 ID');
    path = url.pathname;
  }
  const matches = path.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-f0-9]{32}/gi);
  if (!matches) throw new Error('没有找到页面 ID，请复制 Notion 页面完整链接');
  return matches.at(-1).replace(/-/g, '');
}

export function blocksToHtml(blocks, warnings = []) {
  let html = '';
  let listType = '';
  const closeList = () => { if (listType) { html += `</${listType}>`; listType = ''; } };
  for (const block of blocks) {
    const type = block.type;
    const data = block[type] || {};
    const content = richText(data.rich_text);
    const children = () => blocksToHtml(block.children || [], warnings);
    const style = colorStyle(data.color);
    if (['bulleted_list_item', 'numbered_list_item'].includes(type)) {
      const next = type === 'bulleted_list_item' ? 'ul' : 'ol';
      if (next !== listType) { closeList(); listType = next; html += `<${next}>`; }
      html += `<li style="${style}">${content}${children()}</li>`;
      continue;
    }
    closeList();
    if (/^heading_[1-4]$/.test(type)) html += `<h${type.at(-1)} style="${style}">${content}</h${type.at(-1)}>${children()}`;
    else if (type === 'paragraph') html += `<p style="${style}">${content || '<br>'}</p>${children()}`;
    else if (type === 'quote') html += `<blockquote style="${style}">${content}${children()}</blockquote>`;
    else if (type === 'callout') html += `<aside style="${style}"><span>${escapeHtml(data.icon?.emoji || '💡')} </span>${content}${children()}</aside>`;
    else if (type === 'to_do') html += `<p style="${style}">${data.checked ? '☑' : '☐'} ${content}</p>${children()}`;
    else if (type === 'toggle') { warnings.push('折叠块已展开显示'); html += `<p style="${style}"><strong>${content}</strong></p>${children()}`; }
    else if (type === 'code') html += `<pre><code>${escapeHtml((data.rich_text || []).map(t => t.plain_text ?? t.text?.content ?? '').join(''))}</code></pre>`;
    else if (type === 'equation') html += `<div data-tex="${escapeHtml(data.expression)}" data-display="true"></div>`;
    else if (type === 'image') html += `<figure><img src="${escapeHtml(data[data.type]?.url)}" alt="${escapeHtml((data.caption || []).map(t => t.plain_text ?? t.text?.content ?? '').join(''))}"><figcaption>${richText(data.caption)}</figcaption></figure>`;
    else if (type === 'divider') html += '<hr>';
    else if (type === 'table') html += `<table>${(block.children || []).map((row, i) => `<tr>${(row.table_row?.cells || []).map(cell => `<${i === 0 && data.has_column_header ? 'th' : 'td'}>${richText(cell)}</${i === 0 && data.has_column_header ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
    else if (['column_list', 'column', 'synced_block'].includes(type)) {
      if (type === 'column_list') warnings.push('多列布局已转为从左到右的单列，适合手机阅读');
      html += children();
    } else if (['bookmark', 'link_preview', 'embed', 'file', 'pdf', 'audio', 'video'].includes(type)) {
      const url = data.url || data[data.type]?.url;
      if (url) html += `<p><a href="${escapeHtml(url)}">${richText(data.caption) || escapeHtml(data.name || url)}</a></p>`;
      warnings.push(`${type} 已转为链接，公众号不支持直接嵌入`);
    } else if (type === 'child_page') html += `<p><a href="https://www.notion.so/${block.id.replace(/-/g, '')}">${escapeHtml(data.title)}</a></p>`;
    else { warnings.push(`尚未支持的 Notion 块：${type}，请对照原文检查`); html += children(); }
  }
  closeList();
  return html;
}

export async function importNotion(input, token, request = jsonRequest) {
  if (!token) throw new Error('请在连接设置中填写 Notion Token，或在 .env 配置 NOTION_TOKEN');
  const id = pageId(input);
  const headers = { Authorization: `Bearer ${token}`, 'Notion-Version': '2026-03-11' };
  let count = 0;
  const api = async path => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await request(`https://api.notion.com/v1/${path}`, { headers });
        if (data.object === 'error') throw new Error(data.code);
        return data;
      } catch (error) {
        if (error.message.includes('429') && attempt < 2) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
        if (/401|unauthorized/.test(error.message)) throw new Error('Notion Token 无效，请检查连接设置');
        if (/403|restricted_resource/.test(error.message)) throw new Error('Notion 返回 403：请求被拒绝，请在 Integration 设置中检查「读取内容（Read content）」权限');
        if (/404|object_not_found/.test(error.message)) throw new Error('Notion 返回 404：页面或内容块不存在，或此 Token 无法访问。请确认页面「连接」与工具保存的 Token 来自同一个 Integration、页面属于该 Integration 的工作空间，并重新复制目标页面链接');
        throw error;
      }
    }
  };
  async function children(blockId, depth = 0, ancestors = new Set()) {
    if (depth > 20 || ancestors.has(blockId)) throw new Error('页面嵌套过深或同步块循环，请简化后重试');
    const chain = new Set(ancestors).add(blockId);
    const blocks = [];
    let cursor;
    do {
      const response = await api(`blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const block of response.results) {
        if (++count > 3000) throw new Error('页面超过 3000 个块，请拆分文章');
        if (block.has_children || block.synced_block?.synced_from) {
          block.children = await children(block.synced_block?.synced_from?.block_id || block.id, depth + 1, chain);
        }
        blocks.push(block);
      }
      cursor = response.has_more ? response.next_cursor : null;
      if (response.has_more && !cursor) throw new Error('Notion 分页响应不完整，请重试');
    } while (cursor);
    return blocks;
  }
  const page = await api(`pages/${id}`);
  const blocks = await children(id);
  const title = Object.values(page.properties || {}).find(p => p.type === 'title')?.title?.map(t => t.plain_text ?? t.text?.content ?? '').join('') || '未命名文章';
  const warnings = [];
  return { title, rawHtml: blocksToHtml(blocks, warnings), warnings: [...new Set(warnings)], sourceUrl: page.url || `https://www.notion.so/${id}`, blockCount: count };
}
