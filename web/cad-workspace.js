// SPDX-License-Identifier: GPL-3.0-only
// SparkWorld owns the electrical workflow and controls. The native
// document remains the authority for geometry, selection, layers and history.
import {SYMBOLS,symbolSVG,escape as esc,storage as legacyStorage} from './model.js';
import {NativeElectrical} from './native-electrical.js';
import {createProject,projectStore,validateProject,pointForEntity,savedDrawingFile} from './workspace-store.js';
import {mountCadControls} from './cad-controls.js';
import {installCadGestures} from './cad-gestures.js';
import {installCadContextMenu} from './cad-context-menu.js';
import {drawingLoader,readDrawing,readSelectedFile,interruptedImport,clearInterruptedImport} from './cad-loading.js';
const $=s=>document.querySelector(s),delay=ms=>new Promise(r=>setTimeout(r,ms));
const projects=new Map(),adapters=new Map();let currentId,project,busy=false,panel=null,chosen=null,activeCircuit='',lastSelection='',selection=null,lastRevision=-1,saveTimer,pollSerial=0,placementDocumentId=null;
const savedOpenAttempts=new Map();
const api=()=>window.sparkCadStudio;
const read=request=>api().read(request);
const mutate=request=>api().mutation(request);
let serial=0,nativeControls=null,welcome=null,cadGestures=null,nativeState=null,currentOperation=null,startupReady=false;
let graphicsConsent=null,catalogue=null,catalogueRender=0;
const activate=id=>read({op:'activate',document_id:id,request_id:'workspace-activate-'+ ++serial});
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6000);}
function dialog(title,body,actions=[]){$('#dialog').classList.toggle('cad-load-confirmation',['Project already open','Previous opening did not finish','Reset workspace?','Reset and reload this project?'].includes(title));$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body;$('#dialog-actions').replaceChildren();for(const action of actions){const b=document.createElement('button');b.type='button';b.textContent=action.label;b.className=action.primary?'primary':'';b.onclick=()=>{if(action.closeFirst)$('#dialog').close();Promise.resolve().then(()=>action.run()).then(result=>{if(!action.closeFirst&&result!==false)$('#dialog').close();}).catch(e=>toast(e.message));};$('#dialog-actions').append(b);}if(!$('#dialog').open)$('#dialog').showModal();}
async function task(label,fn,{background=false,loading=null,restoring=false}={}){
 const requestedDocument=currentId;if(currentOperation?.background){await currentOperation.done;if(currentId!==requestedDocument)throw Error('The drawing changed while waiting for automatic save.');}
 if(busy||cadGestures?.active)throw Error('Wait for the current drawing operation or touch gesture.');let finish;const operation={background,done:new Promise(resolve=>finish=resolve)};currentOperation=operation;busy=true;pollSerial++;$('#studio-operation').textContent=label;$('#cad-frame').inert=true;
 const progress=loading?drawingLoader(loading,{restoring,onReset:()=>confirmWorkspaceReset()}):null;
 try{return await fn(progress);}finally{progress?.finish();try{await poll(true);}finally{busy=false;$('#cad-frame').inert=false;if(currentOperation===operation)currentOperation=null;finish();}}
}
const download=(value,name,mime='application/octet-stream')=>{const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return api().deliver(bytes,name,mime);};
function filename(ext){return(project?.name||'Drawing').replace(/[<>:"/\\|?*]/g,'-').slice(0,100)+'.'+ext;}
function closePanel(){nativeControls?.cancelPlacement();panel=null;$('#workspace-library').hidden=true;$('.studio-workspace').classList.remove('has-library');}
function openPanel(name){nativeControls?.cancelPlacement();panel=name;$('#workspace-library').hidden=false;$('.studio-workspace').classList.add('has-library');$('#workspace-panel-title').textContent=name;$('#workspace-search').value='';if(name==='Projects'){catalogue=null;$('#workspace-panel-body').textContent='Reading saved drawings…';}renderPanel().catch(e=>toast(e.message));}
const currentDocument=state=>state.documents?.find(d=>d.id===state.document_id&&!d.start);
async function reviewGraphics(){const state=await read({op:'state'});if(!state.modal)return;const signature=JSON.stringify(state.modal);if(!/GpuWarning/.test(signature))throw Error('Review the notice inside the CAD editor before continuing.');if(graphicsConsent!==signature){const accepted=await new Promise(resolve=>{dialog('CAD graphics notice','<p class="dialog-copy">The CAD engine is using software graphics. Large drawings may be slower on this browser.</p>',[{label:'Cancel',run:()=>resolve(false)},{label:'Continue with software rendering',primary:true,run:()=>resolve(true)}]);$('#dialog').addEventListener('close',()=>resolve(false),{once:true});});if(!accepted)throw Error('CAD operation cancelled.');graphicsConsent=signature;}await mutate({op:'action',name:'close_modal'});}
function bindDocument(state,metadata=null){const d=currentDocument(state);if(!d){currentId=null;project=null;return null;}const changed=currentId!==d.id;currentId=d.id;project=metadata||projects.get(d.id)||createProject(d.title||'Untitled drawing');projects.set(d.id,project);if(changed)activeCircuit=project.activeCircuit||project.circuits[0]?.id||'';return project;}
async function factorFromDrawing(){const envelope=await mutate({op:'sysvar',get:['insunits']}),units=(envelope.result||envelope).values?.insunits;project.units=Number(units);project.factor=({1:25.4,2:304.8,4:1,5:10,6:1000,7:1e6})[project.units]||1;project.unitsConfirmed=[1,2,4,5,6].includes(project.units);}
async function rememberSourceLayers(){const rows=(await read({op:'records',collection:'layers',limit:10000})).records;project.sourceLayers=Object.fromEntries(rows.map(row=>[row.name,structuredClone(row.properties.flags)]));}
async function snapshot(){const state=await read({op:'state'});if(!bindDocument(state))throw Error('Open or create a drawing first.');if(state.command||state.modal)throw Error('Finish or cancel the CAD command and close any notice before saving.');const envelope=await mutate({op:'save',name:filename('dwg'),target_format:'dwg',target_version:'AC1032'}),data=envelope.result||envelope;if(data.dropped_on_save||typeof data.data_base64!=='string'||atob(data.data_base64.slice(0,8))!=='AC1032')throw Error('The native CAD engine could not provide a verified DWG 2018 copy.');project.working={name:filename('dwg'),format:'dwg',data:data.data_base64};project.savedRevision=state.revision;project.activeLayout=state.layout;project.updated=new Date().toISOString();return project;}
async function saveCurrent(){if(savedOpenAttempts.get(project?.id)?.status==='failed')throw Error('The previous opening did not finish. Replace or reset that drawing before saving it.');const state=await read({op:'state'});if(state.command||state.modal)throw Error('Finish or cancel the CAD command and close any notice before saving.');if(!project?.working||state.document_id!==currentId||state.revision!==project.savedRevision||state.layout!==project.activeLayout)await snapshot();project.updated=new Date().toISOString();await projectStore.save(project);catalogue=null;project.dirty=false;localStorage.setItem('sparkworld-cad-active',project.id);$('#studio-operation').textContent='CAD geometry, circuits and notes saved together on this device';return project;}
async function saveAll(){const state=await read({op:'state'}),selected=state.document_id;for(const d of state.documents.filter(d=>!d.start&&savedOpenAttempts.get(projects.get(d.id)?.id)?.status!=='failed')){if(d.id!==(await read({op:'state'})).document_id)await activate(d.id);bindDocument(await read({op:'state'}));await saveCurrent();}if(state.documents.some(d=>d.id===selected))await activate(selected);bindDocument(await read({op:'state'}));}
async function compact(){while(api().busy)await delay(50);if(!api().compact)await api().toggleCanvas();}
async function definitions(){
 if(!project)throw Error('Open or create a drawing first.');
 await reviewGraphics();
 let adapter=adapters.get(currentId);
 if(adapter)return adapter;
 if(!project.sourceLayers)await rememberSourceLayers();
 adapter=new NativeElectrical({read,mutation:mutate});
 if(Object.keys(project.definitions?.blocks||{}).length){await adapter.restoreDefinitions(project.definitions);adapters.set(currentId,adapter);return adapter;}
 await adapter.prepare();adapters.set(currentId,adapter);return adapter;
}
async function switchDocument(id){return task('Switching drawing…',async()=>{const state=await read({op:'state'});if(state.document_id===id)return;if(!state.documents.some(d=>d.id===id&&!d.start))throw Error('The drawing is no longer open.');if(project)await saveCurrent();await activate(id);bindDocument(await read({op:'state'}));localStorage.setItem('sparkworld-cad-active',project.id);});}
async function setLayout(name){const state=await read({op:'state'});if(state.command||state.modal)throw Error('Finish the active command before changing layouts.');await mutate({op:'start',cmd:'-LAYOUT'});await mutate({op:'input',kind:'token',text:'SET'});await mutate({op:'input',kind:'text',text:name});const next=await read({op:'state'});if(next.command||next.layout!==name)throw Error('The CAD engine did not activate the requested layout.');}
async function switchLayout(name){return task('Changing drawing layout…',async()=>{await setLayout(name);await saveCurrent();});}
function savedDocuments(id,state){return state.documents.filter(document=>!document.start&&(projects.get(document.id)?.id===id||savedOpenAttempts.get(id)?.documentId===document.id));}
async function closeSavedDocuments(id){
 clearTimeout(saveTimer);saveTimer=null;
 for(const document of savedDocuments(id,await read({op:'state'}))){
  await read({op:'close',document_id:document.id,discard:true,request_id:'workspace-close-'+ ++serial});
  if((await read({op:'state'})).documents.some(value=>value.id===document.id))throw Error('The previous drawing could not be closed. It has not been loaded again.');
  projects.delete(document.id);adapters.delete(document.id);
 }
 savedOpenAttempts.delete(id);
 bindDocument(await read({op:'state'}));
}
async function openProject(saved,reuse=false,progress=null){
 validateProject(saved,{clone:false});
 await reviewGraphics();
 if(reuse){
  const state=await read({op:'state'});
  const existing=[...projects].find(([id,p])=>p.id===saved.id&&state.documents.some(d=>d.id===id&&!d.start));
  if(existing){
   await progress?.stage(2,'Switching to the open drawing','Restoring its workspace and electrical notes.');
   await activate(existing[0]);
   bindDocument(await read({op:'state'}));
   closePanel();
   localStorage.setItem('sparkworld-cad-active',project.id);
   return;
  }
 }
 await saveAll();
 await progress?.stage(1,'Opening the saved CAD drawing','Reading geometry, layers and blocks. Complex drawings can take longer.');
 const wantedLayout=saved.activeLayout||'Model';
 const before=new Set((await read({op:'state'})).documents.map(document=>document.id));
 const attempt={status:'opening',documentId:null};savedOpenAttempts.set(saved.id,attempt);
 try{
 await api().importFile(savedDrawingFile(saved),{dataBase64:saved.working.data,initialLayout:wantedLayout,onOpened:state=>{
  attempt.documentId=state.document_id;
  bindDocument(state,saved);
 }});
 await reviewGraphics();
 await progress?.stage(2,'Restoring project settings','Restoring layout, units, circuits and electrical notes.');
 const state=await read({op:'state'});
 bindDocument(state,saved);
 if(state.layout!==wantedLayout){
  if(wantedLayout==='Model')await mutate({op:'run',cmd:'TILEMODE 1'});
  else await setLayout(wantedLayout);
 }
 await compact();
 project.savedRevision=(await read({op:'state'})).revision;
 project.dirty=false;
 attempt.status='ready';
 closePanel();
 localStorage.setItem('sparkworld-cad-active',project.id);
 }catch(error){
  attempt.status='failed';
  const state=await read({op:'state'}).catch(()=>null);
  const created=state?.documents.filter(document=>!document.start&&!before.has(document.id));
  if(created?.length===1){attempt.documentId=created[0].id;projects.set(created[0].id,saved);}
  throw error;
 }
}
function confirmWorkspaceReset(id=null){
 dialog(id?'Reset and reload this project?':'Reset workspace?',`<p class="dialog-copy">Restart the drawing engine and close all open drawings. Unsaved changes will be discarded.</p><p class="dialog-copy">Saved projects and original files stay on this device.${id?' The selected saved project will open in the fresh workspace.':' The workspace will restart empty.'}</p>`,[
  {label:'Cancel',run:()=>{}},
  {label:id?'Reset and reload':'Reset workspace',primary:true,run:()=>{clearTimeout(saveTimer);saveTimer=null;if(id)localStorage.setItem('sparkworld-cad-active',id);else localStorage.removeItem('sparkworld-cad-active');clearInterruptedImport();api().restartWorkspace();}},
 ]);
}
async function restoreStoredProject(id,file,alreadyRead=null){
 if(busy)throw Error('A drawing is already loading or being updated. Wait for that operation before replacing it.');
 const state=await read({op:'state'}),existing=savedDocuments(id,state),attempt=savedOpenAttempts.get(id);
 const restore=replace=>task('Restoring project…',async progress=>{
  await progress.stage(0,'Reading the saved project','Retrieving the selected drawing from this device.');
  const saved=alreadyRead??await projectStore.get(id);if(!saved)throw Error('The saved drawing was not found.');
  if(replace)await closeSavedDocuments(id);
  await openProject(saved,true,progress);
 },{loading:file,restoring:true});
 if(existing.length){
  dialog(attempt?.status==='failed'?'Previous opening did not finish':'Project already open',`<p class="dialog-copy">This project already has a drawing in memory. Return to it, or replace it with the saved copy.</p><p class="dialog-copy">Replacing closes the previous drawing first and discards its unsaved changes.</p>`,[
   {label:'Cancel',run:()=>{}},
   {label:'Show existing drawing',closeFirst:true,run:()=>task('Showing the open drawing…',async()=>{await activate(existing[0].id);bindDocument(await read({op:'state'}));closePanel();})},
   {label:'Replace and reload',primary:true,closeFirst:true,run:()=>restore(true)},
  ]);
  return;
 }
 if(attempt?.status==='failed'){
  confirmWorkspaceReset(id);
  return;
 }
 return restore(false);
}
function savedProjectRow(saved,legacy=false){
 const kind=legacy?'legacy':'project',description=legacy?(saved.cad?'Import a copy with its electrical data':'Open image / blank drawing'):new Date(saved.updated).toLocaleString();
 return `<div class="cad-project-entry"><button class="cad-project-row" data-${kind}="${esc(saved.id)}"><strong>${esc(saved.name)}</strong><small>${esc(description)}</small></button><button class="cad-project-delete" data-delete-${kind}="${esc(saved.id)}" aria-label="Delete saved project ${esc(saved.name)}" title="Delete saved project"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg></button></div>`;
}
function confirmProjectRemoval(saved,legacy=false){
 const open=!legacy&&[...projects.values()].some(value=>value.id===saved.id);
 dialog('Delete saved project?',`<p class="dialog-copy">Delete <strong>${esc(saved.name)}</strong> from this device? Its saved drawing, circuits and notes will be removed.</p>${open?'<p class="dialog-copy">Its open drawing will close. Any unsaved changes in that drawing will be discarded.</p>':''}<p class="dialog-copy">Export a backup first if you want to keep this project.</p>`,[
  {label:'Cancel',run:()=>{}},
  {label:'Delete project',primary:true,run:()=>task('Deleting saved project…',async()=>{
   if(legacy){
    await legacyStorage.remove(saved.id);
    if(localStorage.getItem('fyp-active')===saved.id)localStorage.removeItem('fyp-active');
   }else{
    await closeSavedDocuments(saved.id);
    await projectStore.remove(saved.id);
    if(localStorage.getItem('sparkworld-cad-active')===saved.id)localStorage.removeItem('sparkworld-cad-active');
    bindDocument(await read({op:'state'}));
   }
   catalogue=null;
   if(panel==='Projects')await renderPanel();
   toast('Deleted '+saved.name+' from saved projects.');
  })},
 ]);
}
async function importFile(file){if(!file)return;return task('Opening '+file.name+'…',async progress=>{
 await progress.stage(0,'Reading the selected file','Cloud files may need to download before reading can finish. You can cancel this stage.');
 const ext=file.name.split('.').at(-1).toLowerCase();if(file.size>(ext==='json'?128:48)*1024*1024)throw Error('The selected file exceeds the supported import size.');
 if(ext==='json'){const text=await readSelectedFile(file,progress.signal,{text:true});await progress.stage(1,'Restoring the saved drawing','Opening the native CAD geometry and its saved electrical notes.');const imported=validateProject(JSON.parse(text));imported.importedFrom=imported.id;imported.id=crypto.randomUUID();await openProject(imported);await progress.stage(2,'Saving the imported project','Keeping a separate project while preserving the saved original.');await saveCurrent();return;}
 if(!['dwg','dxf'].includes(ext))throw Error('This CAD workspace opens DWG, DXF or SparkWorld CAD project JSON.');
 const encoded=await readDrawing(file,progress.signal);await reviewGraphics();await saveAll();
 await progress.stage(1,'Opening the CAD drawing','Reading native geometry, layers and blocks. A small DWG can contain a complex drawing; this stage cannot be interrupted safely.');
 let unchanged=false;
 await api().importFile(file,{dataBase64:encoded,initialLayout:'Model',onOpened:state=>{unchanged=currentDocument(state)?.dirty===false;}});
 await reviewGraphics();
 const opened=await read({op:'state'});
 bindDocument(opened,createProject(file.name.replace(/\.[^.]+$/,'')));
 project.original={name:file.name,format:ext,data:encoded};
 await rememberSourceLayers();
 if(opened.layout!=='Model')await mutate({op:'run',cmd:'TILEMODE 1'});
 await factorFromDrawing();
 await compact();
 // An untouched import is already a complete native drawing. Reuse its
 // bytes until the first edit instead of encoding a second document at peak.
 if(unchanged){const state=await read({op:'state'});project.working={...project.original};project.savedRevision=state.revision;project.activeLayout=state.layout;}
 await progress.stage(2,'Saving your editable project','Keeping the original drawing and an editable working copy on this device.');
 await saveCurrent();closePanel();
},{loading:file});}
async function newDrawing(){return task('Creating a drawing in millimetres…',async()=>{await reviewGraphics();await saveAll();await mutate({op:'new'});await reviewGraphics();bindDocument(await read({op:'state'}));await mutate({op:'sysvar',set:{insunits:4}});project.factor=1;project.units=4;project.unitsConfirmed=true;await rememberSourceLayers();await compact();await definitions();await saveCurrent();closePanel();});}
function symbolPanel(){const query=$('#workspace-search').value.toLocaleLowerCase();$('#workspace-panel-body').innerHTML=[...new Set(SYMBOLS.map(s=>s.category))].map(category=>{const symbols=SYMBOLS.filter(s=>s.category===category&&(s.name+' '+s.category+' '+(s.system||'')).toLocaleLowerCase().includes(query));return symbols.length?`<details class="symbol-category" open><summary>${esc(category)}</summary><div class="symbol-grid">${symbols.map(s=>`<button class="symbol-button" data-place="${s.id}" title="Place ${esc(s.name)}"><svg viewBox="-18 -18 36 36" style="color:${s.color}">${symbolSVG(s.id)}</svg><span>${esc(s.name)}</span></button>`).join('')}</div></details>`:'';}).join('');for(const button of document.querySelectorAll('[data-place]'))button.onclick=()=>beginPlacement(button.dataset.place).catch(e=>toast(e.message));}
async function beginPlacement(type){await task('Preparing electrical placement…',async()=>{if(!project)throw Error('Open or create a drawing first.');if(!project.unitsConfirmed){units(()=>beginPlacement(type));return;}await definitions();await mutate({op:'cancel'});await compact();const state=await read({op:'state'});if(state.layout!=='Model'||Math.abs(state.camera.pitch-Math.PI/2)>.001||state.camera.projection!=='Orthographic')throw Error('Choose Model and the Top orthographic view before placing electrical symbols.');chosen=type;placementDocumentId=state.document_id;closePanel();$('#electrical-placement').hidden=false;$('#studio-operation').textContent='Tap the drawing to place '+SYMBOLS.find(s=>s.id===type).name+' · drag cancels placement · Esc cancels';});}
async function placeAt(clientX,clientY){return task('Placing electrical symbol…',async()=>{const state=await read({op:'state'}),box=$('#electrical-placement').getBoundingClientRect(),[w,h]=state.viewport_size;if(state.document_id!==placementDocumentId||currentId!==placementDocumentId){chosen=null;$('#electrical-placement').hidden=true;throw Error('The active drawing changed. Choose the symbol again for this drawing.');}if(Math.abs(box.width-w)>1||Math.abs(box.height-h)>1)throw Error('The CAD view is resizing. Try placement again.');const span=2*state.camera.distance*Math.tan(state.camera.fov_y/2),unit=span/h,x=state.camera.target[0]+(clientX-box.left-w/2)*unit,y=state.camera.target[1]-(clientY-box.top-h/2)*unit;
 const symbol=SYMBOLS.find(s=>s.id===chosen);let n=1;while(Object.values(project.points).some(p=>p.label===symbol.prefix+'-'+String(n).padStart(2,'0')))n++;
 const point={id:crypto.randomUUID(),type:chosen,x:x*project.factor,y:-y*project.factor,size:320,rotation:0,label:symbol.prefix+'-'+String(n).padStart(2,'0'),height:chosen.includes('socket')?300:2400,circuit:activeCircuit,note:''};
 const adapter=await definitions(),binding=await adapter.place(point,{millimetresPerUnit:project.factor});project.definitions=adapter.definitions();const {x:unusedX,y:unusedY,size:unusedSize,rotation:unusedRotation,...metadata}=point;project.points[binding.handle]={...metadata,handle:binding.handle};project.dirty=true;await mutate({op:'select',handles:[]});await mutate({op:'select',handles:[binding.handle]});$('#electrical-placement').hidden=true;chosen=null;await saveCurrent();});}
function circuitForm(id){if(!project)return toast('Open a drawing first.');const c=project.circuits.find(c=>c.id===id);dialog(c?'Circuit properties':'Create circuit',`<label class="field">Reference<input id="circuit-ref" maxlength="80" value="${esc(c?.ref||'C'+(project.circuits.length+1))}"></label><label class="field">Name<input id="circuit-name" maxlength="120" value="${esc(c?.name||'')}"></label><label class="field">Cable / protection notes<textarea id="circuit-notes" maxlength="2000">${esc(c?.notes||'')}</textarea></label><p class="dialog-copy">These are design entries. Electrical safety calculations are not performed.</p>`,[{label:'Save circuit',primary:true,run:async()=>{const ref=$('#circuit-ref').value.trim(),name=$('#circuit-name').value.trim();if(!ref||!name)throw Error('Enter the circuit reference and name.');const value={id:c?.id||crypto.randomUUID(),ref,name,notes:$('#circuit-notes').value};if(c)Object.assign(c,value);else project.circuits.push(value);activeCircuit=value.id;project.activeCircuit=value.id;project.dirty=true;await task('Saving circuit…',saveCurrent);if(panel==='Circuits')renderPanel();}}]);}
function units(onConfirmed){dialog('Drawing units',`${project?.units===7?'<p class="dialog-copy">This file declares kilometres. Confirm that this matches the drawing before placing electrical symbols with millimetre sizes.</p>':''}<label class="field">Interpret one drawing unit as<select id="cad-unit-choice"><option value="4">Millimetres</option><option value="5">Centimetres</option><option value="6">Metres</option><option value="1">Inches</option><option value="2">Feet</option><option value="7">Kilometres</option></select></label><p class="dialog-copy">Confirm the source drawing units. This updates its unit metadata; geometry coordinates remain unchanged.</p>`,[{label:'Confirm units',primary:true,run:async()=>{await task('Updating drawing units…',async()=>{const unit=Number($('#cad-unit-choice').value);if(![1,2,4,5,6,7].includes(unit))throw Error('Choose the drawing units.');await mutate({op:'sysvar',set:{insunits:unit}});await factorFromDrawing();project.unitsConfirmed=true;project.dirty=true;await saveCurrent();});if(onConfirmed)setTimeout(()=>onConfirmed().catch(error=>toast(error.message)),0);}}]);$('#cad-unit-choice').value=String(project?.units||4);}
async function details(){if(!selection)return;const handle=selection.handle,p=pointForEntity(project,selection);if(!p)return nativeControls.properties();
 dialog('Electrical point',`<div class="object-hero"><svg viewBox="-18 -18 36 36">${symbolSVG(p.type)}</svg><strong>${esc(SYMBOLS.find(s=>s.id===p.type)?.name||p.type)}</strong></div><label class="field">Reference<input id="point-label" maxlength="120" value="${esc(p.label)}"></label><label class="field">Circuit<select id="point-circuit"><option value="">Unassigned</option>${project.circuits.map(c=>`<option value="${esc(c.id)}" ${p.circuit===c.id?'selected':''}>${esc(c.ref+' · '+c.name)}</option>`).join('')}</select></label><label class="field">Mounting height (mm)<input id="point-height" type="number" min="0" value="${p.height}"></label><label class="field">Installation note<textarea id="point-note" maxlength="2000">${esc(p.note)}</textarea></label>`,[{label:'Save properties',primary:true,run:()=>task('Saving electrical properties…',async()=>{const height=Number($('#point-height').value);if(!Number.isFinite(height)||height<0)throw Error('Enter a valid mounting height.');Object.assign(p,{label:$('#point-label').value,circuit:$('#point-circuit').value,height,note:$('#point-note').value});project.dirty=true;await saveCurrent();})}]);
}
async function activeElectricalCount(){const owner=project,document=currentId,handles=Object.keys(owner?.points||{});let count=0;for(let offset=0;offset<handles.length;offset+=2000){const reply=await read({op:'query',document_id:document,handles:handles.slice(offset,offset+2000),detail:'geometry'});if(currentId!==document||project!==owner)return null;count+=reply.entities.filter(entity=>pointForEntity(owner,entity)).length;}return count;}
async function renderPanel(){if(panel==='Symbols')return symbolPanel();if(panel==='Layers')return layerPanel();if(panel==='Circuits'){const owner=project,count=project?await activeElectricalCount():0;if(panel!=='Circuits'||project!==owner||count===null)return;$('#workspace-panel-body').innerHTML=project?`<div class="cad-circuit-stats">${project.circuits.length} circuits · ${count} electrical points</div><button id="new-circuit">＋ Create circuit</button><div class="cad-circuit-list">${project.circuits.map(c=>`<button data-circuit="${esc(c.id)}">${esc(c.ref+' · '+c.name)}</button>`).join('')}</div>`:'<p class="cad-workspace-instructions">Open or create a drawing to manage its circuits.</p>';$('#new-circuit')?.addEventListener('click',()=>circuitForm());for(const button of document.querySelectorAll('[data-circuit]'))button.onclick=()=>circuitForm(button.dataset.circuit);return;}
 if(panel==='Projects'){const serial=++catalogueRender,read=catalogue??(catalogue=Promise.all([projectStore.catalog(),legacyStorage.catalog()]));let saved,older;try{[saved,older]=await read;}catch(error){if(catalogue===read)catalogue=null;throw error;}if(panel!=='Projects'||serial!==catalogueRender)return;const query=$('#workspace-search').value.toLocaleLowerCase(),byId=new Map(saved.map(p=>[p.id,p]));$('#workspace-panel-body').innerHTML=`<button id="workspace-new">＋ New drawing</button><p class="cad-workspace-instructions">CAD geometry, circuits and notes are saved together on this device.</p>`+saved.filter(p=>p.name.toLocaleLowerCase().includes(query)).sort((a,b)=>b.updated.localeCompare(a.updated)).map(p=>savedProjectRow(p)).join('')+(older.length?'<h3>Earlier saved drawings</h3>':'')+older.filter(p=>p.name.toLocaleLowerCase().includes(query)).map(p=>savedProjectRow(p,true)).join('');$('#workspace-new').onclick=()=>newDrawing().catch(e=>toast(e.message));for(const button of document.querySelectorAll('[data-project]'))button.onclick=()=>restoreStoredProject(button.dataset.project,byId.get(button.dataset.project).file).catch(e=>toast(e.message));for(const button of document.querySelectorAll('button[data-legacy]'))button.onclick=()=>migrateLegacy(button.dataset.legacy).catch(e=>toast(e.message));for(const button of document.querySelectorAll('[data-delete-project]'))button.onclick=()=>confirmProjectRemoval(byId.get(button.dataset.deleteProject));const olderById=new Map(older.map(value=>[value.id,value]));for(const button of document.querySelectorAll('[data-delete-legacy]'))button.onclick=()=>confirmProjectRemoval(olderById.get(button.dataset.deleteLegacy),true);}
}
async function layerPanel(){if(!project){$('#workspace-panel-body').innerHTML='<p class="cad-workspace-instructions">Open a drawing to inspect its layers.</p>';return;}const rows=(await read({op:'records',collection:'layers',limit:10000})).records,query=$('#workspace-search').value.toLocaleLowerCase();if(panel!=='Layers')return;
 $('#workspace-panel-body').innerHTML=`<div class="layer-summary"><strong>${rows.filter(row=>!row.properties.flags.off&&!row.properties.flags.frozen).length} / ${rows.length} layers enabled</strong></div><div class="layer-actions"><button id="native-show-all">Reveal all</button><button id="native-source-state">Source state</button></div><p class="cad-workspace-instructions">Reveal all also unfreezes placement and child layers used by blocks. Original file bytes are retained.</p>`+rows.filter(row=>row.name.toLocaleLowerCase().includes(query)).map(row=>`<label class="layer-row"><input type="checkbox" data-native-layer="${esc(row.handle)}" ${!row.properties.flags.off&&!row.properties.flags.frozen?'checked':''}><span class="layer-details"><strong>${esc(row.name)}</strong><small>${row.properties.flags.frozen?'Frozen':row.properties.flags.off?'Off':'Enabled'}${row.properties.flags.locked?' · Locked':''}</small></span></label>`).join('');
 for(const input of document.querySelectorAll('[data-native-layer]'))input.onchange=()=>task('Changing CAD layer visibility…',async()=>{await mutate({op:'set_properties',collection:'layers',handle:input.dataset.nativeLayer,updates:[{path:'/flags/off',value:!input.checked},{path:'/flags/frozen',value:false}]});project.dirty=true;await saveCurrent();await layerPanel();}).catch(error=>toast(error.message));
 $('#native-show-all').onclick=()=>task('Revealing all source and block layers…',async()=>{for(const row of rows)if(row.properties.flags.off||row.properties.flags.frozen)await mutate({op:'set_properties',collection:'layers',handle:row.handle,updates:[{path:'/flags/off',value:false},{path:'/flags/frozen',value:false}]});project.dirty=true;await saveCurrent();await layerPanel();}).catch(error=>toast(error.message));
 $('#native-source-state').onclick=()=>task('Restoring original layer states…',async()=>{for(const row of rows){const flags=project.sourceLayers?.[row.name];if(flags&&(row.properties.flags.off!==!!flags.off||row.properties.flags.frozen!==!!flags.frozen))await mutate({op:'set_properties',collection:'layers',handle:row.handle,updates:[{path:'/flags/off',value:!!flags.off},{path:'/flags/frozen',value:!!flags.frozen}]});}project.dirty=true;await saveCurrent();await layerPanel();}).catch(error=>toast(error.message));
}
async function diagnostics(){const state=await read({op:'state'}),entities=await read({op:'query',limit:1}),layers=await read({op:'records',collection:'layers',limit:10000});dialog('Drawing information',`<dl class="studio-facts"><dt>CAD engine</dt><dd>Open CAD Studio v2026.44</dd><dt>Database entities</dt><dd>${Number(entities.count).toLocaleString()}</dd><dt>Layers</dt><dd>${layers.count}</dd><dt>Active layout</dt><dd>${esc(state.layout)}</dd><dt>Missing fonts</dt><dd>${state.missing_fonts?.length?state.missing_fonts.map(esc).join(', '):'None reported by the engine'}</dd></dl>${state.xrefs?.length?`<h3>External references</h3><ul>${state.xrefs.map(reference=>`<li>${esc(JSON.stringify(reference))}</li>`).join('')}</ul>`:''}<p class="dialog-copy">Database records include model space, layouts and block definitions. External references and custom fonts require their supporting files; record counts alone do not prove their appearance.</p>`,[{label:'Close',primary:true,run:()=>{}}]);}
async function migrateLegacy(id){const old=await legacyStorage.get(id);if(!old)throw Error('The saved drawing was not found.');if(!old.cad){await task('Saving CAD work…',saveAll);localStorage.setItem('fyp-active',old.id);location.href=new URL('?workspace=image',document.baseURI);return;}return task('Importing a copy of the earlier electrical drawing…',async()=>{
 await saveAll();const file=new File([Uint8Array.from(atob(old.cad.original),c=>c.charCodeAt(0))],old.cad.fileName);await api().importFile(file);await reviewGraphics();bindDocument(await read({op:'state'}),createProject(old.name));project.original={name:file.name,format:old.cad.originalFormat,data:old.cad.original};project.legacySourceId=old.id;project.factor=old.cad.factor;project.units=old.cad.unitOverride??old.cad.units;project.unitsConfirmed=!!old.calibrated;project.circuits=structuredClone(old.circuits);await mutate({op:'run',cmd:'TILEMODE 1'});await compact();const adapter=await definitions();
 // The earlier editor stored visibility as a view override. Apply that view
 // to this working copy only; sourceLayers still holds the original DWG flags.
 const hidden=new Set(old.hiddenLayers),known=new Set(old.cad.layers.map(layer=>layer.name));
 const rows=(await read({op:'records',collection:'layers',limit:10000})).records;
 for(const row of rows)if(known.has(row.name)){
  const off=hidden.has(row.name),flags=row.properties.flags;
  if(flags.off!==off||(!off&&flags.frozen))await mutate({op:'set_properties',collection:'layers',handle:row.handle,updates:[{path:'/flags/off',value:off},...(!off?[{path:'/flags/frozen',value:false}]:[])]});
 }
 if([1,2,4,5,6,7].includes(project.units))await mutate({op:'sysvar',set:{insunits:project.units}});
 for(const [owner,move]of Object.entries(old.cadMoves||{}))await adapter.move([BigInt(owner).toString(16)],move.dx,move.dy,{millimetresPerUnit:project.factor});
 for(const point of old.objects){const binding=await adapter.place(point,{millimetresPerUnit:project.factor});project.definitions=adapter.definitions();const {x,y,size,rotation,...metadata}=point;project.points[binding.handle]={...metadata,handle:binding.handle};}
 for(const wire of old.wires){const made=await mutate({op:'entities_create',entities:[{type:'LwPolyline',vertices:wire.points.map(([x,y])=>[x/project.factor,-y/project.factor]),closed:false,layer:'SparkWorld Routes'}]});const handle=(made.result||made).handles[0];project.routes[handle]={id:wire.id,circuit:wire.circuit};}
 project.legacyMeasurements=[];
 for(const measure of old.measures||[]){const [a,b]=measure.points,middle=[(a[0]+b[0])/2/project.factor,-(a[1]+b[1])/2/project.factor],length=Math.hypot(b[0]-a[0],b[1]-a[1]);const made=await mutate({op:'entities_create',entities:[{type:'LwPolyline',vertices:measure.points.map(([x,y])=>[x/project.factor,-y/project.factor]),closed:false,layer:'SparkWorld Measurements',color:2},{type:'Text',value:old.calibrated?(length/1000).toFixed(2)+' m':'Scale not set',position:middle,height:80/project.factor,layer:'SparkWorld Measurements',color:2}]});project.legacyMeasurements.push({id:measure.id,handles:(made.result||made).handles,sourcePoints:structuredClone(measure.points),calibrated:old.calibrated});}
 project.dirty=true;await saveCurrent();closePanel();toast('Imported a copy. The earlier saved drawing is unchanged.');
});}
function more(){dialog('Drawing actions','<p class="dialog-copy">CAD geometry and electrical data belong to this workspace.</p>',[
 {label:'UI Settings / Layout Lab',run:()=>{setTimeout(()=>nativeControls.openSettings(),0);}},
 ...(!api().state?.hosted_view?[{label:'Show / hide full CAD tools',run:async()=>{closePanel();await api().toggleCanvas();}}]:[]),
 {label:'Fit drawing',run:()=>task('Fitting drawing…',()=>mutate({op:'action',name:'zoom_extents'}))},
 {label:'Drawing layers',run:()=>openPanel('Layers')},
 {label:'Undo CAD edit',run:()=>task('Undoing edit…',()=>mutate({op:'undo'}))},
 {label:'Redo CAD edit',run:()=>task('Redoing edit…',()=>mutate({op:'redo'}))},
 {label:'Drawing units',run:()=>{setTimeout(units,0);}},
 {label:'Drawing information',run:()=>{setTimeout(()=>diagnostics().catch(e=>toast(e.message)),0);}},
 {label:'Reset workspace',run:()=>{confirmWorkspaceReset();return false;}},
 {label:'Export DWG copy',run:()=>api().save()},
 {label:'Export complete project JSON',run:()=>task('Exporting complete project…',async()=>{await saveCurrent();await download(JSON.stringify(project),filename('json'),'application/json');})},
 {label:'Source and licenses',run:()=>{window.open(new URL('cad-sources.html',document.baseURI),'_blank','noopener');}},
 ]);}
let polling=null;
async function poll(force=false){
 // A slow state/entity reply must finish before the next timer tick starts
 // another poll. Otherwise each 750 ms tick invalidates the previous result
 // forever on slower devices. Operations may still invalidate stale results;
 // their forced refresh waits for that read and then fetches fresh state.
 if(polling){if(force){await polling;return poll(true);}return;}
 const pending=refreshWorkspace(force);polling=pending;
 try{await pending;}finally{if(polling===pending)polling=null;}
}
async function refreshWorkspace(force=false){if(((busy||cadGestures?.active)&&!force)||!api()||api().busy)return;const epoch=++pollSerial,state=await read({op:'state'});if(epoch!==pollSerial)return;nativeState=state;nativeControls?.update(state);document.body.classList.toggle('cad-viewport-hosted',!!state.hosted_view);if(welcome){welcome.hidden=!!currentDocument(state);document.body.classList.toggle('ui-welcome',!currentDocument(state));}bindDocument(state);if(!project){$('#point-summary').hidden=true;return;}$('#studio-document').textContent=project.name;
 const key=state.document_id+'|'+state.revision+'|'+state.selection_revision+'|'+state.selection.join(',');if(key!==lastSelection){const picked=state.selection[0]?(await read({op:'query',handles:[state.selection[0]],detail:'geometry'})).entities[0]:null;if(epoch!==pollSerial)return;lastSelection=key;selection=picked;$('#point-summary').hidden=!selection;if(selection)$('#point-summary-label').textContent=pointForEntity(project,selection)?.label||selection.display_type||selection.type;}
 const revisionKey=state.document_id+':'+state.revision;
 if(lastRevision!==revisionKey){lastRevision=revisionKey;project.dirty=project.savedRevision!==state.revision;clearTimeout(saveTimer);saveTimer=null;}
 if(project.dirty&&(!savedOpenAttempts.has(project.id)||savedOpenAttempts.get(project.id).status==='ready')&&!state.command&&!state.modal&&!saveTimer){const captured=project,id=state.document_id;saveTimer=setTimeout(()=>{saveTimer=null;if(!busy&&!cadGestures?.active&&captured.dirty&&project===captured&&currentId===id)task('Saving complete project…',saveCurrent,{background:true}).catch(error=>toast('Automatic save failed: '+error.message));},2200);}
}

document.body.classList.add('cad-workspace-page');$('#cad-frame').title='SparkWorld drawing canvas';$('.studio-heading>strong').textContent='Draw';$('#electrical-nav').innerHTML='<svg viewBox="0 0 24 24"><path d="M3 7h7l2 3h9v10H3zM3 10V5h7l2 2"/></svg>Projects';$('#cad-nav').lastChild.textContent='Draw';
const rail=$('.studio-rail'),symbolButton=$('#fit'),circuitButton=$('#history-menu'),moreButton=$('#studio-info');symbolButton.innerHTML='<svg viewBox="0 0 24 24"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg>Symbols';circuitButton.innerHTML='<svg viewBox="0 0 24 24"><path d="M3 3h6v6H3zM15 15h6v6h-6zM6 9v9h9M9 6h9v9"/></svg>Circuits';moreButton.innerHTML='<svg viewBox="0 0 24 24"><circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/></svg>More';
const library=document.createElement('aside');library.id='workspace-library';library.className='cad-workspace-library';library.hidden=true;library.innerHTML='<div class="panel-title"><h2 id="workspace-panel-title">Symbols</h2><button id="workspace-panel-close" class="icon-button" aria-label="Close panel">×</button></div><label class="search"><input id="workspace-search" type="search" aria-label="Search workspace panel" placeholder="Search…"></label><div id="workspace-panel-body" class="library-scroll"></div>';rail.after(library);
const placement=document.createElement('div');placement.id='electrical-placement';placement.className='electrical-placement';placement.hidden=true;placement.tabIndex=0;placement.setAttribute('aria-label','Tap to place the selected electrical symbol');$('.studio-frame-wrap').append(placement);
welcome=document.createElement('section');welcome.className='cad-own-welcome';welcome.hidden=true;
welcome.innerHTML='<svg viewBox="0 0 310 150" aria-hidden="true"><path d="M35 125V28h155v97H35m80-97v62m0 0h75m0-62h83v97h-83M35 90h80" fill="none" stroke="#728ca2" stroke-width="3"/><path d="M53 108V47h45m37 0h38v60m32-60h48v60" fill="none" stroke="#167cff" stroke-width="2" stroke-dasharray="4 4"/><g fill="#111f2d" stroke="#6bb2ff" stroke-width="2"><circle cx="53" cy="108" r="8"/><circle cx="98" cy="47" r="8"/><circle cx="173" cy="107" r="8"/><circle cx="253" cy="107" r="8"/></g><path d="M49 104l8 8m0-8l-8 8" stroke="#67d7ab" stroke-width="2"/></svg><span class="eyebrow">YOUR PLAN. YOUR PRECISION.</span><h1>Bring your electrical<br>drawing into focus.</h1><p>Open your DWG or DXF.<br>Draw, place electrical symbols and organise circuits.</p><div><button type="button" class="primary" id="cad-own-welcome-open">Open a drawing</button><button type="button" id="cad-own-welcome-new">New drawing</button></div>';
$('.studio-frame-wrap').append(welcome);$('#cad-own-welcome-open').onclick=()=>$('#file-input').click();$('#cad-own-welcome-new').onclick=()=>newDrawing().catch(e=>toast(e.message));
const summary=document.createElement('div');summary.id='point-summary';summary.className='cad-point-summary';summary.hidden=true;summary.innerHTML='<span id="point-summary-label"></span><button id="point-details">Details</button><button id="point-clear" aria-label="Clear selection">×</button>';$('.studio-frame-wrap').append(summary);
const layersButton=document.createElement('button');layersButton.id='workspace-layers';layersButton.textContent='Layers';layersButton.onclick=()=>openPanel('Layers');$('.studio-context').append(layersButton);
let gesture=null,touches=new Set();placement.onpointerdown=e=>{placement.setPointerCapture(e.pointerId);touches.add(e.pointerId);if(!gesture)gesture={x:e.clientX,y:e.clientY,moved:false,multiple:false};if(touches.size>1)gesture.multiple=true;};placement.onpointermove=e=>{if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8)gesture.moved=true;};placement.onpointerup=e=>{touches.delete(e.pointerId);if(touches.size)return;const g=gesture;gesture=null;if(g&&!g.moved&&!g.multiple)placeAt(e.clientX,e.clientY).catch(e=>toast(e.message));};placement.onpointercancel=()=>{touches.clear();gesture=null;};
$('#electrical-nav').onclick=()=>openPanel('Projects');$('#cad-nav').onclick=()=>{closePanel();chosen=null;placement.hidden=true;mutate({op:'cancel'}).catch(e=>toast(e.message));};symbolButton.onclick=()=>openPanel('Symbols');circuitButton.onclick=()=>openPanel('Circuits');moreButton.onclick=more;$('#workspace-panel-close').onclick=closePanel;$('#workspace-search').oninput=()=>renderPanel().catch(e=>toast(e.message));$('#point-details').onclick=()=>details().catch(e=>toast(e.message));$('#point-clear').onclick=()=>mutate({op:'select',handles:[]}).then(poll).catch(e=>toast(e.message));
$('#save').textContent='Save project';$('#save').onclick=()=>task('Saving complete project…',saveAll).catch(e=>toast(e.message));$('#file-input').onchange=e=>{const file=e.target.files[0];e.target.value='';importFile(file).catch(e=>toast(e.message));};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){chosen=null;placement.hidden=true;gesture=null;touches.clear();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();e.stopImmediatePropagation();task('Saving complete project…',saveAll).catch(e=>toast(e.message));}},true);
while(!api())await delay(50);while(api().busy)await delay(50);await poll();
// Native Open/Drop and Ctrl+S use the same project boundary as the parent UI.
// Font and other non-CAD file inputs continue to the native editor unchanged.
nativeControls=await mountCadControls({read,write:mutate,task,save:saveCurrent,dialog,toast,frame:$('#cad-frame'),compact,switchDocument,switchLayout,hostCommands:{LAYER:()=>openPanel('Layers'),LA:()=>openPanel('Layers'),PROPERTIES:()=>nativeControls.properties(),PR:()=>nativeControls.properties(),OPTIONS:()=>nativeControls.openSettings(),OP:()=>nativeControls.openSettings()},describeDocument:d=>{const p=projects.get(d.id);return{displayName:p?.name||d.path?.split(/[\\/]/).at(-1)||d.title,dirty:!p||p.dirty||p.savedRevision!==d.revision};}});
nativeControls.update(nativeState);
const inner=$('#cad-frame').contentWindow;
installCadContextMenu({inner,frame:$('#cad-frame'),state:()=>read({op:'state'}),enabled:()=>!!nativeState?.hosted_view&&!busy&&!nativeState.modal&&!nativeState.block_editor,
 defer:()=>nativeState?.hosted_view&&currentOperation?.background?{done:currentOperation.done,documentId:currentId}:null,
 onError:error=>toast(error.message),act:async(id,pinned)=>{
  const state=await read({op:'state'});if(state.document_id!==pinned.documentId)throw Error('The active drawing changed. Open the menu again.');
  if(state.command?.name!==pinned.command||JSON.stringify(state.selection)!==JSON.stringify(pinned.selection))throw Error('The command or selection changed. Open the menu again.');
  if(['move','copy','rotate','erase'].includes(id))return nativeControls.execute(id.toUpperCase());
  if(id==='layers')return openPanel('Layers');if(id==='details'){await poll(true);return details();}if(id==='settings')return nativeControls.openSettings();
  return task('Drawing · '+id,()=>mutate(id==='fit'?{op:'action',name:'zoom_extents'}:id==='finish'?{op:'input',kind:'enter'}:{op:id}));
 }});
