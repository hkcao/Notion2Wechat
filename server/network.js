import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}

// Pin the validated DNS result to the connection; validate again on every redirect.
export async function fetchImage(input, redirects = 0, { lookupDns = lookup, get = https.get } = {}) {
  if (typeof input !== 'string') throw new Error('图片地址无效');
  if (input.startsWith('data:')) {
    const match = input.match(/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('仅支持 PNG、JPEG、GIF、WebP 图片');
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 10 * 1024 * 1024) throw new Error('图片不能超过 10 MB');
    return buffer;
  }
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('外部图片需要使用 HTTPS 地址');
  }
  const addresses = await lookupDns(url.hostname.replace(/^\[|\]$/g, ''), { all: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('不能读取本机或内网图片地址');
  }
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const req = get(url, {
      lookup: (_hostname, options, cb) => options.all
        ? cb(null, [address]) : cb(null, address.address, address.family),
      headers: { 'User-Agent': 'InkBridge/0.1' },
      timeout: 15000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 3 || !res.headers.location) return reject(new Error('图片重定向过多'));
        return resolve(fetchImage(new URL(res.headers.location, url).href, redirects + 1, { lookupDns, get }));
      }
      const contentType = res.headers['content-type'] || '';
      if (res.statusCode !== 200 || !/^(?:image\/(?:png|jpeg|gif|webp)|(?:application|binary)\/octet-stream)(?:;|$)/i.test(contentType)) {
        res.resume();
        return reject(new Error(`图片下载失败（HTTP ${res.statusCode}），需要可访问的图片地址`));
      }
      const chunks = [];
      let bytes = 0;
      res.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 10 * 1024 * 1024) req.destroy(new Error('图片不能超过 10 MB'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
        const gif = /^(GIF87a|GIF89a)$/.test(buffer.toString('ascii', 0, 6));
        const webp = buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
        if (!png && !jpeg && !gif && !webp) return reject(new Error('图片格式不受支持或文件内容无效，仅支持 PNG、JPEG、GIF、WebP'));
        resolve(buffer);
      });
    });
    req.on('timeout', () => req.destroy(new Error('图片下载超时')));
    req.on('error', reject);
  });
}

export async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) throw new Error(`远端接口返回 HTTP ${response.status}`);
  return data;
}
