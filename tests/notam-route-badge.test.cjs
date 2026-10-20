const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../js/pdf-engine.js'),'utf8');
const c = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function notam3RouteBadgeText('),source.indexOf('function findBadgePosition(')),c);
for(const text of ['CTS / ICN','CTS/ICN','ROUTE cts / icn INCLUDED','CTS  /  ICN']) {
  assert.equal(c.notam3RouteBadgeText(text,['CTS','ICN'],'R11'),'CTS/ICN R11');
}
for(const text of ['XCTS/ICN','CTS/ICNX','ICN/CTS','CTS / LAX','CTS ICN']) {
  assert.equal(c.notam3RouteBadgeText(text,['CTS','ICN'],'R11'),'');
}
assert.equal(c.notam3RouteBadgeText('CTS/ICN',['CTS','ICN'],''),'');
assert.equal(c.notam3RouteBadgeText('CTS/ICN',[],'R11'),'');
console.log('NOTAM 3 route badge regression checks passed');
