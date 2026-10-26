const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const PDFLib = require('../vendor/pdf-lib.min.js');

// Synthetic flight package; no real flight data is included.
const sections = [
  [
    'CFP PLAN KAL123 HL1234 ON 27/OCT/26',
    'KR-US R11 A WX',
    'TRIP 1000 08.00',
    'DISC 0100 00.30',
    'ETD RKSI 1200Z ETA KJFK 2000Z',
    '2ND',
    'RKSI..IGLOT..IGBIS..KJFK',
    'DIST LATITUDE',
    'IGLOT E010 20 250 / 01.20 12345 /',
    'IGBIS E011 20 250 / 01.40 12000 /',
    '12345A123 06 --- /100'
  ],
  [
    'REFILE FLT PLAN',
    'PLANNED R/F AT REFILE POINT 0100',
    'RQRD 0050 01.00',
    'RFILE E012 20 250 / 02.00 10000 /',
    'ENROUTE ALTERNATES',
    'RKSI SUITABLE FROM 1100 UTC / TO 2100 UTC'
  ],
  [
    'COPY OF ATS FPL',
    '-RKSI1200',
    '-N0450F350 IGLOT DCT IGBIS',
    '-KJFK0800',
    'PBN/A DOF/261027 REG/HL1234 EET/RKRR0030',
    'SUBMITTED AT 1000Z'
  ],
  [
    'DISPATCH RELEASE INFORMATION',
    'I HEREBY RELEASE THE FLIGHT, ICN/JFK',
    'TRACK A',
    'DISPATCH NOTES',
    'FL430 EXPECTED FROM IGLOT TO IGBIS'
  ],
  ['EQUAL TIME POINT DATA', 'ETP 1 IGLOT'],
  ['WEATHER BRIEFING', 'TAF COR RKSI', '1200Z TSRA', 'TAF AMD KJFK', 'TEMPO FZRA'],
  ['NOTAM PACKAGE 1', '[DEP]RKSI/ ICN/ Incheon', '[DEST]KJFK/ JFK/ New York',
    'A0001/26', 'E) IGLOT RWY CLOSED.', 'A0002/26', 'E) IGLOT RWY CLOSED.', 'COMMENT) NO KE'],
  ['NOTAM PACKAGE 2', '[ERA]RKSI/ ICN/ Incheon', '[REFILE]RKSI/ ICN/ Incheon',
    'A0003/26', 'E) RFILE UNRELIABLE.'],
  ['NOTAM PACKAGE 3', '[FIR]RKRR', 'A0004/26', 'E) TRACK A IGBIS ICN / JFK.',
    'A0005/26', 'E) EXC SKED CLOSED IGLOT.', 'A0006/26', 'E) CAUTION IGLOT.']
];

