const path=require('node:path');
module.exports=async({page,check,root,report,ready})=>{
 check(report.afterRefresh.project===null&&!report.afterRefresh.dialog&&!report.afterRefresh.progress,'Refresh starts empty without automatic CAD restoration or blocking dialog');
 check(await page.getByRole('button',{name:'Continue saved drawing',exact:true}).isVisible(),'Continuing the saved drawing is an optional homepage action');
 await page.getByRole('button',{name:'Continue saved drawing',exact:true}).click();await page.waitForFunction(id=>sparkWorkspace.project?.id===id&&!sparkWorkspace.busy,report.projectId,{timeout:120000});check(true,'Explicit Continue restores the same saved project');
 const original=await page.evaluate(async()=>({id:sparkWorkspace.project.id,revision:(await sparkWorkspace.read({op:'state'})).revision}));
 const presets=['classic','shelves','drawer','context','personal','morph','compass','direct','rooms','rings'];
 for(const[width,height,device]of [[1440,1000,'desktop'],[390,844,'mobile']]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  const gear=page.locator(width>580?'.ui-header-settings':'.ui-launchers [data-ui-settings]');await gear.click();const settings=page.locator('section.ui-lab');
  check(await settings.isVisible()&&await page.locator('dialog.ui-lab').count()===0,device+': settings expand without a modal or backdrop');
  check(await page.evaluate(()=>!document.querySelector('.studio-workspace').inert),device+': workspace remains interactive');
  for(const preset of presets){
   await page.locator(`[data-ui-preset=${preset}]`).click();await page.waitForFunction(id=>document.body.dataset.uiLayout===id,preset);await page.waitForTimeout(80);
   check(await page.evaluate(({preset,device})=>JSON.parse(localStorage.getItem('sparkworld-ui-v1'))[device].layout===preset,{preset,device}),device+': '+preset+' applies and saves immediately');
   if(['classic','shelves'].includes(preset))check(await page.locator('.cad-tool-tray:not([hidden])').count()===4,device+': '+preset+' exposes all four tool groups');
   else check(await page.locator('.ui-tool-surface').isVisible(),device+': '+preset+' opens its tool surface automatically');
   check(await page.locator('.studio-rail').evaluate(nav=>{const n=nav.getBoundingClientRect(),settings=document.querySelector('.ui-lab').getBoundingClientRect();return n.top>=settings.bottom-1||n.bottom<=settings.top;}),device+': '+preset+' navigation does not cover settings');
   check(await page.locator('.studio-frame-wrap').evaluate(el=>el.getBoundingClientRect().height>=100),device+': '+preset+' retains a usable canvas area');
   if(!['classic','shelves'].includes(preset))check(await page.locator('.ui-tool-surface').evaluate(menu=>{const m=menu.getBoundingClientRect(),c=document.querySelector('.cad-own-command').getBoundingClientRect();return !c.height||m.bottom<=c.top+1;}),device+': '+preset+' tool panel stays clear of command input');
  }
  await page.locator('.ui-lab-advanced summary').click();await page.locator('[data-ui-pref=theme]').selectOption('slate');check(await page.locator('body').getAttribute('data-ui-theme')==='slate',device+': theme changes live without Apply');
  await page.locator('[data-ui-pref=ringSize]').evaluate(el=>{el.value='360';el.dispatchEvent(new Event('input',{bubbles:true}));});check(await page.evaluate(device=>JSON.parse(localStorage.getItem('sparkworld-ui-v1'))[device].ringSize===360,device),device+': range input applies continuously');
  await page.locator('.ui-lab-advanced summary').click();await page.locator('[data-ui-preset][aria-pressed=true]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(root,'tests/workspace-ui-'+device+'.png')});
  await page.locator('[data-ui-close-settings]').click();check(!await settings.isVisible(),device+': collapse returns the space to the canvas');
 }
 check(await page.evaluate(async original=>sparkWorkspace.project.id===original.id&&(await sparkWorkspace.read({op:'state'})).revision===original.revision,original),'UI changes preserve the drawing identity and native undo revision');
 await page.reload();await ready();check(await page.locator('body').getAttribute('data-ui-theme')==='slate','Live preferences survive refresh');check(await page.evaluate(()=>!sparkWorkspace.project),'Refresh still does not force the drawing to reopen');
 await page.getByRole('button',{name:'Continue saved drawing',exact:true}).click();await page.waitForFunction(id=>sparkWorkspace.project?.id===id&&!sparkWorkspace.busy,original.id,{timeout:120000});check(true,'The saved project remains available after UI experiments and refresh');
 await page.evaluate(()=>sessionStorage.setItem('sparkworld-opening-drawing',JSON.stringify({name:'Interrupted drawing.dwg',stage:'Opening the CAD drawing'})));await page.reload();await ready();
 check(await page.locator('.cad-recent-drawing').isVisible()&&await page.evaluate(()=>!sparkWorkspace.project&&!document.querySelector('#dialog').open),'An interrupted opening gives an inline notice without forcing Restore or reopening CAD');
};
