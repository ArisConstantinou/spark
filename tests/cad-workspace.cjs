// Acceptance on the assembled main page and the pinned native CAD component.
const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async function verifyCadWorkspace({browser,baseUrl,fixture,out,check}){
 const report={errors:[],external:[]};let page,context;
 async function ready(){for(let i=0;i<4;i++){
  const outcome=await page.waitForFunction(()=>{const modal=document.querySelector('#dialog');if(modal?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice')return 'graphics';if(window.sparkWorkspace?.project?.working&&!sparkWorkspace.busy)return 'ready';},{},{timeout:120000});
  if(await outcome.jsonValue()==='ready')return;
  const state=await page.evaluate(()=>sparkWorkspace.read({op:'state'}));
  check(/GpuWarning/.test(JSON.stringify(state.modal)),'Main workspace only acknowledges the known CI graphics warning');
  await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
 }throw Error('The complete CAD project did not become ready.');}
 try{
 context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:Number(process.env.SPARK_TEST_DPR||1),serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(['http:','https:'].includes(u.protocol)&&u.origin!=='http://127.0.0.1:5173'){report.external.push(u.origin);return r.abort();}return r.continue();});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(baseUrl+'?workspace=cad'+(process.env.SPARK_HOSTED_RENDERER==='1'?'&renderer=host':''));await page.waitForFunction(()=>window.sparkWorkspace,{},{timeout:120000});
 const cad=(request,write=false)=>page.evaluate(({request,write})=>write?sparkWorkspace.mutate(request):sparkWorkspace.read(request),{request,write});
 await page.locator('#file-input').setInputFiles(fixture);
 await ready();
 const initial=await page.evaluate(()=>sparkWorkspace.project);report.initial={name:initial.name,definitions:Object.keys(initial.definitions.blocks).length,originalFormat:initial.original?.format};
 check(Object.keys(initial.definitions.blocks).length===13,'All electrical library definitions are prepared inside the main CAD document');
 check((await cad({op:'state'})).documents.filter(d=>!d.start).length===1,'Only one working native drawing remains after library preparation');
 check(await page.locator('.studio-rail button').count()===5,'Main workspace has five primary actions');
 check(page.url().includes('?workspace=cad')&&await page.locator('#cad-frame').count()===1,'One native CAD viewport runs inside the owned main workspace');
 await page.locator('#workspace-layers').click();await page.locator('#native-show-all').click();await page.waitForFunction(()=>!sparkWorkspace.busy);
 const allLayers=await cad({op:'records',collection:'layers',limit:10000});check(allLayers.records.every(r=>!r.properties.flags.off&&!r.properties.flags.frozen),'Reveal all unfreezes both parent and child block layers');
 await page.locator('#native-source-state').click();await page.waitForFunction(()=>!sparkWorkspace.busy);const restoredLayers=await cad({op:'records',collection:'layers',limit:10000});check(restoredLayers.records.some(r=>r.properties.flags.off)&&restoredLayers.records.some(r=>r.properties.flags.frozen),'Source state restores the original off and frozen layer flags');
 await page.locator('#workspace-panel-close').click();
 await page.locator('#fit').click();await page.locator('[data-place="double-socket"]').click();await page.waitForFunction(()=>!document.querySelector('#electrical-placement').hidden&&!sparkWorkspace.busy);
 const box=await page.locator('#electrical-placement').boundingBox();await page.mouse.click(box.x+box.width*.55,box.y+box.height*.5);
 await page.waitForFunction(()=>Object.keys(sparkWorkspace.project?.points||{}).length===1&&!sparkWorkspace.busy,{},{timeout:30000});
 const point=await page.evaluate(()=>Object.values(sparkWorkspace.project.points)[0]);const entity=(await cad({op:'query',handles:[point.handle],detail:'geometry'})).entities[0];
 check(entity?.type==='Block Reference','Palette click places a native socket block in the same CAD drawing');
 await cad({op:'undo'},true);check((await cad({op:'query',handles:[point.handle]})).entities.length===0,'One Undo removes the placed socket without exposing setup objects');
 await page.locator('#history-menu').click();await page.waitForFunction(()=>document.querySelector('.cad-circuit-stats')?.textContent.includes('0 electrical points'));check((await page.locator('.cad-circuit-stats').textContent()).includes('0 electrical points'),'Circuit count excludes a symbol removed by Undo');await page.locator('#workspace-panel-close').click();
 await cad({op:'redo'},true);check((await cad({op:'query',handles:[point.handle]})).entities.length===1,'One Redo restores the placed socket');
 await page.locator('#history-menu').click();await page.waitForFunction(()=>document.querySelector('.cad-circuit-stats')?.textContent.includes('1 electrical points'));check((await page.locator('.cad-circuit-stats').textContent()).includes('1 electrical points'),'Redo restores the actual circuit point count');await page.locator('#workspace-panel-close').click();
 await cad({op:'entities_transform',handles:[point.handle],action:'move',vector:[25,40]},true);
 await page.evaluate(()=>sparkWorkspace.save());
 await cad({op:'click',point:[entity.position[0]+25-160,entity.position[1]+40,0]},true);
 await page.waitForFunction(handle=>sparkWorkspace.selection?.handle===handle,point.handle);
 check(!(await page.locator('#dialog').evaluate(d=>d.open)),'Native selection highlights without opening a large properties dialog');
 await page.locator('#point-details').click();check((await page.locator('#dialog-title').textContent())==='Electrical point','Selection exposes electrical properties only through Details');
 await page.locator('#point-note').fill('Κουζίνα — δοκιμή κοινής αποθήκευσης');await page.locator('#dialog-actions button').filter({hasText:'Save properties'}).click();await page.waitForFunction(()=>!sparkWorkspace.busy&&!document.querySelector('#dialog').open);
 await page.screenshot({path:path.join(out,'cad-workspace-desktop.png')});
 await page.reload();await ready();
 check((await page.evaluate(()=>Object.values(sparkWorkspace.project.points)[0].note)).includes('Κουζίνα'),'Reload restores CAD geometry and electrical notes from one project');
 check(await page.evaluate(async()=>!sparkWorkspace.project.dirty&&sparkWorkspace.project.savedRevision===(await sparkWorkspace.read({op:'state'})).revision),'An untouched restored project has a clean saved state');
 const reopened=(await cad({op:'query',handles:[point.handle],detail:'geometry'})).entities[0];check(reopened.position[0]===entity.position[0]+25&&reopened.position[1]===entity.position[1]+40,'Native movement survives complete-project save and reload');
 if(process.env.SPARK_HOSTED_RENDERER==='1'){
 const state=await cad({op:'state'}),bounds=await page.locator('#cad-frame').boundingBox();check(state.hosted_view===true,'The compiled engine exposes the real viewport host mode');check(Math.abs(state.viewport_size[0]-bounds.width)<2&&Math.abs(state.viewport_size[1]-bounds.height)<2,'Native viewport fills the iframe without foreign chrome or cropping');
 check(await page.locator('[data-cad-document]').count()===1&&await page.locator('#cad-own-layout').isVisible(),'SparkWorld owns the open drawing tabs and layout selector');
 check(state.layouts.includes('Layout1'),'The source paper layout remains available through the host interface');
 await page.locator('#cad-own-layout').selectOption('Layout1');await page.waitForFunction(()=>!sparkWorkspace.busy&&sparkWorkspace.project?.activeLayout==='Layout1');
 check((await cad({op:'state'})).layout==='Layout1','Own layout selector activates the real source paper layout');
 await page.reload();await ready();check((await cad({op:'state'})).layout==='Layout1','Reload preserves the saved source layout');
 await page.locator('#cad-own-layout').selectOption('Model');await page.waitForFunction(()=>!sparkWorkspace.busy&&sparkWorkspace.project?.activeLayout==='Model');
 await page.screenshot({path:path.join(out,'cad-workspace-full-tools.png')});
 }else{
 await page.locator('#studio-info').click();await page.locator('#dialog-actions button').filter({hasText:'Show / hide full CAD tools'}).click();await page.waitForFunction(()=>!sparkCadStudio.compact&&!sparkCadStudio.busy);await page.screenshot({path:path.join(out,'cad-workspace-full-tools.png')});
 check(!await page.evaluate(()=>sparkCadStudio.compact),'Full native CAD tools remain accessible on the same main page');
 }
 const downloading=page.waitForEvent('download');await page.locator('#studio-info').click();await page.locator('#dialog-actions button').filter({hasText:'Export DWG copy'}).click();const download=await downloading;await download.saveAs(path.join(out,'cad-workspace-roundtrip.dwg'));const dwg=await fs.readFile(path.join(out,'cad-workspace-roundtrip.dwg'));check(dwg.subarray(0,6).toString()==='AC1032','Main workspace exports a genuine DWG 2018 copy');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(700);await page.locator('#fit').click();await page.screenshot({path:path.join(out,'cad-workspace-mobile.png')});
 const bounds=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,nav:[...document.querySelectorAll('.studio-rail button')].map(b=>b.getBoundingClientRect().toJSON())}));check(!bounds.overflow&&bounds.nav.every(b=>b.height>=44&&b.x>=0&&b.right<=390),'Mobile has five usable bottom actions without page overflow');
 await require('./cad-own-controls.cjs')({page,cad,check,out});
 await require('./cad-annotations.cjs')({page,cad,check,out});
 check(report.errors.length===0,'No unhandled browser errors');check(report.external.length===0,'No external requests or drawing uploads');report.status='PASS';
 }catch(error){
  const diagnostic=await page?.evaluate(async()=>{const s=await window.sparkWorkspace?.read({op:'state'});return{url:location.href,operation:document.querySelector('#studio-operation')?.textContent,toast:document.querySelector('#toast')?.textContent,layout:s?.layout,command:s?.command,modal:s?.modal,hosted:s?.hosted_view};}).catch(()=>null);
  await page?.screenshot({path:path.join(out,'cad-workspace-failure.png')}).catch(()=>{});
  throw Error(error.stack+'\nWorkspace diagnostic: '+JSON.stringify(diagnostic));
 }finally{await context?.close();}
};