async function runFixture(source, options = {}) {
  const doc = await PDFLib.PDFDocument.create();
  sections.forEach(() => doc.addPage([600, 800]));
  if (options.preserve) {
    const child = doc.context.register(doc.context.obj({
      Title: PDFLib.PDFString.of('Original bookmark'),
      Dest: [doc.getPage(0).ref, PDFLib.PDFName.of('Fit')]
    }));
    doc.catalog.set(PDFLib.PDFName.of('Outlines'), doc.context.obj({ First: child, Last: child, Count: 1 }));
  }
  const input = await doc.save();
  const calls = [], textReads = Array(sections.length).fill(0), elements = {};
  const statuses = [];
  let saved;
  const names = ['save','restore','transform','paintFormXObjectBegin','paintFormXObjectEnd','setFillRGBColor','setFillGray','setFillColor','setFillColorN','setFillCMYKColor','constructPath','rectangle','fill','eoFill','fillStroke','eoFillStroke','closeFillStroke','closeEOFillStroke','stroke','closeStroke','endPath'];
  const OPS = Object.fromEntries(names.map((name, index) => [name, index]));
  const jsDoc = {
    numPages: sections.length,
    getPage: async number => ({
      view: [0, 0, 600, 800],
      getViewport: () => ({ width: 600, height: 800 }),
      getTextContent: async () => {
        textReads[number - 1]++;
        let lines = sections[number - 1];
        if (options.fallback && number === 3) {
          lines = lines.map(line => line.startsWith('-N0450') ? 'IGLOT DCT IGBIS' : line);
        }
        return {
          items: lines.map((line, index) => {
            const str = options.encoded && number === 1
              ? [...line].map(char => String.fromCharCode(char.charCodeAt(0) - 29)).join('')
              : line;
            return { str, width: line.length * 5, transform: [10, 0, 0, 10, 60, 700 - index * 22] };
          })
        };
      },
      getOperatorList: async () => ({
        fnArray: [OPS.setFillRGBColor, OPS.constructPath, OPS.fill],
        argsArray: [[204, 204, 204], [[OPS.rectangle], [40, 70, 520, 650]], []]
      })
    })
  };
  const wrappedLib = {
    ...PDFLib,
    PDFDocument: {
      load: async (...args) => {
        const result = await PDFLib.PDFDocument.load(...args);
        result.getPages().forEach((page, index) => {
          for (const method of ['drawText', 'drawRectangle', 'drawLine']) {
            const original = page[method].bind(page);
            page[method] = (value, options) => {
              const args = method === 'drawText' ? { text: value, ...options } : value;
              calls.push([index, method, JSON.parse(JSON.stringify(args, (key, value) => key === 'font' ? undefined : value))]);
              if (method === 'drawText') return original(value, { ...options });
              const normalized = { ...args };
              if (args.start) normalized.start = { ...args.start };
              if (args.end) normalized.end = { ...args.end };
              return original(normalized);
            };
          }
        });
        return result;
      }
    }
  };
  const context = vm.createContext({
    PDFLib: wrappedLib,
    pdfjsLib: {
      getDocument: () => ({ promise: Promise.resolve(jsDoc) }),
      GlobalWorkerOptions: {}, OPS,
      Util: { applyTransform: ([x, y], m) => [x*m[0]+y*m[2]+m[4], x*m[1]+y*m[3]+m[5]] }
    },
    pdfBytes: input, libsReady: true,
    sel: new Set(options.badges ? [] : ['CAUTION', 'UNRELIABLE', 'IGLOT']),
    custom: ['UNRELIABLE'], customLineHighlight: !!options.customLine,
    bmEnabled: !!options.badges, bookmarkPolicy: options.preserve ? 'preserve' : 'generate',
    highlightMode: options.underline ? 'underline' : 'highlight',
    detectedAirports: [], iataAirports: [], extractedRoute: '', extractedAcReg: '',
    extractedFlightNum: '', extractedFileDate: '', done: false, outBytes: null,
    window: { activeHlColorRGB: [1, .45, .65] },
    document: { getElementById: id => elements[id] ||= { style: {} } },
    setStatus: (state, text) => statuses.push([state, text]),
    dlPDF: () => { saved = context.outBytes; },
    setTimeout: callback => { callback(); },
    console: { log() {}, warn() {}, error() {} },
    alert: message => { throw new Error(message); }
  });
  vm.runInContext(source.replace("setStatus('error','Execution error: '+err.message);", 'throw err;'), context);
  await context.runHL();
  assert.ok(context.done, statuses.at(-1)?.[1]);
  assert.ok(saved?.length, 'PDF must be saved');
  const output = await PDFLib.PDFDocument.load(saved);
  assert.equal(output.getPageCount(), sections.length);
  const outlines = output.catalog.lookup(PDFLib.PDFName.of('Outlines'));
  assert.ok(outlines);
  const first = output.context.lookup(outlines.get(PDFLib.PDFName.of('First')));
  const title = first.lookup(PDFLib.PDFName.of('Title')).decodeText();
  assert.equal(title, options.preserve ? 'Original bookmark' : 'CFP PLAN');
  if (!options.preserve) {
    const bookmarks = new Map();
    function readBookmarks(ref) {
      while (ref) {
        const entry = output.context.lookup(ref);
        bookmarks.set(entry.lookup(PDFLib.PDFName.of('Title')).decodeText(), entry);
        readBookmarks(entry.get(PDFLib.PDFName.of('First')));
        ref = entry.get(PDFLib.PDFName.of('Next'));
      }
    }
    readBookmarks(outlines.get(PDFLib.PDFName.of('First')));
    for (const label of ['CFP PLAN', 'COPY OF ATS', 'REFILE POINT', 'EQUAL TIME POINT DATA', 'NOTAM 1']) {
      const dest = bookmarks.get(label).lookup(PDFLib.PDFName.of('Dest'));
      assert.equal(dest.get(1).toString(), '/XYZ', label);
      assert.equal(dest.get(3).asNumber(), 772, label + ' must leave toolbar clearance');
      assert.equal(dest.get(4).asNumber(), 0, label + ' must preserve zoom');
    }
    const departure = bookmarks.get('DEP RKSI').lookup(PDFLib.PDFName.of('Dest'));
    assert.equal(departure.get(3).asNumber(), 750, 'Airport sub-bookmarks need the same clearance');
    const chart = bookmarks.get('Vertical Cross-Section').lookup(PDFLib.PDFName.of('Dest'));
    assert.equal(chart.get(1).toString(), '/Fit', 'Whole-page charts should still fit the page');
  }
  const badges = calls.filter(call => call[1] === 'drawText').map(call => call[2].text);
  assert.ok(badges.some(text => text.includes('DUTY TIME')));
  assert.ok(badges.some(text => text.includes('DISC FUEL INFO')));
  assert.ok(badges.includes('+ 5,000 lbs'));
  assert.ok(badges.includes('01.20 ~ 01.40'));
  assert.ok(badges.includes('FIR ENTRY'));
  assert.ok(badges.some(text => text.includes('From 1100Z To 2100Z')));
  return { calls, statuses, textReads, title };
}

async function main() {
  const source = readFileSync(resolve(__dirname, '../js/pdf-engine.js'), 'utf8');
  const baseline = process.env.TEXTHIGHLIGHTER_BASELINE;
  const original = baseline ? readFileSync(baseline, 'utf8') : null;
  for (const options of [{}, { underline: true }, { badges: true }, { preserve: true },
    { encoded: true }, { fallback: true }, { customLine: true }]) {
    const result = await runFixture(source, options);
    assert.ok(result.textReads.every(count => count === 1), 'Each page must be extracted once per run');
    if (original) {
      const before = await runFixture(original, options);
      assert.deepEqual(result.calls, before.calls, 'Marker and badge drawing must stay unchanged');
      assert.deepEqual(result.statuses, before.statuses, 'Result counts must stay unchanged');
      console.log(JSON.stringify(options), 'same output, text reads',
        before.textReads.reduce((a, b) => a + b, 0), '->', result.textReads.reduce((a, b) => a + b, 0));
    }
  }
  console.log('PDF save, markers, badges and bookmark integration checks passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
