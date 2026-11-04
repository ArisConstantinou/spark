// Exercise real browser storage and the assembled native viewport. Bulk
// reads are counted, not mocked away, so the previous Projects path fails.
const fs=require('node:fs/promises');
module.exports=async function verifyCatalogue({browser,baseUrl,fixture,check}){
 const bytes=await fs.readFile(fixture),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),errors=[];
 let page;
 try{
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());return ['http:','https:'].includes(url.protocol)&&(url.origin!==new URL(baseUrl).origin||!['GET','HEAD'].includes(req.method())||req.postData())?route.abort():route.continue();});
  await context.addInitScript(()=>{window.projectReads={getAll:0,get:0,openCursor:0};for(const op of Object.keys(projectReads)){const original=IDBObjectStore.prototype[op];IDBObjectStore.prototype[op]=function(...args){if(['sparkworld-cad-projects','fyp-electrical-studio'].includes(this.transaction.db.name))projectReads[op]++;return Reflect.apply(original,this,args);};}});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(baseUrl);await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});
  const observe=()=>page.evaluate(()=>{const api=document.querySelector('#cad-frame').contentWindow.ocsControl,request=api.request.bind(api);window.projectRequests=[];api.request=async(value,options)=>{const row={op:value.op,cmd:value.cmd,timeout:options?.timeoutMs};projectRequests.push(row);const result=await request(value,options);const s=result.state||result;row.dirty=s.documents?.find(d=>d.id===s.document_id)?.dirty;return result;};});
  async function ready(name){for(let n=0;n<4;n++){
   const result=await page.waitForFunction(name=>{if(document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice')return 'graphics';const workspace=window.sparkWorkspace;if(workspace?.ready&&!workspace.busy&&workspace.project?.name===name)return 'ready';},name,{timeout:120000});
   if(await result.jsonValue()==='ready')return;const state=await page.evaluate(()=>sparkWorkspace.read({op:'state'}));if(!/GpuWarning/.test(JSON.stringify(state.modal)))throw Error('Unexpected native modal');await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
  }throw Error('CAD drawing did not open');}
  const clean=Buffer.from('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n10\n20\n20\n30\n0\n11\n110\n21\n70\n31\n0\n0\nENDSEC\n0\nEOF\n');
  await observe();await page.locator('#file-input').setInputFiles({name:'Ground floor.dxf',mimeType:'application/octet-stream',buffer:clean});await ready('Ground floor');
  const ground=await page.evaluate(async()=>{const p=sparkWorkspace.project,s=await sparkWorkspace.read({op:'state'});return {id:p.id,sameBytes:p.original.data===p.working.data,requests:projectRequests.filter(x=>['open','save'].includes(x.op)||x.cmd==='TILEMODE 1'),layout:s.layout,active:s.documents.find(d=>d.id===s.document_id)};});
  console.log('Catalogue fixture open: '+JSON.stringify(ground));
  await page.locator('#file-input').setInputFiles({name:'Upper floor.dwg',mimeType:'application/octet-stream',buffer:bytes});await ready('Upper floor');
  await page.evaluate(async()=>{const model=await import(new URL('model.js',location.href));await model.storage.save(model.blank('Earlier floor plan'));localStorage.removeItem('sparkworld-cad-active');});
  await page.reload();await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});await observe();await page.locator('#electrical-nav').click();await page.locator('button[data-legacy]').filter({hasText:/^Earlier floor plan/}).waitFor();
  check(await page.evaluate(()=>projectReads.getAll===0&&projectReads.get===0&&projectReads.openCursor===2),'Projects lists current and earlier drawings without fetching all full project payloads');
  check(ground.sameBytes&&ground.requests.some(r=>r.op==='open'&&r.timeout>120000)&&!ground.requests.some(r=>r.op==='save'),'A pristine import retains the original working bytes, skips native re-encoding and grants complex opens a bounded longer deadline');
  check(ground.layout==='Model'&&!ground.requests.some(r=>r.cmd==='TILEMODE 1'),'A drawing already in Model opens without switching to Model again');
  await page.locator('#workspace-search').fill('Ground');await page.locator('button[data-project]').filter({hasText:/^Ground floor/}).waitFor();check(await page.locator('[data-project]').count()===1&&await page.evaluate(()=>projectReads.openCursor===2),'Searching the project catalogue reuses the loaded metadata');
  await page.evaluate(()=>{const observer=new MutationObserver(()=>{if(document.querySelector('#cad-import-title')?.textContent==='Restoring your drawing')window.sawSavedLoader=true;});observer.observe(document.body,{childList:true,subtree:true,characterData:true});});
  await page.locator('button[data-project]').filter({hasText:/^Ground floor/}).click();await ready('Ground floor');
  check(await page.evaluate(id=>projectReads.get===1&&sawSavedLoader&&sparkWorkspace.project.id===id&&!sessionStorage.getItem('sparkworld-opening-drawing'),ground.id),'Opening a saved row reads one project, shows restore progress and clears the marker after success');
  check(await page.evaluate(()=>sparkWorkspace.project.activeLayout==='Model'&&!projectRequests.some(r=>r.cmd==='TILEMODE 1')),'A saved drawing already in Model restores without repeating the layout switch');
  const created=await page.evaluate(async()=>{const r=await sparkWorkspace.mutate({op:'entities_create',entities:[{type:'Line',start:[1,2,0],end:[30,45,0],layer:'0'}]});await sparkWorkspace.save();return (r.result||r).handles[0];});
  check(await page.evaluate(()=>sparkWorkspace.project.original.data!==sparkWorkspace.project.working.data),'An actual CAD edit creates a native working snapshot and keeps the original');
  await page.reload();await require('./continue-saved.cjs')(page);await ready('Ground floor');check(await page.evaluate(async handle=>(await sparkWorkspace.read({op:'query',handles:[handle]})).entities.length===1,created),'The native edit survives a saved-project reload');
  // Emulate a lost tab after the real restore path records its marker.
  await page.evaluate(()=>{const api=document.querySelector('#cad-frame').contentWindow.ocsControl,request=api.request.bind(api);api.request=(value,options)=>value.op==='open'?new Promise(()=>{}):request(value,options);});
  await page.locator('#electrical-nav').click();await page.locator('button[data-project]').filter({hasText:/^Upper floor/}).click();await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('sparkworld-opening-drawing')||'null')?.stage==='Opening the saved CAD drawing');
  await page.getByRole('button',{name:'Reset workspace',exact:true}).click();
  check(await page.locator('#dialog-title').textContent()==='Reset workspace?','The loading overlay offers an explicit reset while an open is stalled');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  check(await page.evaluate(()=>sparkWorkspace.busy&&!!sessionStorage.getItem('sparkworld-opening-drawing')),'Cancelling reset keeps the existing load without starting another one');
  await page.reload();await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});
  check(await page.locator('.cad-recent-drawing').isVisible()&&await page.evaluate(()=>!sparkWorkspace.project&&!document.querySelector('#dialog').open),'An interrupted saved open remains an inline notice without an automatic retry or blocking dialog');
  await page.getByRole('button',{name:'View saved projects',exact:true}).click();await page.locator('button[data-project]').filter({hasText:/^Upper floor/}).waitFor();await page.locator('button[data-project]').filter({hasText:/^Ground floor/}).waitFor();check(!errors.length,'Recovery leaves both saved drawings available without unhandled errors');
  await page.setViewportSize({width:1440,height:900});
  await page.locator('button[data-project]').filter({hasText:/^Upper floor/}).click();
  await ready('Upper floor');
  const tools=page.getByRole('button',{name:'Open workspace tools',exact:true});
  if(await tools.isVisible()){
   await tools.click();
   await page.locator('.ui-workspace-menu summary').click();
   await page.getByRole('combobox',{name:'Drawing sheet',exact:true}).selectOption('Layout1');
  }else{
   await page.locator('.cad-utility-menu summary').click();
   await page.locator('#cad-own-layout').selectOption('Layout1');
  }
  await page.waitForFunction(()=>!sparkWorkspace.busy&&sparkWorkspace.project?.activeLayout==='Layout1');
  await page.reload();
  await require('./continue-saved.cjs')(page);await ready('Upper floor');
  check(await page.evaluate(async()=>sparkWorkspace.project.activeLayout==='Layout1'&&(await sparkWorkspace.read({op:'state'})).layout==='Layout1'),'Restoring a project keeps its saved paper layout');
  await observe();
  await page.setViewportSize({width:390,height:844});
  const upperDocument=await page.evaluate(async()=>(await sparkWorkspace.read({op:'state'})).document_id);
  await page.locator('#electrical-nav').click();
  await page.locator('button[data-project]').filter({hasText:/^Upper floor/}).click();
  await page.waitForFunction(()=>document.querySelector('#dialog-title').textContent==='Project already open');
  check(await page.locator('#dialog-actions button').evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=44&&button.scrollWidth<=button.clientWidth)),'Reload choices have full readable mobile touch targets');
  if(process.env.CODEX_TEST_OUTPUT)await page.screenshot({path:require('node:path').join(process.env.CODEX_TEST_OUTPUT,'cad-project-reload-confirm-mobile.png')});
  await page.getByRole('button',{name:'Show existing drawing',exact:true}).click();
  await page.waitForFunction(()=>!sparkWorkspace.busy&&!document.querySelector('#dialog').open);
  check(await page.evaluate(()=>!projectRequests.some(request=>request.op==='open')),'Showing an already open project does not decode it again');
  await page.locator('#electrical-nav').click();
  await page.locator('button[data-project]').filter({hasText:/^Upper floor/}).click();
  await page.getByRole('button',{name:'Replace and reload',exact:true}).click();
  await ready('Upper floor');
  check(await page.evaluate(async old=>{
   const state=await sparkWorkspace.read({op:'state'}),operations=projectRequests.filter(request=>['open','close'].includes(request.op));
   window.keptUpperDocument=state.document_id;
   return !state.documents.some(document=>document.id===old)&&operations.length===2&&operations[0].op==='close'&&operations[1].op==='open';
  },upperDocument),'Replace closes the previous native drawing before opening the saved copy');
  await page.evaluate(()=>{
   const api=sparkCadStudio,original=api.importFile;
   api.importFile=async(file,options)=>{
    api.importFile=original;
    await original(file,{...options,onOpened:undefined});
    throw Error('Injected failure after native drawing installation');
   };
  });
  await page.locator('#electrical-nav').click();
  await page.locator('button[data-project]').filter({hasText:/^Ground floor/}).click();
  await page.waitForFunction(()=>!sparkWorkspace.busy&&document.querySelector('#toast').textContent.includes('Injected failure'));
  const failed=await page.evaluate(async()=>({native:(await sparkWorkspace.read({op:'state'})).document_id,opens:projectRequests.filter(request=>request.op==='open').length}));
  await page.locator('#electrical-nav').click();
  await page.locator('button[data-project]').filter({hasText:/^Ground floor/}).click();
  await page.waitForFunction(()=>document.querySelector('#dialog-title').textContent==='Previous opening did not finish');
  check(await page.evaluate(count=>projectRequests.filter(request=>request.op==='open').length===count,failed.opens),'A failed opening is recognized before a second native import');
  await page.getByRole('button',{name:'Replace and reload',exact:true}).click();
  await ready('Ground floor');
  check(await page.evaluate(async old=>!(await sparkWorkspace.read({op:'state'})).documents.some(document=>document.id===old),failed.native),'Retry replaces the incomplete native drawing instead of adding another copy');
  await page.evaluate(()=>sparkWorkspace.read({op:'activate',document_id:keptUpperDocument,request_id:'catalogue-keep-upper'}));
  await ready('Upper floor');
  await page.locator('#electrical-nav').click();
  const beforeDelete=await page.evaluate(async id=>{
   const {projectStore}=await import(new URL('workspace-store.js',location.href));
   window.deletedProjectDraft=await projectStore.get(id);
   return {active:sparkWorkspace.project.id,document:(await sparkWorkspace.read({op:'state'})).document_id,opens:projectRequests.filter(row=>row.op==='open').length};
  },ground.id);
  const groundDelete=page.getByRole('button',{name:'Delete saved project Ground floor',exact:true});
  await groundDelete.click();
  check((await page.locator('#dialog-body').textContent()).includes('Ground floor'),'Delete confirmation names the exact saved project');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  check(await groundDelete.isVisible(),'Cancel keeps the project available');
  await page.setViewportSize({width:390,height:844});
  const fit=await groundDelete.boundingBox();
  check(fit.width>=44&&fit.height>=44&&fit.x>=0&&fit.x+fit.width<=390,'Project delete controls fit the mobile viewport with usable touch targets');
  await groundDelete.click();await page.getByRole('button',{name:'Delete project',exact:true}).click();
  await groundDelete.waitFor({state:'detached'});
  check(await page.evaluate(async id=>{
   const {projectStore}=await import(new URL('workspace-store.js',location.href));
   return !await projectStore.get(id);
  },ground.id),'Deleting a saved drawing removes its full payload without opening it');
  check(await page.evaluate(async before=>sparkWorkspace.project.id===before.active&&(await sparkWorkspace.read({op:'state'})).document_id===before.document&&projectRequests.filter(row=>row.op==='open').length===before.opens,beforeDelete),'Deleting another saved project preserves the current drawing and performs no import');
  check(await page.evaluate(async id=>{
   const {projectStore}=await import(new URL('workspace-store.js',location.href));
   const stale={...deletedProjectDraft,id};
   try{await projectStore.save(stale);return false;}catch{return !await projectStore.get(id);}
  },ground.id),'A stale autosave cannot recreate a deleted saved project');
  await page.getByRole('button',{name:'Delete saved project Earlier floor plan',exact:true}).click();
  await page.getByRole('button',{name:'Delete project',exact:true}).click();
  await page.locator('button[data-legacy]').waitFor({state:'detached'});
  check(await page.evaluate(async()=>!(await (await import(new URL('model.js',location.href))).storage.catalog()).some(project=>project.name==='Earlier floor plan')),'Earlier saved projects can also be deleted from the same list');
  await page.locator('#studio-info').click();
  await page.getByRole('button',{name:'Reset workspace',exact:true}).click();
  check(await page.locator('#dialog-title').textContent()==='Reset workspace?'&&(await page.locator('#dialog-body').textContent()).includes('Unsaved changes'),'Reset has its own confirmation explaining unsaved changes');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  check(await page.evaluate(()=>sparkWorkspace.project?.name==='Upper floor'),'Cancelling reset keeps the current drawing');
  const previousSession=await page.evaluate(async()=>(await sparkWorkspace.read({op:'state'})).session_id);
  await page.locator('#studio-info').click();
  await page.getByRole('button',{name:'Reset workspace',exact:true}).click();
  const nativePrompts=[],onNativePrompt=async dialog=>{nativePrompts.push(dialog.type());await dialog.dismiss();};page.on('dialog',onNativePrompt);
  await page.getByRole('button',{name:'Reset workspace',exact:true}).click();
  await page.waitForFunction(previous=>window.sparkWorkspace?.ready&&!sparkWorkspace.busy&&!sparkWorkspace.project&&sparkCadStudio.state?.session_id!==previous,previousSession,{timeout:120000});
  await page.locator('#electrical-nav').click();
  await page.locator('button[data-project]').filter({hasText:/^Upper floor/}).waitFor();
  check(!nativePrompts.length&&await page.evaluate(async previous=>(await sparkWorkspace.read({op:'state'})).session_id!==previous,previousSession),'Reset starts an empty fresh engine without a browser prompt and retains saved projects');
  page.off('dialog',onNativePrompt);
  await page.locator('button[data-project]').filter({hasText:/^Upper floor/}).click();await ready('Upper floor');
  await page.locator('#electrical-nav').click();
  await page.getByRole('button',{name:'Delete saved project Upper floor',exact:true}).click();
  check((await page.locator('#dialog-body').textContent()).includes('open drawing will close'),'Deleting an open project explains that its open drawing closes');
  await page.getByRole('button',{name:'Delete project',exact:true}).click();
  await page.waitForFunction(()=>!sparkWorkspace.project&&!sparkWorkspace.busy);
  await page.reload();await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});
  await page.locator('#electrical-nav').click();
  check(await page.locator('[data-project]').count()===0&&await page.locator('button[data-legacy]').count()===0,'Deleted projects stay removed after reload and are not opened again');

 }catch(error){
  console.log('Catalogue failure state: '+JSON.stringify(await page.evaluate(async()=>({busy:sparkWorkspace.busy,project:sparkWorkspace.project?.id,name:sparkWorkspace.project?.name,dialog:document.querySelector('#dialog-title').textContent,dialogOpen:document.querySelector('#dialog').open,toast:document.querySelector('#toast').textContent,requests:window.projectRequests?.filter(request=>request.op!=='state'),rows:[...document.querySelectorAll('[data-project]')].map(row=>({id:row.dataset.project,text:row.textContent})),state:await sparkWorkspace.read({op:'state'})})).catch(()=>null)));
  throw error;
 }finally{await context.close();}
};
