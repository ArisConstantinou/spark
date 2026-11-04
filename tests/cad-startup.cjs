// Check mobile layout before native initialization, failure recovery, and a real import.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{spawn}=require('node:child_process');
const browserName=process.env.SPARK_BROWSER||'chromium',playwright=createRequire(path.resolve('.out/qa/package.json'))('playwright'),out=path.resolve('.out/test-results');
const report={browser:browserName,status:'RUNNING',checks:[]};let browser,server,page;
const check=(pass,label)=>{assert(pass,label);report.checks.push(label);console.log('PASS '+label);};
const base='http://127.0.0.1:5173/spark/';
const dxf='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n10\n20\n20\n30\n0\n11\n110\n21\n70\n31\n0\n0\nENDSEC\n0\nEOF\n';
async function ready(){for(let i=0;i<4;i++){
 const result=await page.waitForFunction(()=>document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice'?'graphics':window.sparkWorkspace?.ready&&!sparkWorkspace.busy?'ready':false,null,{timeout:135000});
 if(await result.jsonValue()==='ready')return;
 await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
}throw Error('The CAD workspace did not become ready');}
(async()=>{
 await fs.mkdir(out,{recursive:true});
 if(process.env.SPARK_REUSE_SERVER!=='1'){
  server=spawn(process.execPath,['server.mjs'],{env:{...process.env,SPARK_WEB_ROOT:path.resolve('.out/site')},stdio:['ignore','pipe','pipe']});
  for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  check(server.exitCode===null,'The startup test owns its server');
 }
 browser=await playwright[browserName].launch({headless:true,...(browserName==='chromium'&&process.env.SPARK_CHROME?{executablePath:process.env.SPARK_CHROME}:{})});
 const mobile={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'};
 const context=await browser.newContext(mobile),errors=[];let releaseDownload;
 const download=new Promise(resolve=>releaseDownload=resolve);
 await context.route('**/*_bg.wasm',async route=>{if(route.request().method()==='GET')await download;await route.continue();});
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base,{waitUntil:'commit'});await page.locator('#studio-loading').waitFor();
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  check(await page.locator('.header-actions button').evaluateAll(buttons=>{
   const boxes=buttons.map(button=>button.getBoundingClientRect());
   return boxes.length===2&&boxes.every(box=>box.width>=44&&box.left>=0&&box.right<=innerWidth)&&boxes[1].left-boxes[0].right>=4&&buttons.every(button=>button.querySelector('svg')&&button.scrollWidth<=button.clientWidth);
  }),'Open and Save are separate icon buttons before CAD is ready at '+width+'px');
 }
 await page.screenshot({path:path.join(out,'cad-startup-'+browserName+'.png')});
 releaseDownload();await ready();
 check(await page.locator('#import').isEnabled(),'The real engine finishes startup and enables Open drawing');
 const choosing=page.waitForEvent('filechooser');await page.locator('#import').click();
 await (await choosing).setFiles({name:'Startup drawing.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)});
 await page.waitForFunction(()=>sparkWorkspace.busy||sparkWorkspace.project);await ready();
 await page.waitForFunction(()=>sparkWorkspace.project?.name==='Startup drawing'&&!sparkWorkspace.busy);
 check(await page.evaluate(async()=>(await sparkWorkspace.read({op:'query',type:'Line',detail:'geometry'})).entities.some(entity=>entity.start[0]===10&&entity.end[1]===70)),'A drawing chosen through the mobile Open button reaches the real CAD engine');
 await page.reload({waitUntil:'commit'});await ready();
 check(await page.evaluate(()=>sparkWorkspace.project?.name==='Startup drawing'),'A cached startup restores the saved drawing');
 check(!errors.length,'Healthy startup and import have no unhandled browser errors');
 await context.close();

 const missing=await browser.newContext(mobile);let unavailable=true;
 await missing.route('**/.component-manifest.json',route=>unavailable?route.fulfill({status:404,body:'Missing component'}):route.continue());
 page=await missing.newPage();await page.goto(base,{waitUntil:'commit'});await page.locator('#retry-cad').waitFor({state:'visible'});
 check(await page.locator('#studio-loading .spinner').isHidden()&&await page.locator('#import').isDisabled(),'Missing engine files produce a retry screen instead of an endless spinner or false readiness');
 unavailable=false;await page.locator('#retry-cad').click();await ready();
 check(await page.locator('#import').isEnabled(),'Retry recovers when the engine files become available');
 await missing.close();

 const stalled=await browser.newContext(mobile);page=await stalled.newPage();await page.clock.install();
 await stalled.route('**/app/index.html?*',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Engine stalled</title>'}));
 await page.goto(base,{waitUntil:'commit'});await page.waitForFunction(()=>document.querySelector('#cad-frame')?.src.includes('spark_core='));
 await page.clock.fastForward(121000);await page.locator('#retry-cad').waitFor({state:'visible'});
 check(await page.locator('#studio-loading p').textContent().then(text=>text.includes('did not finish loading'))&&await page.locator('#studio-loading .spinner').isHidden(),'A loaded page with no native bridge fails within the startup deadline');
 await stalled.close();report.status='PASS';
})().catch(async error=>{
 report.status='FAIL';report.error=error.stack;console.error(error.stack);process.exitCode=1;
 if(page){report.diagnostic=await page.evaluate(()=>({loading:document.querySelector('#studio-loading')?.textContent,status:document.querySelector('#studio-operation')?.textContent,ready:window.sparkWorkspace?.ready,engine:window.sparkCadStudio?.state})).catch(()=>null);await page.screenshot({path:path.join(out,'cad-startup-failure-'+browserName+'.png'),timeout:5000}).catch(()=>{});}
}).finally(async()=>{
 await browser?.close();if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
 await fs.writeFile(path.join(out,'cad-startup-'+browserName+'.json'),JSON.stringify(report,null,2));
 await fs.writeFile(path.join(out,'cad-startup-'+browserName+'.md'),'## '+browserName+' startup: '+report.status+'\n\n'+report.checks.map(label=>'- '+label).join('\n')+(report.error?'\n\n```\n'+report.error+'\n'+JSON.stringify(report.diagnostic,null,2)+'\n```':'')+'\n');
 console.log(JSON.stringify(report));
});
