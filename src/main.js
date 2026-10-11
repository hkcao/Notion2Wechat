import { createIcons, ArrowUpRight, ArrowRight, Link, FileText, Settings2, ChevronDown, Check, Copy, Upload, Download, X, Image, BookOpen, CircleHelp, ExternalLink, PanelLeftClose, RefreshCw, Smartphone, Monitor, CheckCircle2, AlertCircle, LoaderCircle, Plug, Type, Plus, Send } from 'lucide';
import './style.css';
import { demoTitle, demoMarkdown } from './demo.js';

const icons = { ArrowUpRight, ArrowRight, Link, FileText, Settings2, ChevronDown, Check, Copy, Upload, Download, X, Image, BookOpen, CircleHelp, ExternalLink, PanelLeftClose, RefreshCw, Smartphone, Monitor, CheckCircle2, AlertCircle, LoaderCircle, Plug, Type, Plus, Send };
const icon = name => `<i data-lucide="${name}"></i>`;
const state = { source: 'demo', markdown: demoMarkdown, document: null, result: null, revision: 0, renderedRevision: -1, busy: false, status: {}, webStatus: {}, cover: null };
const $ = selector => document.querySelector(selector);
const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

$('#app').innerHTML = `
  <header class="topbar">
    <a class="brand" href="/" aria-label="墨桥首页"><span class="brand-mark">墨</span><span>墨桥<span class="brand-en">INKBRIDGE</span></span></a>
    <nav class="topnav"><span class="nav-active">文章工作台</span><button id="help-nav">使用指南 ${icon('ArrowUpRight')}</button></nav>
    <button class="connection-btn" id="connections"><span class="status-dot"></span>连接设置 ${icon('Settings2')}</button>
  </header>
  <main>
    <section class="page-heading">
      <div><div class="eyebrow">FROM NOTES TO STORIES</div><h1>好内容，值得被好好呈现<span>。</span></h1><p>从 Notion 到公众号，让文字、图片和公式，保持你喜欢的样子。</p></div>
      <span class="workspace-label"><span class="status-dot"></span>本地工作空间</span>
    </section>
    <div class="workspace">
      <aside class="controls">
        <section class="control-section source-section">
          <div class="section-heading"><h2><span class="step">01</span>导入内容</h2><span class="small-tag">SOURCE</span></div>
          <div class="source-tabs" role="tablist"><button id="notion-tab" class="active" role="tab" aria-selected="true"><span class="notion-logo">N</span>Notion 页面</button><button id="markdown-tab" role="tab" aria-selected="false">${icon('FileText')}Markdown</button></div>
          <div id="notion-input"><label for="notion-url">页面链接</label><div class="input-icon">${icon('Link')}<input id="notion-url" type="url" placeholder="粘贴你的 Notion 页面链接" autocomplete="off"></div><button id="import-notion" class="import-btn">导入页面 ${icon('ArrowRight')}</button><p class="field-hint">首次使用需连接 Notion，并授权页面读取权限。</p></div>
          <div id="markdown-input" hidden><label for="markdown">Markdown 内容</label><textarea id="markdown" placeholder="粘贴内容，支持 $行内公式$ 和 $$块公式$$"></textarea><label class="file-button" for="md-file">${icon('Upload')}导入 .md 文件<input id="md-file" type="file" accept=".md,.markdown,.txt" hidden></label><button id="apply-markdown" class="import-btn">更新预览 ${icon('ArrowRight')}</button></div>
          <button id="load-demo" class="demo-link">${icon('BookOpen')}先用示例文章试试看 ${icon('ArrowUpRight')}</button>
        </section>
        <section class="control-section">
          <div class="section-heading"><h2><span class="step">02</span>排版风格</h2><span class="small-tag">STYLE</span></div>
          <label>主题配色</label>
          <div class="theme-list"><button class="theme active" data-theme="ink" aria-pressed="true"><span class="theme-swatch ink"><b>Aa</b><i></i><i></i></span><span>墨色经典</span>${icon('Check')}</button><button class="theme" data-theme="green" aria-pressed="false"><span class="theme-swatch green"><b>Aa</b><i></i><i></i></span><span>森林手记</span>${icon('Check')}</button><button class="theme" data-theme="blue" aria-pressed="false"><span class="theme-swatch blue"><b>Aa</b><i></i><i></i></span><span>海盐蓝调</span>${icon('Check')}</button></div>
          <div class="form-row"><label for="font-family">正文字体</label><select id="font-family"><option value="sans">简洁黑体</option><option value="serif">人文宋体</option></select></div>
          <div class="form-row"><label for="font-size">字号 <span id="font-size-value">16 px</span></label><input id="font-size" type="range" min="14" max="20" value="16"></div>
          <div class="form-row"><label for="line-height">行距 <span id="line-height-value">1.9</span></label><input id="line-height" type="range" min="1.5" max="2.5" step="0.1" value="1.9"></div>
          <label class="toggle-row" for="footnotes"><span>文末保留链接出处<small>避免外链受限时丢失引用</small></span><input id="footnotes" type="checkbox"><span class="toggle"></span></label>
          <label class="toggle-row" for="include-title"><span>正文包含文章标题</span><input id="include-title" type="checkbox"><span class="toggle"></span></label>
        </section>
        <div class="sidebar-note">${icon('CircleHelp')}<p>排版已适配公众号。多列、嵌入等特殊内容会转换为适合手机阅读的形式。</p></div>
      </aside>
      <section class="preview-panel">
        <div class="preview-toolbar"><div class="preview-title">文章预览 <span id="source-badge">示例文章</span></div><div class="view-switch"><button id="mobile-view" class="active" aria-label="手机预览">${icon('Smartphone')}</button><button id="desktop-view" aria-label="宽屏预览">${icon('Monitor')}</button></div><button id="refresh" class="icon-btn" aria-label="刷新预览">${icon('RefreshCw')}</button></div>
        <div class="document-meta"><input id="article-title" value="${demoTitle}" aria-label="文章标题" maxlength="64"><div><span id="article-stats">正在准备示例文章…</span><span id="render-status">${icon('LoaderCircle')}排版中</span></div></div>
        <div class="preview-surface"><div class="paper"><div class="paper-topline"><span>ARTICLE PREVIEW</span><span>墨桥 · 排版预览</span></div><iframe id="preview" title="公众号文章预览" sandbox="allow-same-origin" referrerpolicy="no-referrer"></iframe><div class="paper-end"><span></span><b>完</b><span></span></div></div></div>
        <div class="preview-bottom"><span>${icon('CheckCircle2')}内联样式 · 高清公式 · 图片转存</span><button id="show-checks">转换检查 <span id="warning-count">0</span>${icon('ChevronDown')}</button></div>
      </section>
    </div>
    <section class="export-bar"><div class="export-caption"><span class="export-icon">${icon('Send')}</span><div><strong>准备好与读者见面了吗？</strong><p>上传图片和公式，将排版好的文章送到公众号草稿箱。</p></div></div><div class="export-actions"><button id="download" class="icon-btn" aria-label="下载 HTML" title="下载 HTML">${icon('Download')}</button><button id="copy" class="secondary">${icon('Copy')}复制排版</button><button id="draft" class="primary">${icon('Send')}同步到草稿箱 ${icon('ArrowUpRight')}</button></div></section>
    <footer><span>墨桥，让灵感自然抵达。</span><span>NOTION ${icon('ArrowRight')} WECHAT <b>·</b> v0.1.0</span></footer>
  </main>
  <dialog id="connection-dialog"><form method="dialog" class="dialog-head"><div><span class="eyebrow">CONNECTIONS</span><h2>连接你的创作空间</h2></div><button class="icon-btn" aria-label="关闭">${icon('X')}</button></form><div class="dialog-body"><div class="connection-title"><span class="notion-logo">N</span><h3>Notion</h3><span id="notion-env" class="small-tag"></span></div><label for="notion-token">Integration Token</label><input id="notion-token" type="password" autocomplete="off" placeholder="ntn_… 或 secret_…"><p class="field-hint">创建读取内容的 Integration，并在页面右上角「连接」中添加它。<a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">管理 Integration ↗</a></p><div class="connection-title"><span class="wechat-logo">微</span><h3>微信公众号</h3><span id="wechat-env" class="small-tag"></span></div><label for="sync-mode">公众号同步方式</label><select id="sync-mode"><option value="web">网页登录同步（推荐）</option><option value="api">官方 API 同步</option></select><div id="wechat-web-settings"><p class="field-hint">打开专用 Chrome 窗口，使用当前公众号管理员微信扫码并确认登录。登录状态保存在本机，过期后重新扫码。</p><p id="wechat-web-status" class="field-hint" role="status">尚未登录</p><button id="wechat-web-login" class="secondary full" type="button">打开公众号登录窗口</button><button id="wechat-web-refresh" class="demo-link" type="button">刷新登录状态</button></div><div id="wechat-api-settings" hidden><label for="wechat-appid">AppID</label><input id="wechat-appid" autocomplete="off" placeholder="wx…"><label for="wechat-secret">AppSecret</label><input id="wechat-secret" type="password" autocomplete="off" placeholder="公众号开发者密钥"><p class="field-hint">进入微信开发者平台 → 我的业务与服务（或我的业务）→ 公众号／服务号 → 选择账号 → 基础信息，查看 AppID 和开发密钥（AppSecret），配置 API IP 白名单。<a href="https://developers.weixin.qq.com/platform/" target="_blank" rel="noreferrer">打开微信开发者平台 ↗</a> 已接入其他系统时，重置 AppSecret 会使旧密钥失效。</p></div><div class="info-box">${icon('Plug')}<span>点击保存后，凭据会写入本机配置文件，刷新或重启后仍可使用。留空保留已有值，密钥不会回显。</span></div><button id="save-connections" class="primary full">保存连接 ${icon('Check')}</button></div></dialog>
  <dialog id="draft-dialog"><form method="dialog" class="dialog-head"><div><span class="eyebrow">READY TO SEND</span><h2>同步到公众号草稿箱</h2></div><button class="icon-btn" aria-label="关闭">${icon('X')}</button></form><div class="dialog-body"><div id="draft-summary" class="draft-summary"></div><div class="two-cols"><div><label for="author">作者</label><input id="author" maxlength="8" placeholder="选填，最多 8 字"></div><div id="thumb-id-field" hidden><label for="thumb-id">已有封面素材 ID</label><input id="thumb-id" placeholder="选填，优先使用此素材"></div></div><label for="digest">文章摘要</label><textarea id="digest" maxlength="120" placeholder="选填，最多 120 字"></textarea><label>文章封面</label><label class="cover-upload" for="cover-file"><div id="cover-preview">${icon('Image')}<strong>点击选择封面图片</strong><span>PNG / JPG / WebP · 最大 10 MB</span></div><input id="cover-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label><p class="field-hint" id="cover-hint">未选择时，将使用正文第一张图片。建议上传独立封面。</p><label for="source-url">阅读原文链接</label><input id="source-url" type="url" placeholder="https://…（选填）"><div class="info-box">${icon('CircleHelp')}<span>将上传素材并创建一篇草稿，可在公众号后台继续编辑。重试前请先检查草稿箱，避免重复。</span></div><p id="draft-error" class="inline-error" role="alert" hidden></p><button id="confirm-draft" class="primary full">${icon('Send')}同步到草稿箱</button></div></dialog>
  <dialog id="checks-dialog"><form method="dialog" class="dialog-head"><div><span class="eyebrow">CONVERSION REPORT</span><h2>转换检查</h2></div><button class="icon-btn" aria-label="关闭">${icon('X')}</button></form><div class="dialog-body" id="checks-content"></div></dialog>
  <dialog id="help-dialog"><form method="dialog" class="dialog-head"><div><span class="eyebrow">QUICK START</span><h2>从笔记到草稿，三步完成</h2></div><button class="icon-btn" aria-label="关闭">${icon('X')}</button></form><div class="dialog-body help-body"><p><b>01 连接与导入</b>在连接设置中填写 Notion Token，授权需要导出的页面，然后粘贴页面链接。也可导入 Markdown。</p><p><b>02 调整与检查</b>选择主题、字号和行距，查看手机预览与转换检查。图片和 LaTeX 公式会转换为可上传的 PNG。</p><p><b>03 同步到草稿箱</b>在连接设置选择「网页登录同步」，打开公众号登录窗口并扫码。选择封面，点击同步，随后在同一窗口检查草稿。登录状态保存在本机；也可选择已配置的官方 API 模式。</p><p class="field-hint">公众号会处理 HTML 样式和外链，因此无法保证与 Notion 像素级一致。建议在后台预览最终效果。复制模式下图片是否保留取决于编辑器；草稿同步会转存所有图片。</p></div></dialog>
  <div id="toast" role="status" aria-live="polite"></div>
`;
function refreshIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.7 } }); }
refreshIcons();
function toast(message, error = false) { $('#toast').textContent = message; $('#toast').className = `visible${error ? ' error' : ''}`; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').className = '', 4500); }
async function api(url, body) {
  const response = await fetch(url, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败');
  return data;
}
function options() { return { theme: $('.theme.active').dataset.theme, serif: $('#font-family').value === 'serif', fontSize: Number($('#font-size').value), lineHeight: Number($('#line-height').value), footnotes: $('#footnotes').checked, includeTitle: $('#include-title').checked }; }
function setBusy(busy) { state.busy = busy; for (const id of ['copy', 'draft', 'download', 'import-notion', 'apply-markdown', 'refresh']) $(`#${id}`).disabled = busy; }
function dirty() { state.revision++; $('#render-status').innerHTML = `${icon('RefreshCw')}更新中`; refreshIcons(); clearTimeout(dirty.timer); dirty.timer = setTimeout(() => render().catch(e => toast(e.message, true)), 350); }
async function render() {
  const revision = state.revision;
  setBusy(true);
  $('#render-status').innerHTML = `${icon('LoaderCircle')}排版中`; refreshIcons();
  try {
    let document = state.document;
    if (state.source === 'demo' || state.markdown.includes('](/demo-cover.png)')) {
      if (!state.demoDocument) {
        const blob = await (await fetch('/demo-cover.png')).blob();
        const base64 = await fileData(blob);
        state.demoImage = base64;
        state.demoDocument = demoMarkdown.replace('/demo-cover.png', base64);
      }
    }
    const markdownContent = state.source === 'demo' ? state.demoDocument : state.markdown.replaceAll('](/demo-cover.png)', `](${state.demoImage})`);
    const result = await api('/api/convert', { source: state.source === 'notion' ? 'notion' : 'markdown', markdown: markdownContent, document, title: $('#article-title').value, options: options() });
    if (revision !== state.revision) return;
    state.result = result; state.renderedRevision = revision;
    // Cache embedded Notion images so expiring URLs and theme changes do not cause refetches.
    if (state.source === 'notion' && state.document && !state.document.imagesEmbedded) {
      const imported = new DOMParser().parseFromString(state.document.rawHtml, 'text/html');
      const converted = new DOMParser().parseFromString(result.html, 'text/html');
      const images = [...converted.querySelectorAll('figure img')];
      const originals = [...imported.querySelectorAll('figure img')];
      if (images.length === originals.length) {
        originals.forEach((img, index) => img.setAttribute('src', images[index].getAttribute('src')));
        state.document.rawHtml = imported.body.innerHTML; state.document.imagesEmbedded = true;
      }
    }
    $('#preview').srcdoc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{margin:0;padding:0 28px;background:white}img{max-width:100%}table{table-layout:fixed}td,th{overflow-wrap:anywhere}a{pointer-events:none}</style></head><body>${result.html}</body></html>`;
    const s = result.stats;
    $('#article-stats').textContent = `${s.characters.toLocaleString()} 字 · ${s.images} 张图片 · ${s.formulas} 个公式 · 约 ${s.readingMinutes} 分钟`;
    $('#render-status').innerHTML = `${icon('CheckCircle2')}已排版`;
    $('#warning-count').textContent = result.warnings.length;
    $('#source-badge').textContent = { demo: '示例文章', notion: 'Notion 已导入', markdown: 'Markdown' }[state.source];
    refreshIcons();
  } catch (error) { if (revision === state.revision) { state.result = null; $('#render-status').innerHTML = `${icon('AlertCircle')}排版失败`; refreshIcons(); } throw error; }
  finally { if (revision === state.revision) setBusy(false); }
}
$('#preview').addEventListener('load', () => {
  const frame = $('#preview');
  const resize = () => frame.style.height = `${Math.max(400, frame.contentDocument.body.scrollHeight + 20)}px`;
  resize();
  for (const image of frame.contentDocument.images) image.addEventListener('load', resize);
  state.observer?.disconnect(); state.observer = new ResizeObserver(resize); state.observer.observe(frame.contentDocument.body);
});
function showSource(tab) { const md = tab === 'markdown'; $('#notion-input').hidden = md; $('#markdown-input').hidden = !md; for (const name of ['notion', 'markdown']) { $(`#${name}-tab`).classList.toggle('active', name === tab); $(`#${name}-tab`).setAttribute('aria-selected', String(name === tab)); } }
$('#notion-tab').onclick = () => showSource('notion');
$('#markdown-tab').onclick = () => { showSource('markdown'); if (!$('#markdown').value && state.source === 'demo') $('#markdown').value = demoMarkdown; };
$('#import-notion').onclick = async () => {
  if (!$('#notion-url').value.trim()) return toast('请先粘贴 Notion 页面链接', true);
  setBusy(true); $('#import-notion').textContent = '正在读取页面…';
  try {
    const imported = await api('/api/notion', { url: $('#notion-url').value });
    state.document = imported; state.source = 'notion'; state.markdownDirty = false; $('#article-title').value = imported.title; $('#source-url').value = imported.sourceUrl;
    state.revision++; await render(); toast('Notion 页面已导入');
  } catch (error) { toast(error.message, true); }
  finally { setBusy(false); $('#import-notion').innerHTML = `导入页面 ${icon('ArrowRight')}`; refreshIcons(); }
};
$('#apply-markdown').onclick = async () => {
  if (!$('#markdown').value.trim()) return toast('请先粘贴 Markdown 内容', true);
  state.markdown = $('#markdown').value; state.markdownDirty = false; state.source = 'markdown'; state.document = null; $('#source-url').value = '';
  const heading = state.markdown.match(/^#\s+(.+)$/m);
  if (heading) { $('#article-title').value = heading[1]; state.markdown = state.markdown.replace(/^#\s+(.+)\r?\n?/m, ''); }
  state.revision++; try { await render(); toast('文章预览已更新'); } catch (e) { toast(e.message, true); }
};
$('#md-file').onchange = async event => { const file = event.target.files[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) return toast('Markdown 文件不能超过 2 MB', true); $('#markdown').value = await file.text(); $('#apply-markdown').click(); event.target.value = ''; };
$('#markdown').oninput = () => { state.markdownDirty = true; $('#render-status').innerHTML = `${icon('RefreshCw')}请更新预览`; refreshIcons(); };
$('#load-demo').onclick = () => { state.source = 'demo'; state.markdownDirty = false; state.document = null; $('#article-title').value = demoTitle; $('#source-url').value = ''; state.revision++; render().catch(e => toast(e.message, true)); };
for (const theme of document.querySelectorAll('.theme')) theme.onclick = () => { for (const el of document.querySelectorAll('.theme')) { el.classList.toggle('active', el === theme); el.setAttribute('aria-pressed', String(el === theme)); } dirty(); };
for (const selector of ['#font-family', '#font-size', '#line-height', '#footnotes', '#include-title', '#article-title']) $(selector).addEventListener('input', () => { $('#font-size-value').textContent = `${$('#font-size').value} px`; $('#line-height-value').textContent = $('#line-height').value; dirty(); });
$('#refresh').onclick = () => render().catch(e => toast(e.message, true));
$('#mobile-view').onclick = () => { $('.paper').classList.remove('wide'); $('#mobile-view').classList.add('active'); $('#desktop-view').classList.remove('active'); };
$('#desktop-view').onclick = () => { $('.paper').classList.add('wide'); $('#mobile-view').classList.remove('active'); $('#desktop-view').classList.add('active'); };
for (const [button, dialog] of [['connections', 'connection-dialog'], ['help-nav', 'help-dialog'], ['show-checks', 'checks-dialog']]) $(`#${button}`).onclick = () => {
  if (dialog === 'checks-dialog') $('#checks-content').innerHTML = state.result ? `<div class="report-success">${icon('CheckCircle2')}转换完成 · ${state.result.stats.formulas} 个公式已生成图片</div>${state.result.warnings.map(w => `<p class="report-warning">${icon('AlertCircle')}<span>${escape(w)}</span></p>`).join('') || '<p>没有发现需要调整的内容。</p>'}` : '<p>请先导入内容并生成预览。</p>';
  $(`#${dialog}`).showModal(); refreshIcons();
};
$('#save-connections').onclick = async () => {
  const button = $('#save-connections'); button.disabled = true;
  try {
    state.status = await api('/api/connections', { token: $('#notion-token').value.trim(), appId: $('#wechat-appid').value.trim(), appSecret: $('#wechat-secret').value.trim() });
    for (const selector of ['#notion-token', '#wechat-appid', '#wechat-secret']) $(selector).value = '';
    updateConnectionStatus(); $('#connection-dialog').close(); toast('连接设置已保存到本机；接口将在导入或同步时验证');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
};
function updateConnectionStatus() {
  $('#notion-env').textContent = state.status.notionConfigured ? '已配置' : '未配置';
  const web = $('#sync-mode').value === 'web';
  $('#wechat-env').textContent = web ? (state.webStatus.loggedIn ? '网页已登录' : '网页未登录') : (state.status.wechatConfigured ? 'API 已配置' : 'API 未配置');
  $('#wechat-web-settings').hidden = !web; $('#wechat-api-settings').hidden = web; $('#thumb-id-field').hidden = web;
  $('#wechat-web-status').textContent = state.webStatus.loggedIn ? `已登录${state.webStatus.nickName ? ` · ${state.webStatus.nickName}` : ''}` : (state.webStatus.browserOpen ? '请在公众号窗口扫码并确认登录；完成后会自动更新。' : '尚未登录。点击下方按钮打开扫码窗口，已有登录会自动恢复。');
  for (const [selector, configured, placeholder] of [['#notion-token', state.status.notionConfigured, 'ntn_… 或 secret_…'], ['#wechat-appid', state.status.wechatAppIdConfigured, 'wx…'], ['#wechat-secret', state.status.wechatAppSecretConfigured, '公众号开发者密钥']]) $(selector).placeholder = configured ? '已配置，留空保留；填写新值以更新' : placeholder;
  $('.connection-btn .status-dot').classList.toggle('connected', !!(web ? state.webStatus.loggedIn : state.status.wechatConfigured));
}
$('#sync-mode').onchange = updateConnectionStatus;
async function refreshWebStatus() {
  state.webStatus = await api('/api/wechat/web/status'); updateConnectionStatus(); return state.webStatus;
}
let webPollTimer;
function pollWebLogin(deadline) {
  clearTimeout(webPollTimer);
  webPollTimer = setTimeout(async () => {
    try {
      const status = await refreshWebStatus();
      if (status.loggedIn) return toast('公众号网页登录成功，可以同步草稿了');
      if (status.browserOpen && Date.now() < deadline) pollWebLogin(deadline);
    } catch (error) { toast(error.message, true); }
  }, 2000);
}
$('#wechat-web-login').onclick = async () => {
  const button = $('#wechat-web-login'); button.disabled = true; button.textContent = '正在打开公众号窗口…';
  try {
    state.webStatus = await api('/api/wechat/web/login', {}); updateConnectionStatus();
    if (state.webStatus.loggedIn) toast('已恢复本机公众号登录，可以同步草稿了');
    else { toast('请在新打开的公众号窗口扫码并确认登录'); pollWebLogin(Date.now() + 5 * 60 * 1000); }
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = '打开公众号登录窗口'; }
};
$('#wechat-web-refresh').onclick = () => refreshWebStatus().catch(error => toast(error.message, true));
refreshWebStatus().catch(error => toast(error.message, true));
function currentResult() { if (state.markdownDirty) { toast('Markdown 已修改，请先点击「更新预览」', true); return false; } if (!state.result || state.renderedRevision !== state.revision) { toast('请等待当前排版完成', true); return false; } return true; }
$('#copy').onclick = async () => {
  if (!currentResult()) return;
  try {
    const html = state.result.html;
    const plain = new DOMParser().parseFromString(html, 'text/html').body.textContent;
    if (navigator.clipboard?.write && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
    else { const div = document.createElement('div'); div.innerHTML = html; div.contentEditable = 'true'; div.style.cssText = 'position:fixed;left:-10000px'; document.body.append(div); const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(div); selection.removeAllRanges(); selection.addRange(range); const ok = document.execCommand('copy'); selection.removeAllRanges(); div.remove(); if (!ok) throw new Error('浏览器不允许复制，请下载 HTML 或同步草稿'); }
    toast('排版已复制；粘贴后请检查图片，推荐使用草稿同步');
  } catch (e) { toast(`复制失败：${e.message}`, true); }
};
$('#download').onclick = () => { if (!currentResult()) return; const blob = new Blob([`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escape($('#article-title').value)}</title><body style="max-width:680px;margin:40px auto;padding:24px;">${state.result.html}</body></html>`], { type: 'text/html' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${$('#article-title').value.replace(/[\\/:*?"<>|]/g, '_') || '文章'}.html`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('#draft').onclick = async () => {
  if (!currentResult()) return;
  const web = $('#sync-mode').value === 'web';
  if (web) {
    try { await refreshWebStatus(); } catch (error) { return toast(error.message, true); }
    if (!state.webStatus.loggedIn) { $('#connection-dialog').showModal(); return toast('请打开公众号登录窗口，扫码或恢复本机登录'); }
  } else if (!state.status.wechatConfigured) { $('#connection-dialog').showModal(); return toast('请先配置公众号 AppID 和 AppSecret'); }
  $('#draft-summary').textContent = `${$('#article-title').value} · ${web ? '网页登录同步' : '官方 API 同步'}`;
  $('#draft-error').hidden = true;
  $('#draft-dialog').showModal();
};
function fileData(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
$('#cover-file').onchange = async event => { const file = event.target.files[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { event.target.value = ''; return toast('封面不能超过 10 MB', true); } state.cover = await fileData(file); $('#cover-preview').innerHTML = `<img src="${state.cover}" alt="封面预览"><span>${escape(file.name)} · 点击更换</span>`; };
$('#confirm-draft').onclick = async () => {
  if (!currentResult()) return;
  setBusy(true);
  const button = $('#confirm-draft'); button.disabled = true; button.innerHTML = `${icon('LoaderCircle')}正在上传图片并同步…`; refreshIcons(); $('#draft-error').hidden = true;
  try {
    const result = await api($('#sync-mode').value === 'web' ? '/api/wechat/web/draft' : '/api/wechat/draft', { html: state.result.html, title: $('#article-title').value, author: $('#author').value, digest: $('#digest').value, sourceUrl: $('#source-url').value, cover: state.cover, thumbMediaId: $('#thumb-id').value.trim() });
    $('#draft-dialog').close(); toast('已同步到公众号草稿箱');
    $('#checks-content').innerHTML = `<div class="report-success">${icon('CheckCircle2')}草稿创建成功</div><p>已上传 ${result.uploadedImages} 张正文图片（包含公式）。</p><p class="field-hint">草稿 ID：${escape(result.mediaId)}</p>${result.externalLinks ? `<p class="field-hint">${result.externalLinks} 处外部链接已转为文字，原网址保留在原位置；微信文章链接继续保留。</p>` : ''}${result.mode === 'web' ? `<button id="open-web-draft" class="primary full">在公众号窗口查看草稿 ${icon('ExternalLink')}</button>` : `<a class="primary full" href="https://mp.weixin.qq.com/" target="_blank" rel="noreferrer">打开公众号后台 ${icon('ExternalLink')}</a>`}`; $('#checks-dialog').showModal();
    if (result.mode === 'web') $('#open-web-draft').onclick = async () => {
      const open = $('#open-web-draft'); open.disabled = true;
      try { await api('/api/wechat/web/open-draft', { mediaId: result.mediaId }); } catch (error) { toast(error.message, true); } finally { open.disabled = false; }
    };
  } catch (e) { $('#draft-error').textContent = e.message; $('#draft-error').hidden = false; }
  finally { setBusy(false); button.disabled = false; button.innerHTML = `${icon('Send')}同步到草稿箱`; refreshIcons(); }
};
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog && !$('#confirm-draft').disabled) dialog.close(); });
api('/api/status').then(status => { state.status = status; updateConnectionStatus(); }).catch(e => toast(e.message, true));
render().catch(e => toast(e.message, true));
