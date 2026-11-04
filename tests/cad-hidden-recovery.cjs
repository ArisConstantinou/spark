// Native OPFS autosave state from a previous browser session must not lock
// SparkWorld's host controls. Each test context owns isolated synthetic data.
const fs=require('node:fs/promises');
module.exports=async({browser,baseUrl,fixture,out,check})=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),errors=[];
 try{
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());return ['http:','https:'].includes(url.protocol)&&(url.origin!==new URL(baseUrl).origin||!['GET','HEAD'].includes(request.method()))?route.abort():route.continue();});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));const bytes=await fs.readFile(fixture);
  await page.goto(baseUrl);await page.waitForFunction(()=>window.sparkWorkspace?.ready,null,{timeout:120000});
  await page.locator('#file-input').setInputFiles({name:'Saved floor.dwg',mimeType:'application/octet-stream',buffer:bytes});for(let i=0;i<4;i++){const ready=await page.waitForFunction(()=>document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title').textContent==='CAD graphics notice'?'graphics':sparkWorkspace.project?.name==='Saved floor'&&!sparkWorkspace.busy?'ready':false,null,{timeout:120000});if(await ready.jsonValue()==='ready')break;check(await page.evaluate(async()=>(await sparkWorkspace.read({op:'state'})).modal==='GpuWarning'),'Recovery fixture acknowledges only the known software graphics notice');await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();}const report={projectId:await page.evaluate(()=>sparkWorkspace.project.id)};
  const key=await page.evaluate(async bytes=>{const name='Legacy recovery.dwg';let hash=0xcbf29ce484222325n;for(const byte of new TextEncoder().encode(name))hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);const key=hash.toString(16).padStart(16,'0')+'.sv$',dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('opencadstudio-autosave',{create:true});for(const[file,value]of [['index.json',JSON.stringify([name])],[key,new Uint8Array(bytes)]]){const handle=await dir.getFileHandle(file,{create:true}),writer=await handle.createWritable();await writer.write(value);await writer.close();}return key;},[...bytes]);
  await page.reload();await page.waitForFunction(()=>window.sparkWorkspace?.ready,null,{timeout:120000});await page.waitForFunction(async()=>(await sparkWorkspace.read({op:'state'})).modal==='AutosaveRestore');check(true,'A real earlier native autosave reproduces the hidden recovery prompt');
  await require('./hidden-cad-notice.cjs')({page,check,out,report,fixture:bytes});
  const retained=await page.evaluate(async key=>{const dir=await(await navigator.storage.getDirectory()).getDirectoryHandle('opencadstudio-autosave');return Array.from(new Uint8Array(await(await(await dir.getFileHandle(key)).getFile()).arrayBuffer()));},key);check(Buffer.from(retained).equals(bytes),'All opening paths preserve the earlier native recovery bytes');check(!errors.length,'Native recovery handling has no page errors');
 }finally{await context.close();}
};
