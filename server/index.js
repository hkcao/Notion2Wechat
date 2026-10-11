import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importNotion } from './notion.js';
import { convertArticle } from './convert.js';
import { createDraft } from './wechat.js';
import { createCredentialStore } from './credentials.js';
import { createWebDraft, createWebSession } from './wechat-web.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const connections = createCredentialStore(path.join(root, 'data', 'connections.json'));
const webSession = createWebSession(path.join(root, 'data', 'wechat-browser'));
const app = express();
const port = Number(process.env.PORT) || 3210;
const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
app.disable('x-powered-by');
app.use((req, res, next) => {
  const host = req.headers.host;
  if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(host)) return res.status(403).json({ error: '仅允许本机访问' });
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers.origin && !origins.has(req.headers.origin)) return res.status(403).json({ error: '不允许跨站请求' });
    if (req.method === 'POST' && (!origins.has(req.headers.origin) || !req.is('application/json'))) return res.status(403).json({ error: '请从工具页面发起请求' });
  }
  next();
});
app.use(express.json({ limit: '30mb' }));
app.get('/api/status', (_req, res) => res.json({ ...connections.status(), version: '0.1.0' }));
app.post('/api/connections', (req, res) => res.json(connections.save(req.body)));
app.post('/api/notion', async (req, res) => res.json(await importNotion(req.body.url, req.body.token || connections.get().token)));
app.post('/api/convert', async (req, res) => {
  if (!['markdown', 'notion'].includes(req.body.source)) return res.status(400).json({ error: '不支持的内容来源' });
  res.json(await convertArticle(req.body));
});
app.get('/api/wechat/web/status', async (_req, res) => res.json(await webSession.status()));
app.post('/api/wechat/web/login', async (_req, res) => res.json(await webSession.login()));
app.post('/api/wechat/web/open-draft', async (req, res) => res.json(await webSession.openDraft(req.body.mediaId)));
// Serialize writes so a double-click cannot create concurrent drafts.
let syncing = false;
app.post('/api/wechat/web/draft', async (req, res, next) => {
  if (syncing) return res.status(409).json({ error: '草稿正在同步，请等待完成' });
  syncing = true;
  try { res.json(await createWebDraft(req.body, webSession)); }
  catch (error) { next(error); }
  finally { syncing = false; }
});
app.post('/api/wechat/draft', async (req, res, next) => {
  if (syncing) return res.status(409).json({ error: '草稿正在同步，请等待完成' });
  syncing = true;
  try { res.json(await createDraft(req.body, { appId: req.body.credentials?.appId || connections.get().appId, appSecret: req.body.credentials?.appSecret || connections.get().appSecret })); }
  catch (error) { next(error); }
  finally { syncing = false; }
});
app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
if (process.argv.includes('--production')) app.use(express.static(path.join(root, 'dist')));
else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true, hmr: false, allowedHosts: ['localhost', '127.0.0.1'], fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**'] } }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use((error, _req, res, _next) => {
  const message = error.type === 'entity.too.large' ? '文章或图片总量过大，请拆分后导入' : error.message;
  res.status(400).json({ error: message || '请求失败，请重试' });
});
const server = app.listen(port, '127.0.0.1', () => console.log(`墨桥已启动：http://localhost:${port}`));
process.once('SIGINT', async () => {
  await webSession.close().catch(() => {});
  server.close(() => process.exit(0));
});
