// Exercise the actual owner mutation wrapper against two isolated CAD documents.
const path=require('node:path');
module.exports=async({browser,baseUrl,out,check,expectBug=false,suffix='after'})=>{
 const context=await browser.newContext({viewport:{width:1200,height:800},deviceScaleFactor:2,serviceWorkers:'block'});let page;
 try{
  await context.route('**/*',route=>{const request=route.request(),url=new URL(request.url());return ['http:','https:'].includes(url.protocol)&&(url.origin!==new URL(baseUrl).origin||!['GET','HEAD'].includes(request.method()))?route.abort():route.continue();});
  page=await context.newPage();await page.goto(baseUrl);await page.waitForFunction(()=>window.sparkWorkspace?.ready,null,{timeout:120000});
  const drawing=name=>({name:name+'.dxf',mimeType:'application/octet-stream',buffer:Buffer.from('0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1015\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n0\n20\n0\n11\n1000\n21\n500\n0\nENDSEC\n0\nEOF\n')});
  async function open(name){
   await page.locator('#file-input').setInputFiles(drawing(name));
   for(let i=0;i<4;i++){
    const result=await page.waitForFunction(expected=>document.querySelector('#dialog')?.open&&document.querySelector('#dialog-title').textContent==='CAD graphics notice'?'graphics':sparkWorkspace.project?.name===expected&&!sparkWorkspace.busy?'ready':false,name,{timeout:120000});
    if(await result.jsonValue()==='ready')return page.evaluate(()=>sparkWorkspace.read({op:'state'}));
    await page.getByRole('button',{name:'Continue with software rendering',exact:true}).click();
   }throw Error('Synthetic guard drawing did not open');
  }
  const a=await open('Mutation A'),b=await open('Mutation B');
  check(a.document_id!==b.document_id,'Guard regression opens two distinct native documents');
  const result=await page.evaluate(async({wanted,revision,expectBug})=>{
   const before=await sparkWorkspace.read({op:'state'}),layers=await sparkWorkspace.read({op:'records',collection:'layers',limit:10000}),layer=layers.records.find(row=>row.name==='0');
   if(!layer)throw Error('The authored drawing has no default layer');
   let rejected=false,message='';
   try{await sparkCadStudio.mutation({op:'set_properties',document_id:wanted,revision,request_id:'guard-inactive-document',collection:'layers',handle:layer.handle,updates:[{path:'/flags/off',value:!layer.properties.flags.off}]});}catch(error){rejected=true;message=error.message;}
   const after=await sparkWorkspace.read({op:'state'}),changed=(await sparkWorkspace.read({op:'records',collection:'layers',limit:10000})).records.find(row=>row.handle===layer.handle);
   const targetLayers=await sparkWorkspace.read({op:'records',document_id:wanted,collection:'layers',limit:10000}),target=targetLayers.records.find(row=>row.name==='0');
   return{wanted,activeBefore:before.document_id,activeAfter:after.document_id,rejected,message,revisionBefore:before.revision,revisionAfter:after.revision,offBefore:layer.properties.flags.off,offAfter:changed.properties.flags.off,targetOff:target.properties.flags.off};
  },{wanted:a.document_id,revision:a.revision,expectBug});
  await page.screenshot({path:path.join(out,'cad-mutation-identity-'+suffix+'.png')});
  if(expectBug){check(!result.rejected&&result.activeAfter===b.document_id&&result.offBefore!==result.offAfter,'Before fix: an A-bound mutation incorrectly changes a layer in active drawing B');return result;}
  check(!result.rejected&&result.targetOff!==result.offBefore&&result.activeAfter===b.document_id&&result.offBefore===result.offAfter&&result.revisionBefore===result.revisionAfter,'A pinned background edit changes only its requested document: '+JSON.stringify(result));
  const guards=await page.evaluate(async()=>{
   const state=await sparkWorkspace.read({op:'state'}),line=(await sparkWorkspace.read({op:'query',type:'Line',limit:1})).entities[0],layer=(await sparkWorkspace.read({op:'records',collection:'layers',limit:10000})).records.find(row=>row.name==='0');
   let stale=false;try{await sparkCadStudio.mutation({op:'set_properties',document_id:state.document_id,revision:state.revision+1,request_id:'guard-stale-revision',collection:'layers',handle:layer.handle,updates:[{path:'/flags/off',value:true}]});}catch{stale=true;}
   const engine=document.querySelector('#cad-frame').contentWindow.ocsControl,original=engine.request,forwarded=[];
   engine.request=async function(request,...options){if(request.request_id==='guard-explicit-identity')forwarded.push(structuredClone(request));return Reflect.apply(original,this,[request,...options]);};
   try{await sparkCadStudio.mutation({op:'select',document_id:state.document_id,revision:state.revision,handles:[line.handle],request_id:'guard-explicit-identity'});}finally{engine.request=original;}
   let invalid=0;for(const document_id of [null,undefined,-1,'2'])try{await sparkCadStudio.mutation({op:'select',document_id,revision:state.revision,handles:[]});}catch{invalid++;}
   await sparkCadStudio.mutation({op:'select',handles:[]});
   const after=await sparkWorkspace.read({op:'state'});
   return{stale,forwarded,invalid,document:state.document_id,revisionBefore:state.revision,revisionAfter:after.revision,selection:after.selection};
  });
  check(guards.stale,'A caller-pinned stale revision is rejected');
  check(guards.forwarded.length===1&&guards.forwarded[0].request_id==='guard-explicit-identity'&&guards.forwarded[0].document_id===b.document_id,'The owner forwards the exact caller request identity');
  check(guards.invalid===4,'Invalid explicit document identities cannot fall back to another drawing');
  check(!guards.selection.length&&guards.revisionAfter===guards.revisionBefore,'Unpinned owner actions remain usable without changing CAD geometry');
  check(!await page.locator('#dialog').evaluate(dialog=>dialog.open),'Selection does not open a properties modal');
  return{...result,guards};
 }catch(error){await page?.screenshot({path:path.join(out,'cad-mutation-identity-'+suffix+'.png')}).catch(()=>{});throw error;}
 finally{await context.close();}
};
