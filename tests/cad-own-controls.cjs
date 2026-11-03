const fs=require('node:fs/promises'),path=require('node:path');
module.exports=async function verifyOwnControls({page,cad,check,out}){
 await page.setViewportSize({width:1440,height:1000});
 if(await page.locator('[data-cad-tab="Draw"]').getAttribute('aria-expanded')==='false')await page.locator('[data-cad-tab="Draw"]').click();
 const before=await cad({op:'query',type:'Line',detail:'geometry',limit:100});
 await page.locator('[data-cad-command="LINE"]').click();await page.waitForFunction(()=>!sparkWorkspace.busy);const lineStart=(await cad({op:'state'})).command;
 check(!!lineStart,'SparkWorld Line button starts the native drawing command');
 for(const value of ['100,100','900,300','']){await page.locator('#cad-own-input').fill(value);await page.locator('.cad-command-row button[type=submit]').click();await page.waitForFunction(()=>!sparkWorkspace.busy);}
 const after=await cad({op:'query',type:'Line',detail:'geometry',limit:100});const line=after.entities.find(e=>!before.entities.some(b=>b.handle===e.handle));
 check(after.count===before.count+1&&line.start[0]===100&&line.end[0]===900,'Own command fields create actual native CAD geometry');
 check(!(await cad({op:'state'})).command,'Enter completes the interactive command');
 await cad({op:'select',handles:[line.handle]},true);await page.waitForFunction(h=>sparkWorkspace.selection?.handle===h,line.handle);
 check(!await page.locator('#dialog').evaluate(d=>d.open),'Selection does not automatically open properties');
 await page.locator('#point-details').click();await page.waitForFunction(()=>document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='CAD properties');check((await page.locator('#dialog-title').textContent())==='CAD properties','Details opens SparkWorld native property controls');
 const field=page.locator('.cad-property-row').filter({has:page.locator('span',{hasText:/^Start X$/})}).locator('input');await field.fill('125');await page.screenshot({path:path.join(out,'cad-own-properties.png')});
 await page.locator('#dialog-actions button').filter({hasText:'Apply properties'}).click();await page.waitForFunction(()=>!sparkWorkspace.busy&&!document.querySelector('#dialog').open);
 check((await cad({op:'query',handles:[line.handle],detail:'geometry'})).entities[0].start[0]===125,'Own property editor updates the real CAD start coordinate');
 await page.locator('#cad-own-undo').click();await page.waitForFunction(()=>!sparkWorkspace.busy);check((await cad({op:'query',handles:[line.handle],detail:'geometry'})).entities[0].start[0]===100,'Own Undo reverses the native property change');
 await page.locator('#cad-own-redo').click();await page.waitForFunction(()=>!sparkWorkspace.busy);check((await cad({op:'query',handles:[line.handle],detail:'geometry'})).entities[0].start[0]===125,'Own Redo restores the property change');
 const beforePolylines=await cad({op:'query',type:'LwPolyline',detail:'geometry',limit:10000});
 await page.locator('[data-cad-command="PLINE"]').click();await page.waitForFunction(()=>!sparkWorkspace.busy);
 for(const value of ['100,500','300,500','300,700']){await page.locator('#cad-own-input').fill(value);await page.locator('.cad-command-row button[type=submit]').click();await page.waitForFunction(()=>!sparkWorkspace.busy);}
 const close=page.locator('.cad-command-options button').filter({hasText:/^Close$/});await close.waitFor();await close.click();await page.waitForFunction(()=>!sparkWorkspace.busy);
 const afterPolylines=await cad({op:'query',type:'LwPolyline',detail:'full',limit:10000}),polyline=afterPolylines.entities.find(e=>!beforePolylines.entities.some(b=>b.handle===e.handle));
 check(afterPolylines.count===beforePolylines.count+1&&polyline?.properties?.is_closed===true&&!(await cad({op:'state'})).command,'Own command option buttons close a real native polyline');
 if(await page.locator('[data-cad-tab="Modify"]').getAttribute('aria-expanded')==='false')await page.locator('[data-cad-tab="Modify"]').click();check(await page.locator('[data-cad-command="MOVE"]').isVisible(),'Own Modify tab exposes working native movement tools');
 await cad({op:'select',handles:[line.handle]},true);await page.locator('[data-cad-command="MOVE"]').click();await page.waitForFunction(()=>!sparkWorkspace.busy);
 for(const value of ['0,0','25,40']){await page.locator('#cad-own-input').fill(value);await page.locator('.cad-command-row button[type=submit]').click();await page.waitForFunction(()=>!sparkWorkspace.busy);}
 const movedLine=(await cad({op:'query',handles:[line.handle],detail:'geometry'})).entities[0];check(movedLine.start[0]===150&&movedLine.start[1]===140&&movedLine.end[0]===925,'Own Move tool and coordinate fields transform the selected native object');
 await page.locator('#cad-own-undo').click();await page.waitForFunction(()=>!sparkWorkspace.busy);check((await cad({op:'query',handles:[line.handle],detail:'geometry'})).entities[0].start[0]===125,'One Undo reverses the complete Move command');
 if(await page.locator('[data-cad-tab="Draw"]').getAttribute('aria-expanded')==='false')await page.locator('[data-cad-tab="Draw"]').click();await page.screenshot({path:path.join(out,'cad-own-controls-desktop.png')});
 const pending=page.waitForEvent('download');await page.locator('#studio-info').click();await page.locator('#dialog-actions button').filter({hasText:'Export DWG copy'}).click();const download=await pending;const exportPath=path.join(out,'cad-own-controls-roundtrip.dwg');await download.saveAs(exportPath);check((await fs.readFile(exportPath)).subarray(0,6).toString()==='AC1032','Own controls produce a genuine DWG 2018 export');
 await page.locator('#file-input').setInputFiles(exportPath);await page.waitForFunction(()=>!sparkWorkspace.busy&&sparkWorkspace.project?.original?.name==='cad-own-controls-roundtrip.dwg',{},{timeout:120000});
 const restored=(await cad({op:'query',handles:[line.handle],detail:'geometry'})).entities[0];check(restored?.start[0]===125&&restored?.end[0]===900,'Native line and property changes survive DWG reopen');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(800);await page.screenshot({path:path.join(out,'cad-own-controls-mobile.png')});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Own tool groups and command input fit the mobile page');
};
