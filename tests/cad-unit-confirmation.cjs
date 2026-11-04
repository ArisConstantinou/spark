// A visible units prompt must already be usable, even with a slow native reply.
module.exports=async({browser,baseUrl,out,check,suffix='after'})=>{
 const path=require('node:path'),context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});let page;
 try{
  await context.route('**/*',route=>{const r=route.request(),u=new URL(r.url());return ['http:','https:'].includes(u.protocol)&&(u.origin!==new URL(baseUrl).origin||!['GET','HEAD'].includes(r.method()))?route.abort():route.continue();});
  page=await context.newPage();await page.goto(baseUrl);await page.waitForFunction(()=>window.sparkWorkspace?.ready,null,{timeout:120000});
  const dxf='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n7\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n100\n21\n100\n0\nENDSEC\n0\nEOF\n';
  await page.locator('#file-input').setInputFiles({name:'Unit confirmation.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)});
  for(let i=0;i<4;i++){const r=await page.waitForFunction(()=>document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='CAD graphics notice'?'graphics':sparkWorkspace.project?.working&&!sparkWorkspace.busy?'ready':false,null,{timeout:120000});if(await r.jsonValue()==='ready')break;const state=await page.evaluate(()=>sparkWorkspace.read({op:'state'}));if(state.modal!=='GpuWarning')throw Error('Unexpected CAD notice');await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();}
  await page.evaluate(()=>{const original=sparkCadStudio.read;sparkCadStudio.read=async function(request,...args){const result=await original(request,...args);if(request.op==='state'&&document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='Drawing units')await new Promise(r=>setTimeout(r,300));return result;};});
  await page.locator('#fit').click();await page.locator('[data-place="double-socket"]').click();await page.getByRole('button',{name:'Confirm units',exact:true}).waitFor();
  check(await page.locator('#cad-unit-choice').inputValue()==='7','The unusual source units are shown without guessing a replacement');
  await page.getByRole('button',{name:'Confirm units',exact:true}).click();
  try{await page.waitForFunction(()=>!sparkWorkspace.busy&&!document.querySelector('#electrical-placement').hidden,null,{timeout:5000});}catch{throw Error('Confirm units did not continue electrical placement: '+await page.locator('#toast').textContent());}
  check(await page.evaluate(()=>sparkWorkspace.project.units===7&&sparkWorkspace.project.unitsConfirmed),'One confirmation preserves the chosen units and starts placement');
  check(!await page.locator('#dialog').evaluate(d=>d.open),'No stale confirmation dialog covers the placement surface');
  await page.screenshot({path:path.join(out,'cad-unit-confirmation-'+suffix+'.png')});
 }catch(error){await page?.screenshot({path:require('node:path').join(out,'cad-unit-confirmation-'+suffix+'.png')}).catch(()=>{});throw error;}finally{await context.close();}
};
