// Independent DWG/DXF frame regression on authored data only. Uses the SAME
// .out/site/app before/after compilation, not a second candidate build.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process'),{createRequire}=require('node:module');
const {chromium}=createRequire(path.resolve('.out/qa/package.json'))('playwright');
const beforeMode=process.argv.includes('--expect-frame-failure'),out=path.resolve('.out/test-results'),fixture=path.resolve('.out/mtext-frame-fixture.dwg');
const report={status:'RUNNING',phase:beforeMode?'before':'after',checks:[],errors:[],external:[]};let browser,context,server;
const check=(value,label)=>{report.checks.push({pass:!!value,label});assert(value,label);console.log('PASS '+label);};
async function main(){
 await fs.mkdir(out,{recursive:true});
 const bytes=await fs.readFile(fixture),sourceHash=crypto.createHash('sha256').update(bytes).digest('hex');
 server=spawn(process.execPath,['server.mjs'],{env:{...process.env,SPARK_WEB_ROOT:path.resolve('.out/site')},stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5173/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}check(ready&&server.exitCode===null,'Regression uses the owned fixed-port server');
 browser=await chromium.launch({headless:true,args:['--force-device-scale-factor=1']});context=await browser.newContext({viewport:{width:1100,height:700},deviceScaleFactor:1,serviceWorkers:'block'});
 await context.addInitScript(()=>localStorage.setItem('opencadstudio.automation','1'));
 await context.route('**/*',r=>{const q=r.request(),u=new URL(q.url());if(['http:','https:'].includes(u.protocol)&&(u.origin!=='http://127.0.0.1:5173'||!['GET','HEAD'].includes(q.method())||q.postData())){report.external.push(u.origin);return r.abort();}return r.continue();});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:5173/spark/app/index.html?spark_host=1');await page.waitForFunction(()=>window.ocsControl&&window.wasmBindings?.ocs_control_submit,{},{timeout:120000});
 const call=(request,write=false)=>page.evaluate(async({request,write})=>{const invoke=async value=>{const reply=await ocsControl.request(value,{timeoutMs:180000});if(!reply.ok)throw Error(reply.message||JSON.stringify(reply));return reply;};if(write){const state=await invoke({op:'state'});request={...request,request_id:crypto.randomUUID(),document_id:state.document_id,revision:state.revision};}return invoke(request);},{request,write});
 const initial=await call({op:'state'});if(initial.modal){check(/GpuWarning/.test(JSON.stringify(initial.modal)),'Only the known software graphics warning is acknowledged');await call({op:'action',name:'close_modal'},true);}
 await call({op:'open',name:'Authored MTEXT frames.dwg',data_base64:bytes.toString('base64')},true);
 const texts=await call({op:'query',type:'MText',detail:'full',limit:1000});check(texts.count===6,'Native import contains every authored control and framed MTEXT');check(texts.entities.filter(e=>e.properties.background_fill_flags===16).length===3,'Frame-only flags remain16, including the nested block text');
 report.comparisons={};
 for(const format of ['dwg','dxf']){
  const saved=await call({op:'save',name:'mtext-frame-roundtrip.'+format,target_format:format,target_version:'AC1032'},true),result=saved.result||saved;check(!result.dropped_on_save&&typeof result.data_base64==='string','Native '+format+' export reports no dropped records');
  const file=path.join(out,'mtext-frame-roundtrip.'+format);await fs.writeFile(file,Buffer.from(result.data_base64,'base64'));
  const value=execFileSync('dotnet',['run','--no-build','--project','cad-tests/SparkWorld.CadTests.csproj','-c','Release','--','--mtext-compare',fixture,file],{encoding:'utf8'});report.comparisons[format]=JSON.parse(value);
 }
 const {dwg,dxf}=report.comparisons;check(dxf.status==='PASS'&&dxf.before===6&&dxf.after===6,'Independent decoder retains every DXF text, flag, owner and checked geometric field');
 if(beforeMode){check(dwg.status==='FAIL'&&dwg.missing.length+dwg.changed.length>0&&[...dwg.missing,...dwg.changed].every(e=>e.Flags===16)&&!dwg.extra.length,'Released core reproduces only the expected frame-only DWG loss or field misalignment');report.status='EXPECTED_FRAME_FAILURE';}
 else{check(dwg.status==='PASS'&&dwg.before===6&&dwg.after===6,'Independent DWG reopen retains all framed texts without changing controls or flags');report.status='PASS';}
 check(crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex')===sourceHash,'Original authored source remains unchanged');check(!report.errors.length&&!report.external.length,'No browser errors, external requests or drawing uploads');report.serverLog=log;
}
main().catch(error=>{report.status='FAIL';report.failure=error.stack;process.exitCode=1;}).finally(async()=>{await context?.close();await browser?.close();if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}await fs.writeFile(path.join(out,'mtext-frame-'+report.phase+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));});
