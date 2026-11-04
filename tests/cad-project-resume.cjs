// Keep the user's selected drawing across multi-document saves and reloads.
// Imports and storage use the real pinned CAD engine and browser IndexedDB.
module.exports=async function verifyProjectResume({browser,baseUrl,check}){
 const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'}),errors=[];
 try{
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseUrl);await page.waitForFunction(()=>window.sparkWorkspace?.ready,null,{timeout:120000});
  async function ready(name){for(let i=0;i<4;i++){
   const result=await page.waitForFunction(name=>document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice'?'graphics':window.sparkWorkspace?.ready&&(name===undefined||sparkWorkspace.project?.name===name)&&!sparkWorkspace.busy?'ready':false,name,{timeout:120000});
   if(await result.jsonValue()==='ready')return;
   await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
  }throw Error('The saved drawing did not become ready');}
  const dxf='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n10\n20\n20\n30\n0\n11\n110\n21\n70\n31\n0\n0\nENDSEC\n0\nEOF\n';
  const ids={};
  for(const name of ['Ground floor','Upper floor']){
   await page.locator('#file-input').setInputFiles({name:name+'.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)});await ready(name);
   ids[name]=await page.evaluate(()=>sparkWorkspace.project.id);
  }
  await page.locator('[data-cad-document]').filter({hasText:/^Ground floor/}).click();await ready('Ground floor');
  const handle=await page.evaluate(async()=>{const reply=await sparkWorkspace.mutate({op:'entities_create',entities:[{type:'Line',start:[200,300,0],end:[400,500,0],layer:'0'}]});return (reply.result||reply).handles[0];});
  await page.evaluate(()=>sparkWorkspace.save());
  check(await page.evaluate(id=>sparkWorkspace.project.id===id&&localStorage.getItem('sparkworld-cad-active')===id,ids['Ground floor']),'Saving all open drawings retains the selected project as the reload target');
  const failure=await page.evaluate(async failingId=>{
   const {projectStore}=await import(new URL('workspace-store.js',location.href)),save=projectStore.save;
   projectStore.save=project=>project.id===failingId?Promise.reject(Error('Injected project storage failure')):save(project);
   try{await sparkWorkspace.save();return null;}catch(error){return error.message;}finally{projectStore.save=save;}
  },ids['Upper floor']);
  check(failure==='Injected project storage failure','A failed multi-document save reports the underlying storage failure');
  check(await page.evaluate(id=>sparkWorkspace.project.id===id&&localStorage.getItem('sparkworld-cad-active')===id,ids['Ground floor']),'A failed save restores the original drawing and reload target');
  await page.evaluate(()=>sparkWorkspace.save());
  await page.locator('[data-cad-document]').filter({hasText:/^Ground floor/}).click();await ready('Ground floor');
  await page.locator('[data-cad-document]').filter({hasText:/^Upper floor/}).click();await ready('Upper floor');
  if(!await page.locator('#electrical-nav').isVisible())await page.getByRole('button',{name:'Show workspace navigation',exact:true}).click();
  await page.locator('#electrical-nav').click();await page.locator('button[data-project]').filter({hasText:/^Ground floor/}).click();
  await page.getByRole('button',{name:'Show existing drawing',exact:true}).click();await ready('Ground floor');
  check(await page.evaluate(id=>sparkWorkspace.project.id===id&&localStorage.getItem('sparkworld-cad-active')===id,ids['Ground floor']),'Showing an existing drawing remembers that project for the next visit');
  check(await page.evaluate(async()=>(await sparkWorkspace.read({op:'state'})).documents.filter(document=>!document.start).length===2),'Returning to an existing project keeps exactly the two original native drawings');
  await page.reload();await ready();
  check(await page.evaluate(async({id,handle})=>sparkWorkspace.project?.id===id&&(await sparkWorkspace.read({op:'query',handles:[handle],detail:'geometry'})).entities.some(entity=>entity.start?.[0]===200&&entity.end?.[1]===500),{id:ids['Ground floor'],handle}),'Reload opens the selected project with its saved native edits');
  check(!errors.length,'Project resume and failed-save recovery have no unhandled browser errors');
 }finally{await context.close();}
};
