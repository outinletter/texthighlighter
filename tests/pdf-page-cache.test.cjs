const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const engine = vm.createContext({});
vm.runInContext(readFileSync(require.resolve('../js/pdf-engine.js'), 'utf8'), engine);
const item = (str, x = 10, y = 700) => ({ str, width: str.length * 6, transform: [10, 0, 0, 10, x, y] });

test('shares concurrent page extraction and decoded data across consumers', async () => {
  let loads = 0, extracts = 0;
  const content = { items: [item('NOTAM PACKAGE PLAN'), item('[DEP]RKSI', 10, 680)] };
  const page = {
    getTextContent: async () => { extracts++; return content; },
    getViewport: () => ({ width: 600, height: 800 })
  };
  const cache = engine.createPdfPageCache({
    getPage: async number => { assert.equal(number, 1); loads++; return page; }
  });
  const [a, b] = await Promise.all([cache(1), cache(1)]);
  assert.equal(a, b);
  assert.equal(a.content, content);
  assert.equal(a.page, page);
  assert.equal(a.text, 'NOTAM PACKAGE PLAN  DEP RKSI');
  assert.equal(a.lines, a.lines);
  assert.equal(a.lines[1].text, '[DEP]RKSI');
  await cache(1);
  assert.equal(loads, 1);
  assert.equal(extracts, 1);
});

test('keeps document caches separate and retries failed extraction', async () => {
  let attempts = 0;
  const doc = {
    getPage: async () => ({
      getViewport: () => ({}),
      getTextContent: async () => {
        if (++attempts === 1) throw new Error('temporary read failure');
        return { items: [item('NOTAM PACKAGE PLAN')] };
      }
    })
  };
  const first = engine.createPdfPageCache(doc);
  await assert.rejects(first(1), /temporary read failure/);
  const recovered = await first(1);
  const independent = await engine.createPdfPageCache(doc)(1);
  assert.notEqual(recovered, independent);
  assert.equal(attempts, 3);
});

test('retains encoded PDF recovery and separate tag/marker grouping', async () => {
  const shifted = 'NOTAM PACKAGE PLAN'.split('').map(char => String.fromCharCode(char.charCodeAt(0) - 29)).join('');
  const cache = engine.createPdfPageCache({
    getPage: async () => ({
      getViewport: () => ({}),
      getTextContent: async () => ({ items: [item(shifted)] })
    })
  });
  const data = await cache(1);
  assert.equal(data.offset, 29);
  assert.equal(data.text, 'NOTAM PACKAGE PLAN');
  const items = [item('B', 30), item('A', 10), item('  ', 1), item('C', 10, 680)];
  const markers = engine.groupTextItemsByLine(items, 0, {
    decoder: engine.cleanAndDecodeItem, trim: true, separator: ' '
  });
  assert.deepEqual(Array.from(markers, line => line.text), ['A B', 'C']);
  assert.equal(items[0].str, 'B', 'Grouping must not sort the source items');
  assert.equal(engine.groupTextItemsByLine(items, 0)[0].text, '  AB');
  const mapped = engine.buildLineCharMapping(markers[0].items, 0);
  assert.equal(mapped.text, 'A B');
  assert.equal(mapped.mapping[1].isSeparator, true);
  assert.equal(mapped.mapping[2].itemIndex, 1);
  assert.equal(mapped.mapping[2].charIndex, 0);
});
