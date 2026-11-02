const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),{spawn}=require('node:child_process');
const {chromium}=createRequire(path.resolve('.out/qa/package.json'))('playwright'),out=path.resolve('.out/test-results');
const report={status:'RUNNING',checks:[]};let server,browser;
function check(value,label){assert(value,label);report.checks.push(label);console.log('PASS '+label);}
(async()=>{
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'cad-host-release.json'),JSON.stringify(report));
 server=spawn(process.execPath,['server.mjs'],{env:{...process.env,SPARK_WEB_ROOT:path.resolve('.out/site')},stdio:['ignore','pipe','pipe']});let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
 let ready=false;for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:5173/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}check(ready&&server.exitCode===null,'The owned host test server binds the fixed project port');
 browser=await chromium.launch({headless:true,args:['--force-device-scale-factor=2']});
 await require('./cad-workspace.cjs')({browser,baseUrl:'http://127.0.0.1:5173/spark/',fixture:path.resolve('.out/layer-fixture.dwg'),out,check});
 report.serverLog=serverLog;report.status='PASS';
})().catch(error=>{report.status='FAIL';report.failure=error.stack;process.exitCode=1;}).finally(async()=>{
 await browser?.close();if(server&&server.exitCode===null){server.kill();await new Promise(resolve=>server.once('exit',resolve));}
 await fs.writeFile(path.join(out,'cad-host-release.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
});
