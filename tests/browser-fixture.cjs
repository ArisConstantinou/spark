const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createRequire}=require('node:module'),assert=require('node:assert/strict');
const deps=process.env.PLAYWRIGHT_MODULE?createRequire(process.env.PLAYWRIGHT_MODULE):require,{chromium}=deps('playwright'),root=process.env.CODEX_GENERATED_OUTPUT;
if(!root||!process.env.SPARK_ENGINE_ARTIFACT||!process.env.SPARK_FIXTURE_ARTIFACT)throw Error('Use the guarded artifact fixture runner.');
process.env.TEMP=process.env.TMP=path.join(root,'work/temp');let browser;const report={status:'RUNNING',checks:[],errors:[],engine:process.env.SPARK_ENGINE_ARTIFACT,fixture:process.env.SPARK_FIXTURE_ARTIFACT};
const load=(id,all=false)=>JSON.parse(execFileSync('python',['-B',path.join(__dirname,'../tools/load-engine-artifact.py'),id,...all?['--all']:[]],{windowsHide:true,maxBuffer:96*1024*1024}).toString());
(async()=>{
 await fs.writeFile(path.join(root,'tests/browser-fixture.json'),JSON.stringify(report));const assets=load(process.env.SPARK_ENGINE_ARTIFACT),fixture=load(process.env.SPARK_FIXTURE_ARTIFACT,true)['cad-fixture.dwg'];assert(fixture);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--disable-gpu-shader-disk-cache','--disk-cache-size=1048576','--disable-background-networking']});const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/engine/**',r=>{const name=new URL(r.request().url()).pathname.split('/engine/')[1],data=assets[name];return data?r.fulfill({body:Buffer.from(data,'base64'),contentType:name.endsWith('.wasm')?'application/wasm':'text/javascript'}):r.fulfill({status:404,body:'Missing asset'});});
 await page.goto('http://127.0.0.1:5173/?engine=browser');await page.waitForFunction(()=>!!window.fyp);
 report.result=await page.evaluate(async raw=>{
  const p=await import('./platform.js'),bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0)),before=await p.importCad(bytes,'dwg'),checks=[];
  const group=new Map();for(const i of before.items){if(!group.has(i.owner))group.set(i.owner,[]);group.get(i.owner).push(i);}
  const moves=Object.fromEntries([...group.keys()].map(owner=>[owner,{dx:20,dy:30}])),bounds=items=>[Math.min(...items.map(i=>i.bounds[0])),Math.min(...items.map(i=>i.bounds[1])),Math.max(...items.map(i=>i.bounds[2])),Math.max(...items.map(i=>i.bounds[3]))];
  for(const format of ['dwg','dxf']){
   const output=await p.exportCad({factor:1,original:raw,originalFormat:'dwg',cadMoves:moves,segments:[],labels:[{x:200,y:200,height:5,text:'BROWSER-FIXTURE'}]},format),after=await p.importCad(output,format);
   for(const [owner,old]of group){const next=after.items.filter(i=>i.owner===owner),a=bounds(old),b=bounds(next);if(next.length!==old.length||a.some((v,n)=>Math.abs(b[n]-v-(n%2?30:20))>.001))throw Error('Browser '+format+' root movement mismatch.');
    for(let n=0;n<old.length;n++)for(let k=0;k<(old[n].patterns?.length||0);k++){const x=old[n].patterns[k],y=next[n].patterns[k];for(const key of ['basePoint','axis','step','dashes'])if(x[key].some((v,n)=>Math.abs(y[key][n]-v-(key==='basePoint'?(n?30:20):0))>.00001))throw Error('Browser hatch '+key+' changed.');}
    checks.push((before.sourceObjects.find(i=>i.handle===owner)?.type||owner)+' '+format+' geometry and pattern preserved');
   }if(!after.items.some(i=>i.text==='BROWSER-FIXTURE'))throw Error('Browser native annotation missing.');checks.push(format+' annotation preserved');
  }return{checks,primitives:before.items.length,sourceObjects:before.sourceObjects.length,retainedBytes:bytes.length};
 },fixture);report.checks=report.result.checks;assert(report.checks.length>=8);assert.deepEqual(report.errors,[]);report.status='PASS';
})().catch(e=>{report.status='FAIL';report.failure=e.stack;process.exitCode=1;}).finally(async()=>{await browser?.close();await fs.writeFile(path.join(root,'tests/browser-fixture.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));});