// A deliberate mouse double-click opens the host's Details, rather than the
// engine's separate rich-text/property window. A normal click only selects.
let lastCanvasPress=null,suppressDoubleRelease=false,detailsOpening=null;
function openDoubleClickDetails(){
 if(detailsOpening||$('#dialog').open)return;
 detailsOpening=task('Opening selected object…',async()=>{
  const state=await read({op:'state'});if(state.command||state.modal)return;
  // A native editor can have opened on the same second press before the
  // browser's dblclick event arrives. Close that fresh editor before showing
  // host properties; an already-open editor is excluded by the event guard.
  if(state.text_editor||state.mtext_editor)await mutate({op:'cancel'});
  await poll(true);await details();
 }).catch(error=>toast(error.message)).finally(()=>detailsOpening=null);
}
window.addEventListener('pointerup',()=>suppressDoubleRelease=false,true);
inner.addEventListener('pointercancel',()=>{lastCanvasPress=null;suppressDoubleRelease=false;},true);
inner.addEventListener('pointerdown',event=>{
 if(event.pointerType!=='mouse'||event.button!==0||event.target?.tagName!=='CANVAS'||busy||nativeState?.command||nativeState?.modal||nativeState?.text_editor||nativeState?.mtext_editor)return;
 const previous=lastCanvasPress;lastCanvasPress={time:event.timeStamp,x:event.clientX,y:event.clientY};
 if(previous&&event.timeStamp-previous.time<400&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<6&&nativeState?.selection?.length){
  lastCanvasPress=null;suppressDoubleRelease=true;event.preventDefault();event.stopImmediatePropagation();openDoubleClickDetails();
 }
},true);
inner.addEventListener('pointerup',event=>{if(suppressDoubleRelease&&event.pointerType==='mouse'&&event.button===0){suppressDoubleRelease=false;event.preventDefault();event.stopImmediatePropagation();}},true);
inner.addEventListener('dblclick',event=>{
 if(event.target?.tagName!=='CANVAS'||event.button!==0||nativeState?.command||nativeState?.modal||nativeState?.text_editor||nativeState?.mtext_editor)return;
 event.preventDefault();event.stopImmediatePropagation();openDoubleClickDetails();
},true);
cadGestures=installCadGestures({inner,enabled:()=>!!nativeState?.hosted_view&&!!project&&!busy&&!nativeState.command&&!nativeState.modal&&!nativeState.block_editor,read,write:mutate,onError:error=>toast(error.message),onFinish:()=>poll(true)});
inner.onbeforeunload=null;
api().setPresentation({name:state=>projects.get(state?.document_id)?.name,dirty:state=>!!state?.documents?.some(doc=>!doc.start&&(!projects.has(doc.id)||projects.get(doc.id).dirty||projects.get(doc.id).savedRevision!==doc.revision)),status:state=>{const p=projects.get(state?.document_id);return p?(p.dirty||p.savedRevision!==state.revision?'Unsaved project changes':'Complete project saved on this device'):null;}});
inner.document.addEventListener('change',event=>{const file=event.target?.files?.[0];if(file&&/\.(dwg|dxf)$/i.test(file.name)){event.stopImmediatePropagation();event.preventDefault();event.target.value='';importFile(file).catch(e=>toast(e.message));}},true);
inner.document.addEventListener('drop',event=>{const file=event.dataTransfer?.files?.[0];if(file&&/\.(dwg|dxf)$/i.test(file.name)){event.stopImmediatePropagation();event.preventDefault();importFile(file).catch(e=>toast(e.message));}},true);
inner.document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();event.stopImmediatePropagation();task('Saving complete project…',saveAll).catch(e=>toast(e.message));}},true);
window.sparkWorkspace={read,mutate,importFile,newDrawing,beginPlacement,save:()=>task('Saving complete project…',saveAll),get project(){return project?structuredClone(project):null;},get busy(){return busy||!!cadGestures?.active;},get ready(){return startupReady;},get touchActive(){return!!cadGestures?.active;},get selection(){return selection;}};
try{const interrupted=interruptedImport();if(interrupted){clearInterruptedImport();localStorage.removeItem('sparkworld-cad-active');dialog('The previous drawing did not finish opening',`<p class="dialog-copy">${esc(interrupted.name||'The drawing')} stopped during ${esc(interrupted.stage||'opening')}. It has not been reopened automatically. Your original file and previously saved projects are unchanged.</p>`,[{label:'Choose another drawing',primary:true,run:()=>$('#file-input').click()},{label:'View saved projects',run:()=>openPanel('Projects')}]);}else{const id=localStorage.getItem('sparkworld-cad-active'),saved=id?await projectStore.get(id):null;if(saved){validateProject(saved,{clone:false});await restoreStoredProject(id,savedDrawingFile(saved),saved);}}}catch(error){toast('The last CAD project could not be restored: '+error.message);}finally{startupReady=true;}
setInterval(()=>poll().catch(e=>toast(e.message)),750);
