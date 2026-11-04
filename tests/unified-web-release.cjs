// Verify the deployed subdirectory layout against the same owned workspace
// acceptance used locally, plus independent export, DXF and distribution gates.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{spawn,execFileSync}=require('node:child_process'),crypto=require('node:crypto');
const {chromium}=createRequire(path.resolve(process.env.SPARK_QA_PACKAGE||'.out/qa/package.json'))('playwright'),out=path.resolve(process.env.CODEX_TEST_OUTPUT||'.out/test-results');
const report={status:'RUNNING',checks:[],errors:[],external:[],escapedPrefix:[]};let server,browser,page;
let checkpoints=Promise.resolve();
const check=(pass,label)=>{report.checks.push({pass:!!pass,label});console.log((pass?'PASS ':'FAIL ')+label);const snapshot=JSON.stringify(report,null,2);checkpoints=checkpoints.then(()=>fs.writeFile(path.join(out,'unified-web-release.json'),snapshot));assert(pass,label);};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'unified-web-release.json'),JSON.stringify(report));
 if(process.env.SPARK_REUSE_SERVER!=='1'){
  server=spawn(process.execPath,['server.mjs'],{env:{...process.env,SPARK_WEB_ROOT:path.resolve('.out/site'),SPARK_ENGINE_ROOT:path.resolve('.out/site/engine'),SPARK_CAD_DLL:path.resolve('.out/cad/CadBridge.dll')},stdio:['ignore','pipe','pipe']});
  let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);report.serverLog=()=>log;
  let ready=false;for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:5173/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  check(ready&&server.exitCode===null,'The owned assembled release binds the fixed project port');
 }
 browser=await chromium.launch({headless:true,...(process.env.SPARK_CHROME?{executablePath:process.env.SPARK_CHROME}:{}),args:['--force-device-scale-factor=2','--disable-gpu-shader-disk-cache','--disk-cache-size=1048576']});
 process.env.SPARK_TEST_DPR='2';process.env.SPARK_HOSTED_RENDERER='1';
 await require('./cad-project-resume.cjs')({browser,baseUrl:'http://127.0.0.1:5173/spark/',check});
 await require('./cad-catalog.cjs')({browser,baseUrl:'http://127.0.0.1:5173/spark/',fixture:path.resolve(process.env.SPARK_FIXTURE||'.out/layer-fixture.dwg'),check});
 await require('./cad-context.cjs')({browser,baseUrl:'http://127.0.0.1:5173/spark/',fixture:path.resolve(process.env.SPARK_FIXTURE||'.out/layer-fixture.dwg'),out,check});
 await require('./cad-polling.cjs')({browser,baseUrl:'http://127.0.0.1:5173/spark/',fixture:path.resolve(process.env.SPARK_FIXTURE||'.out/layer-fixture.dwg'),out,check});
 await require('./cad-workspace.cjs')({browser,baseUrl:'http://127.0.0.1:5173/spark/',fixture:path.resolve(process.env.SPARK_FIXTURE||'.out/layer-fixture.dwg'),out,check});
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:2,serviceWorkers:'block',acceptDownloads:true});
 await require('./legacy-ui-profile.cjs')(context);
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(!['http:','https:'].includes(u.protocol))return r.continue();if(u.origin!=='http://127.0.0.1:5173'){report.external.push(u.origin);return r.abort();}if(!u.pathname.startsWith('/spark/')&&!u.pathname.startsWith('/api/'))report.escapedPrefix.push(u.pathname);return r.continue();});
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:5173/spark/');await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});
 check(await page.evaluate(()=>!window.fyp&&document.querySelectorAll('#cad-frame').length===1),'Published default URL opens one owned CAD workspace');
 const dxf='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n10\n20\n20\n30\n0\n11\n110\n21\n70\n31\n0\n0\nENDSEC\n0\nEOF\n';
 await page.locator('#file-input').setInputFiles({name:'Web DXF.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)});
 for(let n=0;n<4;n++){const r=await page.waitForFunction(()=>{if(document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice')return 'graphics';if(window.sparkWorkspace?.project?.working&&!sparkWorkspace.busy)return 'ready';},{},{timeout:120000});if(await r.jsonValue()==='ready')break;await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();}
 const lines=await page.evaluate(()=>sparkWorkspace.read({op:'query',type:'Line',detail:'geometry',limit:100}));check(lines.count===1&&lines.entities[0].start[0]===10&&lines.entities[0].end[1]===70,'Real DXF geometry imports through the owned main page');
 const downloading=page.waitForEvent('download');await page.locator('#studio-info').click();await page.locator('#dialog-actions button').filter({hasText:'Export DWG copy'}).click();const dl=await downloading,exportPath=path.join(out,'web-dxf-roundtrip.dwg');await dl.saveAs(exportPath);
 const raw=await fs.readFile(exportPath);check(raw.subarray(0,6).toString()==='AC1032','DXF work exports as genuine DWG 2018');
 const inspection=JSON.parse(execFileSync(process.env.SPARK_DOTNET||'dotnet',[process.env.SPARK_CAD_DLL||'.out/cad/CadBridge.dll','inspect','dwg'],{input:raw,maxBuffer:8*1024*1024}).toString());check(inspection.types.Line===1,'Independent CAD decoder verifies the exported DXF line');
 const lock=JSON.parse(await fs.readFile('tools/cad-host-component.json','utf8'));
 check(new URL(await page.locator('#cad-frame').getAttribute('src'),page.url()).searchParams.get('spark_core')===lock.integration_commit,'The native index URL pins the reviewed core so a stale cached viewport cannot mix API versions');
 const manifestResponse=await context.request.get('http://127.0.0.1:5173/spark/app/.component-manifest.json'),manifestBytes=await manifestResponse.body();check(manifestResponse.ok()&&hash(manifestBytes)===lock.manifest_sha256,'Served CAD manifest matches the exact reviewed component');
 const manifest=JSON.parse(manifestBytes);for(const [name,digest]of Object.entries(manifest.files)){const response=await context.request.get('http://127.0.0.1:5173/spark/app/'+name);assert(response.ok()&&hash(await response.body())===digest,'Changed served CAD file: '+name);}
 check(true,'Every served CAD component file matches its pinned SHA-256');
 await page.locator('#studio-info').click();const sourceOpening=context.waitForEvent('page');await page.getByRole('button',{name:'Source and licenses',exact:true}).click();const sourcePage=await sourceOpening;await sourcePage.waitForLoadState();check((await sourcePage.locator('body').textContent()).includes('GNU GPL'),'Engine license and source information remain accessible through the UI');await sourcePage.close();
 for(const name of ['cad-sources.html','app/LICENSE-GPL-3.0.txt','app/fonts/OFL.txt','app/SPARKWORLD-SOURCE.patch','app/SPARKWORLD-HOST.txt','licenses/PHOSPHOR.txt'])check((await context.request.get('http://127.0.0.1:5173/spark/'+name)).ok(),'Distributed source/notice exists: '+name);
 if(process.env.GITHUB_SHA){const version=await (await context.request.get('http://127.0.0.1:5173/spark/version.json')).json();check(version.commit===process.env.GITHUB_SHA&&version.cad_core===lock.integration_commit,'Release version names the exact UI commit and CAD core');}
 check(!report.external.length&&!report.escapedPrefix.length,'App and assets stay under the same /spark/ origin');check(!report.errors.length,'No unhandled release browser errors');report.status='PASS';await context.close();
})().catch(async error=>{report.status='FAIL';report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page){report.diagnostic=await Promise.race([page.evaluate(()=>({url:location.href,operation:document.querySelector('#studio-operation')?.textContent,toast:document.querySelector('#toast')?.textContent})).catch(()=>null),new Promise(r=>setTimeout(()=>r({timeout:true}),5000))]);await page.screenshot({path:path.join(out,'unified-web-failure.png'),timeout:5000}).catch(()=>{});}}).finally(async()=>{await browser?.close();if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}if(typeof report.serverLog==='function')report.serverLog=report.serverLog();await checkpoints;await fs.writeFile(path.join(out,'unified-web-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));});
