const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/pdf-engine.js'), 'utf8');
const names = ['save','restore','transform','paintFormXObjectBegin','paintFormXObjectEnd','setFillRGBColor','setFillGray','setFillColor','setFillColorN','setFillCMYKColor','constructPath','rectangle','fill','eoFill','fillStroke','eoFillStroke','closeFillStroke','closeEOFillStroke','stroke','closeStroke','endPath'];
const OPS = Object.fromEntries(names.map((name, index) => [name, index]));
const Util = {
  transform: (a,b) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]],
  applyTransform: ([x,y],m) => [x*m[0]+y*m[2]+m[4],x*m[1]+y*m[3]+m[5]]
};
const context = vm.createContext({ pdfjsLib: { OPS, Util } });
vm.runInContext(source.slice(source.indexOf('const notamShadeRegions ='), source.indexOf('/**\n * Highlight/Underline')) + '\nthis.api={extractNotamShadeRegions,markerInsideNotamShade,notamShadeRegions};', context);
const {extractNotamShadeRegions, markerInsideNotamShade, notamShadeRegions} = context.api;
const rect = (x,y,w,h) => ['constructPath', [[OPS.rectangle],[x,y,w,h]]];
const extract = async operations => extractNotamShadeRegions({view:[0,0,600,800],getOperatorList:async()=>({fnArray:operations.map(([op])=>OPS[op]),argsArray:operations.map(([,args])=>args)})});
module.exports = (async () => {
  const regions = await extract([
    ['setFillRGBColor',[255,255,255]],rect(0,0,600,800),['fill'],
    ['save'],['transform',[1,0,0,-1,0,800]],['setFillRGBColor',[204,204,204]],rect(40,100,500,120),['fill'],['restore'],
    // Pink highlights and thin gray separator lines are not NOTAM backgrounds.
    ['setFillRGBColor',[255,115,166]],rect(40,300,500,20),['fill'],
    ['setFillRGBColor',[204,204,204]],rect(40,400,500,1),['fill'],
    // Restoring white graphics state must prevent classifying this box as gray.
    ['setFillRGBColor',[255,255,255]],rect(40,450,500,100),['fill']
  ]);
  assert.equal(regions.length,1);
  assert.equal(regions[0].y,580);
  const page={}; notamShadeRegions.set(page,regions);
  assert.equal(markerInsideNotamShade(page,50,600,100,10),true);
  assert.equal(markerInsideNotamShade(page,50,450,100,10),false);
  assert.equal(markerInsideNotamShade(page,0,600,600,10),false,'Do not highlight across a shaded box boundary');
  assert.equal(markerInsideNotamShade({},50,450,100,10),true,'Other sections stay unchanged');
  notamShadeRegions.set(page,[]);
  assert.equal(markerInsideNotamShade(page,50,600,100,10),false,'Unshaded NOTAM 3 pages receive no highlights');
  assert.equal((await extract([['setFillGray',[.8]],rect(40,100,500,100),['fill']])).length,1);
  assert.equal((await extract([['setFillRGBColor',[204,204,204]],rect(40,100,500,100),['endPath']])).length,0,'Clipping paths are not fills');
  console.log('NOTAM shading regression checks passed');
})();
