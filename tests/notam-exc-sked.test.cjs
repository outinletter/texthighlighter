const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/pdf-engine.js'), 'utf8');
// Exercise the production block collector with synthetic text pages, including
// adjacent NOTAMs and an item continuing onto the following page.
const block = source.slice(source.indexOf('    const excludedNotamLines = new Set();'), source.indexOf('    const edtoPointDataPageIdx ='));
const makePage = lines => lines.map((text, index) => ({y:700-index*15,parts:[{item:{str:text}}]}));
async function collect(pages, pkg3StartIdx) {
  const context = vm.createContext({pages,pkg3StartIdx,numPages:pages.length,notam1PageIdx:0,notam2PageIdx:undefined,notam3PageIdx:pkg3StartIdx < 0 ? undefined : pkg3StartIdx,detectPageOffset:()=>0,cleanAndDecodeItem:s=>s,groupTextItemsByLine:items=>items,pdfJsDoc:{getPage:async n=>({getTextContent:async()=>({items:pages[n-1]})})}});
  return vm.runInContext('(async()=>{'+block+';return {full:[...fullyExcludedNotamLines],sentence:[...excludedNotamLines]};})()',context);
}
module.exports = (async () => {
  const pages=[makePage(['RKSI A0001/26','E) EXC SKED RWY CLOSED','COMMENT) NO KE']),makePage(['RKRR A0002/26','E) RWY CLOSED EXC','SKED','COMMENT) INCLUDED','RKRR A0003/26','E) RWY CLOSED']),makePage(['D) EXC SKED','COMMENT) INCLUDED','RKRR A0004/26','E) RWY CLOSED','COMMENT) NO KAL'])];
  const result = await collect(pages,1);
  for(const key of ['1:700','1:685','1:670','1:655','1:640','1:625','2:700','2:685']) assert.ok(result.full.includes(key),key);
  assert.ok(!result.full.some(k=>k.startsWith('0:')),'NOTAM 1/2 unchanged');
  assert.ok(!result.full.includes('2:670'),'Following NOTAM unaffected');
  assert.ok(result.sentence.includes('0:700'),'Existing NO KE rule preserved');
  assert.ok(result.sentence.includes('2:670'),'Existing NO KAL rule preserved');
  assert.equal((await collect([makePage(['RKRR A0001/26','E) EXC SKED'])],-1)).full.length,0);
  assert.equal((await collect([makePage(['RKRR A0001/26','E) EXC SKEDULE'])],0)).full.length,0);
  assert.equal((await collect([makePage(['RKRR A0001/26','E) exc   sked'])],0)).full.length,2);
  console.log('EXC SKED block exclusion regression checks passed');
})();
