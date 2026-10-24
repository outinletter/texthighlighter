const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const engine = vm.createContext({ console: { log() {} }, highlightMode: 'highlight' });
vm.runInContext(readFileSync(require.resolve('../js/pdf-engine.js'), 'utf8'), engine);

const cfp = [
  'CFP PLAN',
  'IGLOT E010 20 250 / 01.20 12345 /',
  'IGBIS E011 20 250 / 01.40 12000 /',
  '34E60 E060 20 250 / 02.00 11000 /',
  'REFILE FLT PLAN',
  'RFILE E012 20 250 / 02.20 10000 /',
  'ENROUTE ALTERNATES',
  'ALTP E013 20 250 / 02.40 09000 /'
].join('\n');

test('detects every CFP waypoint even if ATS omits it', () => {
  const ats = '-N0450F350 IGLOT DCT 34E60 -RKSI1200';
  const points = engine.extractNotamRouteWaypoints(cfp, ats);
  assert.deepEqual([...points], ['IGLOT', 'IGBIS', '34E60', 'RFILE', 'ALTP']);
  assert.equal(engine.extractNotamRouteWaypoints('').size, 0);
});

test('underlines whole waypoint tokens, including repeated and lowercase references', () => {
  const text = 'igbis IGBIS XIGBIS IGBIS1 (34E60) UNKNOWN RFILE ALTP';
  const matches = engine.notamRouteMatches(text, new Set(), engine.extractNotamRouteWaypoints(cfp));
  assert.deepEqual(Array.from(matches, match => text.slice(match.start, match.end)),
    ['igbis', 'IGBIS', '34E60', 'RFILE', 'ALTP']);
  assert.ok(matches.every(match => match.mode === 'underline'));
});

test('draws only matching word ranges as underlines even in highlight mode', () => {
  const rectangles = [];
  const page = { drawRectangle: rectangle => rectangles.push(rectangle) };
  const item = { str: 'CAUTION IGBIS CLOSED', width: 200, transform: [10, 0, 0, 10, 50, 200] };
  const font = { widthOfTextAtSize: text => text.length * 10 };
  engine.drawNotamRouteReferences(page, [item], 1, 1, 0, font, {},
    new Set(), engine.extractNotamRouteWaypoints(cfp));
  assert.equal(rectangles.length, 1);
  assert.equal(rectangles[0].x, 130);
  assert.equal(rectangles[0].width, 50);
  assert.equal(rectangles[0].height, 1.5);
  assert.equal(rectangles[0].opacity, 1);
});

test('preserves selected track highlighting alongside waypoint underlines', () => {
  const text = 'TRACK A IGBIS TRACK B';
  const matches = engine.notamRouteMatches(text, new Set(['A']), engine.extractNotamRouteWaypoints(cfp));
  assert.deepEqual(Array.from(matches, match => [text.slice(match.start, match.end), match.mode]),
    [['TRACK A', 'highlight'], ['IGBIS', 'underline']]);
});
