// Real assembled CAD engine under missing, throwing and denied optional OPFS.
// IndexedDB project storage is deliberately left intact, never shimmed as success.
const fs=require('node:fs/promises'),crypto=require('node:crypto');
module.exports=async function verifyBrowserStorage({browser,baseUrl,fixture,check}){
 const bytes=await fs.readFile(fixture),data=bytes.toString('base64'),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 for(const mode of ['missing-storage','missing-method','throwing-getter','throwing-method','rejected-promise']){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),errors=[];
  try{
   await context.addInitScript(mode=>{
    const unavailable=()=>new DOMException('Storage denied for regression test','NotAllowedError');
    Object.defineProperty(Navigator.prototype,'storage',{configurable:true,get(){
     if(mode==='throwing-getter')throw unavailable();
     if(mode==='missing-storage')return undefined;
     if(mode==='missing-method')return {};
     return {getDirectory(){if(mode==='throwing-method')throw unavailable();return Promise.reject(unavailable());}};
    }});
   },mode);
   await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&(url.origin!==new URL(baseUrl).origin||!['GET','HEAD'].includes(request.method())||request.postData()))return route.abort();return route.continue();});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(baseUrl);
   await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});
   async function ready(){for(let n=0;n<4;n++){
    const result=await page.waitForFunction(()=>document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice'?'graphics':window.sparkWorkspace?.project?.original&&sparkWorkspace.project?.working&&!sparkWorkspace.busy?'ready':false,{},{timeout:120000});
    if(await result.jsonValue()==='ready')return;
    const state=await page.evaluate(()=>sparkWorkspace.read({op:'state'}));check(/GpuWarning/.test(JSON.stringify(state.modal)),mode+': only the known graphics notice is acknowledged');
    await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
   }throw Error('Import did not settle');}
   await page.locator('#file-input').setInputFiles({name:'storage-fixture.dwg',mimeType:'application/octet-stream',buffer:bytes});await ready();
   const source=await page.evaluate(()=>({name:sparkWorkspace.project.name,original:sparkWorkspace.project.original,working:!!sparkWorkspace.project.working}));
   check(source.name==='storage-fixture'&&source.original.data===data&&source.working,mode+': a successful open retains the exact original and complete project metadata');
   const count=await page.evaluate(async()=>(await sparkWorkspace.read({op:'query',limit:1})).count);check(count>0,mode+': actual native drawing geometry is present');
   await page.locator('#save').click();await page.waitForFunction(()=>!sparkWorkspace.busy);await page.reload();await require('./continue-saved.cjs')(page);await ready();
   const restored=await page.evaluate(async()=>({source:sparkWorkspace.project.original.data,name:sparkWorkspace.project.name,count:(await sparkWorkspace.read({op:'query',limit:1})).count}));
   check(restored.source===data&&restored.name==='storage-fixture'&&restored.count===count,mode+': saved-project reload restores geometry and source through real IndexedDB without OPFS');
   check(!errors.length,mode+': no unhandled JavaScript exception or WebAssembly panic');
  }catch(error){throw new Error(mode+': '+error.message+'; browserErrors='+JSON.stringify(errors),{cause:error});}finally{await context.close();}
 }
 check(crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex')===hash,'Storage regression tests preserve the original fixture bytes');
};
