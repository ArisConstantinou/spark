// Lazy definitions must remain real, editable native blocks for every palette item.
module.exports=async({page,cad,check})=>{
 await page.evaluate(()=>sparkWorkspace.newDrawing());
 await page.locator('#fit').click();
 const types=await page.locator('[data-place]').evaluateAll(buttons=>buttons.map(button=>button.dataset.place));
 await page.locator('#workspace-panel-close').click();
 for(const [index,type] of types.entries()){
  await page.locator('#fit').click();await page.locator(`[data-place="${type}"]`).click();
  await page.waitForFunction(()=>!sparkWorkspace.busy&&!document.querySelector('#electrical-placement').hidden);
  const box=await page.locator('#electrical-placement').boundingBox();await page.mouse.click(box.x+box.width*(.3+(index%3)*.18),box.y+box.height*(.28+Math.floor(index/3)*.09));
  await page.waitForFunction(count=>!sparkWorkspace.busy&&Object.keys(sparkWorkspace.project.points).length===count,index+1,{timeout:60000});
 }
 const points=await page.evaluate(()=>Object.values(sparkWorkspace.project.points)),entities=(await cad({op:'query',handles:points.map(point=>point.handle),detail:'geometry',limit:100})).entities;
 check(entities.length===13&&entities.every(entity=>entity.type==='Block Reference'),'Every one of the 13 palette actions places a real native block');
 const definitions=await page.evaluate(()=>sparkWorkspace.project.definitions.blocks);
 check(entities.every(entity=>entity.block===definitions[points.find(point=>point.handle===entity.handle).type]),'Every placed symbol stays bound to its own correct native definition');
 // Hexadecimal handles that contain only digits are integer object keys.
 // Object.values therefore does not preserve creation order. Follow the
 // final explicit palette action instead of guessing from metadata order.
 const last=points.find(point=>point.type===types.at(-1));
 await cad({op:'undo'},true);
 const afterUndo=(await cad({op:'query',handles:[last.handle],detail:'geometry'})).entities;
 check(!afterUndo.some(entity=>entity.type==='Block Reference'&&entity.block===definitions[last.type]),'Undo removes the final placed symbol before serialization');
 await page.evaluate(()=>sparkWorkspace.save());
 await page.reload();
 await require('./continue-saved.cjs')(page);
 for(let i=0;i<4;i++){
  const ready=await page.waitForFunction(()=>{if(document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice')return 'graphics';if(window.sparkWorkspace?.project?.working&&!sparkWorkspace.busy)return 'ready';},{},{timeout:120000});
  if(await ready.jsonValue()==='ready')break;
  await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
 }
 const restored=(await cad({op:'query',handles:[last.handle],detail:'geometry'})).entities;
 check(!restored.some(entity=>entity.type==='Block Reference'&&entity.block===definitions[last.type]),'Saving and reloading an undone first placement does not resurrect its geometry');
 await page.locator('#fit').click();await page.locator(`[data-place="${last.type}"]`).click();await page.waitForFunction(()=>!sparkWorkspace.busy&&!document.querySelector('#electrical-placement').hidden);
 const box=await page.locator('#electrical-placement').boundingBox();await page.mouse.click(box.x+box.width*.6,box.y+box.height*.7);await page.waitForFunction(()=>!sparkWorkspace.busy&&document.querySelector('#electrical-placement').hidden,{},{timeout:60000});
 const current=await page.evaluate(()=>sparkWorkspace.project),rows=(await cad({op:'records',collection:'block_records',limit:10000})).records;
 check(rows.filter(row=>(row.properties?.name||row.name)===current.definitions.blocks[last.type]).length===1,'A subsequent placement recreates the undone definition once after reload');
};
