import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fetchImage } from '../server/network.js';

const png = await readFile(new URL('../public/demo-cover.png', import.meta.url));
function response(contentType, body) {
  return {
    lookupDns: async () => [{ address: '8.8.8.8', family: 4 }],
    get: (_url, _options, callback) => {
      const request = new EventEmitter();
      const res = new EventEmitter();
      res.statusCode = 200; res.headers = { 'content-type': contentType };
      res.resume = () => {};
      request.destroy = error => request.emit('error', error);
      queueMicrotask(() => { callback(res); res.emit('data', body); res.emit('end'); });
      return request;
    },
  };
}

test('Notion PNG with generic binary MIME is accepted by its image signature', async () => {
  for (const type of ['binary/octet-stream', 'application/octet-stream', 'image/png']) {
    const result = await fetchImage('https://example.com/notion-image.png', 0, response(type, png));
    assert.deepEqual(result, png);
  }
});

test('generic MIME and spoofed image MIME do not accept HTML or SVG files', async () => {
  for (const type of ['binary/octet-stream', 'image/png']) {
    for (const body of ['<html>not an image</html>', '<svg xmlns="http://www.w3.org/2000/svg"></svg>']) {
      await assert.rejects(fetchImage('https://example.com/file.png', 0, response(type, Buffer.from(body))), /图片格式/);
    }
  }
});
