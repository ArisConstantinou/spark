// Opening another file saves pending edits, not every unchanged CAD payload.
module.exports=async function verifyOpenSaves({browser,baseUrl,check}){
 const context=await browser.newContext({viewport:{width:1200,height:800},serviceWorkers:'block'}),errors=[];
 try{
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(baseUrl);await page.waitForFunction(()=>window.sparkWorkspace?.ready,null,{timeout:120000});
  const dxf='0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n10\n20\n20\n30\n0\n11\n110\n21\n70\n31\n0\n0\nENDSEC\n0\nEOF\n';
  async function ready(name){for(let i=0;i<4;i++){
   const result=await page.waitForFunction(name=>document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title')?.textContent==='CAD graphics notice'?'graphics':window.sparkWorkspace?.ready&&sparkWorkspace.project?.name===name&&!sparkWorkspace.busy?'ready':false,name,{timeout:120000});
   if(await result.jsonValue()==='ready')return;
   await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
  }throw Error('The drawing did not become ready');}
  await page.locator('#file-input').setInputFiles({name:'First drawing.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)});await ready('First drawing');
  const first=await page.evaluate(()=>sparkWorkspace.project.id);
  await page.evaluate(async()=>{
   const {projectStore}=await import(new URL('workspace-store.js',location.href)),save=projectStore.save;
   window.openSaves={writes:[],failId:null,opens:0};
   projectStore.save=async project=>{
    if(project.id===openSaves.failId)throw Error('Injected pre-open storage failure');
    const result=await save(project);openSaves.writes.push(project.id);return result;
   };
   const api=document.querySelector('#cad-frame').contentWindow.ocsControl,request=api.request.bind(api);
   api.request=(payload,options)=>{if(payload.op==='open')openSaves.opens++;return request(payload,options);};
  });
  await page.locator('#file-input').setInputFiles({name:'Second drawing.dxf',mimeType:'application/octet-stream',buffer:Buffer.from(dxf)});await ready('Second drawing');
  const second=await page.evaluate(()=>sparkWorkspace.project.id);
  check(await page.evaluate(({first,second})=>!openSaves.writes.includes(first)&&openSaves.writes.length===1&&openSaves.writes[0]===second,{first,second}),'Opening another drawing writes only the new project, not unchanged CAD payloads');
  const handle=await page.evaluate(async()=>{const reply=await sparkWorkspace.mutate({op:'entities_create',entities:[{type:'Line',start:[200,300,0],end:[400,500,0],layer:'0'}]});openSaves.failId=sparkWorkspace.project.id;return (reply.result||reply).handles[0];});
  const failed=await page.evaluate(async dxf=>{
   const before=openSaves.opens;
   try{await sparkWorkspace.importFile(new File([dxf],'Third drawing.dxf'));return null;}
   catch(error){return {message:error.message,opened:openSaves.opens-before,id:sparkWorkspace.project.id};}
  },dxf);
  check(failed?.message==='Injected pre-open storage failure'&&failed.opened===0&&failed.id===second,'An unsaved edit blocks a new import when its storage write fails');
  await page.evaluate(dxf=>{openSaves.failId=null;openSaves.writes=[];return sparkWorkspace.importFile(new File([dxf],'Third drawing.dxf'));},dxf);await ready('Third drawing');
  check(await page.evaluate(({first,second})=>!openSaves.writes.includes(first)&&openSaves.writes.includes(second),{first,second}),'Retry persists the pending edit even after its native snapshot was already created');
  check(await page.evaluate(async id=>{
   const {projectStore}=await import(new URL('workspace-store.js',location.href)),saved=await projectStore.get(id);
   return saved?.working.format==='dwg'&&atob(saved.working.data.slice(0,8))==='AC1032'&&saved.original.format==='dxf';
  },second),'The pending edit has a real DWG snapshot and retains its original DXF');
  const all=await page.evaluate(async()=>{const ids=(await (await import(new URL('workspace-store.js',location.href))).projectStore.catalog()).map(project=>project.id);openSaves.writes=[];await sparkWorkspace.save();return ids.every(id=>openSaves.writes.includes(id));});
  check(all,'Explicit Save still checks and saves every open project');
  await page.evaluate(id=>localStorage.setItem('sparkworld-cad-active',id),second);await page.reload();await require('./continue-saved.cjs')(page);await ready('Second drawing');
  check(await page.evaluate(async handle=>(await sparkWorkspace.read({op:'query',handles:[handle],detail:'geometry'})).entities.some(entity=>entity.start?.[0]===200&&entity.end?.[1]===500),handle),'The edit saved before opening another file survives a full reload');
  check(!errors.length,'Selective pre-open saving produces no unhandled browser errors');
 }finally{await context.close();}
};
