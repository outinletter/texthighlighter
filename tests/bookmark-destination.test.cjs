const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const PDFLib = require('../vendor/pdf-lib.min.js');
const engine = vm.createContext({ PDFLib });
vm.runInContext(readFileSync(require.resolve('../js/pdf-engine.js'), 'utf8'), engine);

test('leaves 72 PDF points above a bookmarked location and preserves zoom', async () => {
  const doc = await PDFLib.PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const destination = engine.createBookmarkDestination(doc.context, page, 600);
  assert.equal(destination.get(0), page.ref);
  assert.equal(destination.get(1).toString(), '/XYZ');
  assert.equal(destination.get(3).asNumber(), 672);
  assert.equal(destination.get(4).asNumber(), 0);
});

test('keeps destinations within the page and preserves whole-page chart links', async () => {
  const doc = await PDFLib.PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const destination = y => engine.createBookmarkDestination(doc.context, page, y);
  assert.equal(destination(790).get(3).asNumber(), 800);
  assert.equal(destination(-100).get(3).asNumber(), 0);
  for (const y of [null, undefined, NaN]) {
    assert.equal(destination(y).get(1).toString(), '/Fit');
  }
});
