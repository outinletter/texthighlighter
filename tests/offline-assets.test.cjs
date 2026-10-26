const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const source = readFileSync(require.resolve('../sw.js'), 'utf8');

test('pre-caches the exact HTML asset URLs and serves them without network', async () => {
  const origin = 'https://example.test/';
  const handlers = {}, assets = new Set();
  let networkCalls = 0;
  const cache = {
    addAll: async urls => urls.forEach(url => assets.add(new URL(url, origin).href)),
    match: async request => assets.has(new URL(request.url || request, origin).href) ? { cached: true } : undefined
  };
  vm.runInNewContext(source, {
    self: { addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting() {} },
    caches: { open: async () => cache },
    fetch: async () => { networkCalls++; throw new Error('offline'); }
  });
  let installed;
  handlers.install({ waitUntil: promise => { installed = promise; } });
  await installed;
  const urls = [...html.matchAll(/(?:src|href)="((?:js|css|vendor)\/[^"]+)"/g)].map(match => match[1]);
  assert.ok(urls.length >= 8);
  for (const url of urls) {
    assert.ok(assets.has(new URL(url, origin).href), url + ' must be cached with its query version');
    let response;
    handlers.fetch({
      request: { method: 'GET', mode: 'cors', url: new URL(url, origin).href },
      respondWith: promise => { response = promise; }
    });
    assert.equal((await response).cached, true, url);
  }
  assert.equal(networkCalls, 0);
});
