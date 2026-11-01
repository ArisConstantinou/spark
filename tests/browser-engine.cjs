const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const deps=process.env.PLAYWRIGHT_MODULE?createRequire(process.env.PLAYWRIGHT_MODULE):require;
const {chromium}=deps('playwright');
const root=process.env.CODEX_GENERATED_OUTPUT;if(!root)throw Error('Use the reviewed generated-output runner.');
process.env.TEMP=process.env.TMP=path.join(root,'work/temp');
const report={status:'RUNNING',checks:[],errors:[]};let browser;
(async()=>{
 await fs.writeFile(path.join(root,'tests/browser-engine.json'),JSON.stringify(report));
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--disable-gpu-shader-disk-cache','--disk-cache-size=1048576','--disable-background-networking']});
 const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{require('node:fs').writeFileSync(path.join(root,'tests/browser-engine-progress.txt'),new Date().toISOString()+' '+m.type()+': '+m.text().slice(0,400));console.log(m.type()+': '+m.text().slice(0,400));if(m.type()==='error')report.errors.push(m.text().slice(0,400));});page.on('requestfailed',r=>console.log('REQUEST FAILED '+r.url()+' '+r.failure()?.errorText));
 // Local read-only mapping uses exactly the files shipped under /engine on Pages.
 if(process.env.SPARK_TEST_MAP_ENGINE)await page.route('**/engine/**',async route=>{
  const relative=new URL(route.request().url()).pathname.split('/engine/')[1];
  const file=path.resolve(root,'build/web/engine',decodeURIComponent(relative));
  if(!file.startsWith(path.resolve(root,'build/web/engine')+path.sep))return route.abort();
  await route.fulfill({path:file,contentType:file.endsWith('.wasm')?'application/wasm':file.endsWith('.js')?'text/javascript':'application/octet-stream'});
 });
 await page.goto(process.env.SPARK_TEST_URL||'http://127.0.0.1:5173/?engine=browser');await page.waitForFunction(()=>!!window.fyp);
 const file=process.env.DWG_PATH;if(!file)throw Error('Set DWG_PATH to a representative read-only drawing.');
 const base64=(await fs.readFile(file)).toString('base64');
 report.engine=await page.evaluate(async raw=>{
  const p=await import('./platform.js'),bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0)),start=performance.now();
  console.log('Probing browser engine startup and a small native round trip…');
  const fixture=await p.exportCad({factor:1,original:'',originalFormat:'dwg',segments:[{a:[0,0],b:[1000,500]}],labels:[]},'dwg',console.log);
  const fixtureScene=await p.importCad(fixture,'dwg',console.log);if(!fixtureScene.items.length)throw Error('Empty browser fixture.');
  console.log('Reading representative DWG…');
  const realStart=performance.now(),before=await p.importCad(bytes,'dwg',console.log),imported=performance.now()-start,realImportMs=performance.now()-realStart;
  const target=before.items.find(i=>i.kind==='path'&&!i.fill&&before.sourceObjects?.some(e=>e.handle===i.owner&&e.type==='Line'))||before.items.find(i=>i.kind==='path'&&!i.fill);
  const owner=target.owner,dx=before.factor*2,dy=before.factor*3;
  const source=before.items.filter(i=>i.owner===owner),bounds=items=>[Math.min(...items.map(i=>i.bounds[0])),Math.min(...items.map(i=>i.bounds[1])),Math.max(...items.map(i=>i.bounds[2])),Math.max(...items.map(i=>i.bounds[3]))];
  const box=bounds(source),request={factor:before.factor,original:raw,originalFormat:'dwg',cadMoves:{[owner]:{dx,dy}},segments:[{a:[0,0],b:[1000,0]}],labels:[{x:10,y:10,height:5,text:'SparkWorld browser check'}]};
  console.log('Writing and reopening the representative DWG…');const exportStart=performance.now(),native=await p.exportCad(request,'dwg',console.log),exportMs=performance.now()-exportStart,reopenStart=performance.now(),after=await p.importCad(native,'dwg',console.log),reimportMs=performance.now()-reopenStart,moved=bounds(after.items.filter(i=>i.owner===owner));
  let rejected=false;try{await p.importCad(new TextEncoder().encode('not CAD'),'dwg');}catch{rejected=true;}
  return{primitives:before.items.length,coverage:before.coverage,adapterVersion:before.adapterVersion,sourceObjects:before.sourceObjects?.length,importMs:imported,realImportMs,exportMs,reimportMs,totalMs:performance.now()-start,exportBytes:native.length,moveError:Math.max(...box.map((v,n)=>Math.abs(moved[n]-v-(n%2?dy:dx)))),annotation:after.items.some(i=>i.text==='SparkWorld browser check'),corruptRejected:rejected,retainedBytes:bytes.length};
 },base64);
 assert.equal(report.engine.primitives,115089);assert(report.engine.adapterVersion>=3);assert(report.engine.sourceObjects>0);assert(report.engine.moveError<.1);assert(report.engine.annotation);assert(report.engine.corruptRejected);report.checks.push('Real DWG parsed in browser WebAssembly','Source movement survives browser DWG export','Added annotation survives browser DWG export','Corrupt DWG explicitly rejected','Original input buffer retained');
 assert.deepEqual(report.errors,[]);report.status='PASS';
})().catch(e=>{report.status='FAIL';report.failure=e.stack;process.exitCode=1;}).finally(async()=>{await browser?.close();await fs.writeFile(path.join(root,'tests/browser-engine.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));});
