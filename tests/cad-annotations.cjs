const path=require('node:path');
module.exports=async function verifyAnnotations({page,cad,check,out}){
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#cad-tool-group-toggle').click();await page.locator('[data-cad-tab="Annotate"]').click();
 const count=(await cad({op:'query',type:'MText',limit:10000})).count;
 await page.locator('[data-cad-command="MTEXT"]').click();
 await page.waitForFunction(()=>document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='Multiline text');
 let state=await cad({op:'state'});check(!state.mtext_editor&&!state.text_editor&&!state.command,'Multiline tool opens the SparkWorld form without a native editor');
 await page.getByRole('button',{name:'Create at coordinates',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Enter the text to add.'));
 check(await page.locator('#dialog').evaluate(el=>el.open),'Empty text is rejected without closing the form');
 const value='Κουζίνα\n\\LΠρίζες\\l';await page.locator('#cad-text-value').fill(value);await page.locator('#cad-text-height').fill('20');await page.locator('#cad-text-width').fill('300');
 await page.locator('.cad-text-editor details>summary').click();await page.locator('#cad-text-x').fill('100');await page.locator('#cad-text-y').fill('200');
 await page.screenshot({path:path.join(out,'cad-own-text-desktop.png')});
 await page.getByRole('button',{name:'Create at coordinates',exact:true}).click();await page.waitForFunction(()=>!sparkWorkspace.busy&&!document.querySelector('#dialog').open);
 const rows=await cad({op:'query',type:'MText',detail:'full',limit:10000}),entity=rows.entities.find(e=>JSON.stringify(e).includes('Κουζίνα'));
 check(rows.count===count+1&&entity&&JSON.stringify(entity).includes('Πρίζες'),'Own text form creates real Greek multiline CAD text');
 const exact=JSON.stringify(entity);
 await page.locator('#cad-own-undo').click();await page.waitForFunction(()=>!sparkWorkspace.busy);
 check((await cad({op:'query',handles:[entity.handle]})).entities.length===0,'One Undo removes the complete text annotation');
 await page.locator('#cad-own-redo').click();await page.waitForFunction(()=>!sparkWorkspace.busy);
 check(JSON.stringify((await cad({op:'query',handles:[entity.handle],detail:'full'})).entities[0])===exact,'Redo preserves the complete native text and formatting');
 await page.locator('#cad-own-input').fill('TEXT');await page.locator('.cad-command-row button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='Drawing text');
 check(!(await cad({op:'state'})).text_editor,'Typed TEXT also uses our editor');
 await page.setViewportSize({width:390,height:844});await page.locator('#cad-text-value').fill('Φωτισμός');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#dialog').getBoundingClientRect().right<=innerWidth),'Text form fits the mobile viewport');
 await page.screenshot({path:path.join(out,'cad-own-text-mobile.png')});
 await page.getByRole('button',{name:'Place on drawing',exact:true}).click();
 const overlay=page.locator('.cad-text-placement'),box=await overlay.boundingBox(),before=(await cad({op:'query',type:'Text',limit:10000})).count;
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.6);await page.mouse.up();
 check((await cad({op:'query',type:'Text',limit:10000})).count===before,'Dragging during text placement creates no phantom text');
 const touch=await page.context().newCDPSession(page),x=box.x+box.width*.5,y=box.y+box.height*.65;
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y},{id:2,x:x+40,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id:2,x:x+40,y}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
 check((await cad({op:'query',type:'Text',limit:10000})).count===before,'Two fingers and finger liftoff create no phantom annotation');
 await page.mouse.click(box.x+box.width*.5,box.y+box.height*.6);await page.waitForFunction(()=>document.querySelector('.cad-text-placement').hidden&&!sparkWorkspace.busy);
 const single=(await cad({op:'query',type:'Text',detail:'full',limit:10000})).entities.find(e=>JSON.stringify(e).includes('Φωτισμός'));
 check(single,'A fresh tap places actual CAD text without the old inline editor');
 state=await cad({op:'state'});check(!state.text_editor&&!state.mtext_editor,'Both annotation workflows leave no native text editor open');
 await page.evaluate(()=>sparkWorkspace.save());await page.reload();
 let restoredReady=false;
 for(let attempt=0;attempt<4;attempt++){
  const outcome=await page.waitForFunction(()=>{if(document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice')return 'graphics';if(window.sparkWorkspace?.ready&&sparkWorkspace.project?.working&&!sparkWorkspace.busy)return 'ready';},{},{timeout:120000});
  if(await outcome.jsonValue()==='ready'){restoredReady=true;break;}
  const notice=await cad({op:'state'});check(/GpuWarning/.test(JSON.stringify(notice.modal)),'Reload only acknowledges the known headless graphics warning');
  await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
 }
 check(restoredReady,'Text project restore completes after its explicit graphics notice');
 const restored=(await cad({op:'query',handles:[entity.handle],detail:'full'})).entities[0];
 // The DWG writer resolves optional layer references, entity space and X-axis
 // direction on first serialization. Verify those derived fields separately;
 // compare all other entity data, including raw formatting and geometry, exactly.
 const stable=value=>{const e=structuredClone(value);delete e.properties.common.entity_mode;delete e.properties.common.layer_handle;delete e.properties.dwg_x_direction;return JSON.stringify(e);};
 check(stable(restored)===stable(entity),'Native multiline contents, formatting and geometry survive project reload');
 const layer=(await cad({op:'records',collection:'layers',limit:10000})).records.find(r=>r.name===entity.layer);
 check(restored.properties.common.entity_mode===2&&restored.properties.common.layer_handle===parseInt(layer.handle,16)&&JSON.stringify(restored.properties.dwg_x_direction)==='{"x":1,"y":0,"z":0}','DWG serialization resolves the correct Model space, layer handle and text direction');
 check((await cad({op:'query',handles:[single.handle]})).entities.length===1,'Placed single-line text survives native save and reopen');
 await page.setViewportSize({width:1440,height:1000});
 await cad({op:'select',handles:[entity.handle]},true);await page.waitForFunction(handle=>sparkWorkspace.selection?.handle===handle,entity.handle);
 const camera=(await cad({op:'state'})).camera,box2=await page.locator('#cad-frame').boundingBox(),unit=2*camera.distance*Math.tan(camera.fov_y/2)/box2.height;
 await page.mouse.dblclick(box2.x+box2.width/2+(110-camera.target[0])/unit,box2.y+box2.height/2-(210-camera.target[1])/unit,{delay:100});
 await page.waitForFunction(()=>document.querySelector('#dialog').open&&document.querySelector('#dialog-title').textContent==='CAD properties');
 state=await cad({op:'state'});check(!state.text_editor&&!state.mtext_editor,'Mouse double-click opens owned Details instead of the native text window');
 await page.locator('#dialog-close').click();
 await page.locator('#cad-tool-group-toggle').click();await page.locator('[data-cad-tab="Draw"]').click();
};
