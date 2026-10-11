import { readFileSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const keys = ['token', 'appId', 'appSecret'];

export function createCredentialStore(file, env = process.env) {
  let saved = {};
  try { saved = JSON.parse(readFileSync(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('无法读取本机连接配置，请检查 data/connections.json'); }
  if (!saved || typeof saved !== 'object' || keys.some(key => saved[key] !== undefined && typeof saved[key] !== 'string')) throw new Error('本机连接配置格式错误');
  const get = () => ({ token: saved.token || env.NOTION_TOKEN || '', appId: saved.appId || env.WECHAT_APP_ID || '', appSecret: saved.appSecret || env.WECHAT_APP_SECRET || '' });
  const status = () => {
    const credentials = get();
    return { notionConfigured: !!credentials.token, wechatConfigured: !!(credentials.appId && credentials.appSecret), wechatAppIdConfigured: !!credentials.appId, wechatAppSecretConfigured: !!credentials.appSecret };
  };
  return {
    get,
    status,
    save(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('连接配置格式错误');
      const next = {};
      for (const key of keys) {
        if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 4096)) throw new Error('连接配置字段格式错误');
        if (saved[key]) next[key] = saved[key];
        if (input[key]?.trim()) next[key] = input[key].trim();
      }
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
        renameSync(temporary, file);
      } catch {
        throw new Error('连接配置保存失败，请检查本机 data 目录的写入权限');
      } finally { rmSync(temporary, { force: true }); }
      saved = next;
      return status();
    },
  };
}
