const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({browser,baseUrl,fixture,out,check})=>{
 const context=await browser.newContext({viewport:{width:1200,height:800},deviceScaleFactor:2,serviceWorkers:'block'});let page;
 try{
  await require('./legacy-ui-profile.cjs')(context);
  page=await context.newPage();await page.goto(baseUrl+'?workspace=cad&renderer=host');await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});await page.locator('#file-input').setInputFiles(fixture);
  for(let n=0;n<4;n++){const r=await page.waitForFunction(()=>document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice'?'graphics':sparkWorkspace.project?.working&&!sparkWorkspace.busy?'ready':false,{},{timeout:120000});if(await r.jsonValue()==='ready')break;await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();}
  const handle=await page.evaluate(async()=>{const row=(await sparkWorkspace.read({op:'query',type:'Circle',limit:1})).entities[0];await sparkWorkspace.mutate({op:'select',handles:[]});return row.handle;});await page.waitForFunction(()=>!sparkWorkspace.selection);
  await page.evaluate(()=>{const read=sparkCadStudio.read;window.pollReadTrace={active:0,max:0};sparkCadStudio.read=async request=>{const delayed=['state','query'].includes(request.op);if(delayed){pollReadTrace.active++;pollReadTrace.max=Math.max(pollReadTrace.max,pollReadTrace.active);}try{const result=await read(request);if(delayed)await new Promise(r=>setTimeout(r,1000));return result;}finally{if(delayed)pollReadTrace.active--;}};});
  await page.evaluate(h=>sparkWorkspace.mutate({op:'select',handles:[h]}),handle);
  await page.waitForFunction(h=>sparkWorkspace.selection?.handle===h,handle,{timeout:8000});
  check(true,'Slow native state and entity replies still reach the selected-object UI');
  check(await page.evaluate(()=>pollReadTrace.max===1),'Periodic workspace polling never overlaps its own native reads');
  check(!await page.locator('#dialog').evaluate(d=>d.open),'Slow selection remains highlight-only until explicit Details');
 }catch(e){if(page)await fs.writeFile(path.join(out,'cad-polling-failure.json'),JSON.stringify(await page.evaluate(()=>({trace:window.pollReadTrace,selection:sparkWorkspace.selection,busy:sparkWorkspace.busy})),null,2));throw e;}finally{await context.close();}
};
