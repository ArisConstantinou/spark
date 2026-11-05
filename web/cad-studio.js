// SPDX-License-Identifier: GPL-3.0-only
// Open CAD Studio remains an attributed GPL component; see cad-sources.html.
import {pendingCadFile,consumeCadFile} from './cad-transfer.js';
import {setupDesktop} from './desktop-ui.js';
import {desktop} from './platform.js';
import {waitForCadEngine,showCadStartupFailure} from './cad-startup.js';
import {createCadMutation} from './cad-transport.js';
// A new viewport API must not reuse a cached index from an older component.
const CAD_CORE='8f5d9e79e013739c116b3678f51f1f77c850760b';
import {escape as esc} from './model.js';
const $=s=>document.querySelector(s),frame=$('#cad-frame');
const unifiedWeb=!desktop&&document.body.dataset.sparkWorkspace==='cad';
let resolveReady,rejectReady,workspaceReady=!unifiedWeb;
export const cadReady=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
cadReady.catch(()=>{});
let api=null,state=null,serial=0,busy=false,desktopUi=null,disposed=false,sourceName='',toastTimer,pollTimer,presentation=null;
const pendingDownloads=new Set(),importNames=new Map(),narrowMedia=matchMedia('(max-width:580px)');let narrowCanvas=false,initialLayoutPending=narrowMedia.matches,layoutJob=false;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6500);}
function dialog(title,body,actions=[]){$('#dialog-title').textContent=title;$('#dialog-body').innerHTML=body;$('#dialog-actions').replaceChildren();for(const action of actions){const b=document.createElement('button');b.type='button';b.textContent=action.label;b.className=action.primary?'primary':'';b.onclick=async()=>{try{if(await action.run()!==false)$('#dialog').close();}catch(e){toast(e.message);}};$('#dialog-actions').append(b);}if(!$('#dialog').open)$('#dialog').showModal();}
$('#dialog-close').onclick=()=>$('#dialog').close();
function confirmAction(message,{title='Continue?',confirmLabel='Continue'}={}){return new Promise(resolve=>{const modal=document.createElement('dialog');modal.setAttribute('aria-label',title);const heading=document.createElement('h2');heading.textContent=title;const copy=document.createElement('p');copy.className='dialog-copy';copy.textContent=message;const actions=document.createElement('div');actions.className='dialog-actions';let settled=false;const finish=value=>{if(settled)return;settled=true;modal.close();modal.remove();resolve(value);};for(const [label,value]of [['Cancel',false],[confirmLabel,true]]){const button=document.createElement('button');button.type='button';button.textContent=label;button.className=value?'primary':'';button.onclick=()=>finish(value);actions.append(button);}modal.addEventListener('cancel',e=>{e.preventDefault();finish(false);});modal.append(heading,copy,actions);document.body.append(modal);modal.showModal();});}
function dirty(){return pendingDownloads.size>0||(presentation?.dirty?presentation.dirty(state):!!state?.documents?.some(d=>d.dirty));}
function update(){if(!unifiedWeb)$('#studio-document').hidden=false;const active=state?.documents?.find(d=>d.id===state.document_id),notice=!!state?.modal;$('#studio-document').textContent=presentation?.name?.(state)||importNames.get(active?.id)||active?.path?.split(/[\\/]/).at(-1)||active?.title||'Native DWG workspace';$('#document-status').textContent=notice?(unifiedWeb?'A CAD notice is available for review':'Review and close the notice inside the CAD editor'):presentation?.status?.(state)|| (active?(active.dirty||pendingDownloads.has(active.id)?'Changes need a saved copy':'Local drawing · '+state.layout):'Files stay on this device');if(api){$('#engine-status').textContent=notice?'Review CAD notice':'Native DWG + DXF';$('#engine-dot').classList.toggle('ready',!notice);}for(const id of ['import','save','fit','history-menu'])$('#'+id).disabled=!api||busy||(notice&&!unifiedWeb)||(unifiedWeb&&!workspaceReady)||(id!=='import'&&(!active||active.start));}
async function read(request,{timeoutMs=120000}={}){if(!api)throw Error('The CAD engine is still loading.');let reply;try{reply=await api.request(request,{timeoutMs});}catch(error){if(error.message?.startsWith('ocs-control: timed out:'))throw Error('The CAD engine did not finish this operation in time.');throw error;}if(!reply.ok)throw Error(reply.message||reply.error?.message||reply.error||reply.code||'The CAD operation failed.');return reply;}
const mutation=createCadMutation(read,()=> 'spark-'+ ++serial);
async function refresh(options){if(disposed||!api||busy)return;state=await read({op:'state'},options);if(state.hosted_view)initialLayoutPending=false;update();const active=state.documents?.find(d=>d.id===state.document_id);if(initialLayoutPending&&!state.modal&&!layoutJob&&active&&!active.start){initialLayoutPending=false;layoutJob=true;queueMicrotask(async()=>{try{await toggleCanvas();}catch(error){toast('CAD view control failed: '+error.message);}finally{layoutJob=false;}});}}
async function task(label,fn){if(busy)throw Error('Wait for the current CAD operation.');busy=true;$('#studio-operation').textContent=label;update();try{return await fn();}catch(error){$('#studio-operation').textContent='Operation failed: '+error.message;throw error;}finally{busy=false;await refresh();}}
function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function decode(text){return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}
async function deliver(bytes,name){if(desktopUi)return desktopUi.saveData(bytes,name,'application/octet-stream');const url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'})),a=document.createElement('a');a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);return true;}
async function importFile(file,{dataBase64,onOpened,initialLayout}={}){
 if(!file)return false;
 const format=file.name.split('.').at(-1).toLowerCase();
 if(!['dwg','dxf'].includes(format))throw Error('Choose a DWG or DXF drawing.');
 if(!file.size||file.size>48*1024*1024)throw Error('Choose a non-empty drawing up to 48 MiB.');
 return task('Opening '+file.name+' locally…',async()=>{
  const request={op:'open',name:file.name,data_base64:dataBase64??encode(new Uint8Array(await file.arrayBuffer()))};
  if(unifiedWeb&&initialLayout)request.initial_layout=initialLayout;
  await mutation(request,{timeoutMs:unifiedWeb?600000:120000});
  const opened=await read({op:'state'});
  onOpened?.(opened);
  importNames.set(opened.document_id,file.name);
  sourceName=file.name;
  // The new engine restores the requested layout's camera or fits the
  // drawing itself when the file has no saved camera.
  const restoredInitialView=initialLayout&&opened.hosted_initial_layout&&opened.layout===initialLayout;
  if(!restoredInitialView)await mutation({op:'action',name:'zoom_extents'});
  $('#studio-operation').textContent='Opened locally · original file retained';
  return true;
 });
}
async function save(){if(!api||busy)return false;return task('Writing native DWG…',async()=>{const current=await read({op:'state'}),active=current.documents.find(d=>d.id===current.document_id);if(!active||active.start)throw Error('Open or create a drawing first.');const name=(importNames.get(active.id)||active.path?.split(/[\\/]/).at(-1)||active.title||'Drawing').replace(/\.(dwg|dxf)$/i,'')+'-sparkworld.dwg';pendingDownloads.add(active.id);const envelope=await mutation({op:'save',name,target_format:'dwg',target_version:'AC1032'}),reply=envelope.result||envelope;if(reply.dropped_on_save)throw Error('The engine reports dropped records. Keep the source and review the drawing before saving.');if(typeof reply.data_base64!=='string'||!reply.data_base64.length)throw Error('The CAD engine returned no drawing bytes.');const bytes=decode(reply.data_base64);if(new TextDecoder().decode(bytes.subarray(0,6))!=='AC1032')throw Error('The returned file is not the requested DWG 2018 format.');const saved=await deliver(bytes,name);if(saved===false){$('#studio-operation').textContent='Save cancelled · changes still need a copy';return false;}pendingDownloads.delete(active.id);$('#studio-operation').textContent=desktop?'DWG copy saved · original retained':'DWG copy sent to browser downloads · verify the download';return true;});}
async function leave(){await refresh();if(dirty()&&!await confirmAction('One or more CAD drawings have changes without a saved copy. Save each drawing before leaving if you want to keep those changes.',{title:'Leave CAD Studio?',confirmLabel:'Leave without saving'}))return;try{frame.contentWindow.onbeforeunload=null;}catch{}disposed=true;location.href='./';}
async function toggleCanvas(){const reply=await task('Changing the CAD workspace view…',()=>mutation({op:'run',cmd:'CLEANSCREEN'}));if(reply.status==='waiting_input'){initialLayoutPending=true;return false;}narrowCanvas=!narrowCanvas;$('#cad-nav').title=narrowCanvas?'Show CAD tool panels':'Focus CAD canvas';$('#cad-nav').setAttribute('aria-label',$('#cad-nav').title);}
$('#electrical-nav').onclick=()=>leave().catch(e=>toast(e.message));$('#cad-nav').onclick=()=>toggleCanvas().catch(e=>toast(e.message));narrowMedia.addEventListener('change',()=>{initialLayoutPending=narrowCanvas!==narrowMedia.matches;refresh().catch(e=>toast(e.message));});
$('#import').onclick=$('#welcome-import').onclick=()=>$('#file-input').click();$('#file-input').onchange=async e=>{const file=e.target.files[0];e.target.value='';try{await importFile(file);}catch(error){toast(error.message);}};
$('#save').onclick=()=>save().catch(e=>toast(e.message));$('#fit').onclick=()=>task('Fitting the active layout…',()=>mutation({op:'action',name:'zoom_extents'})).catch(e=>toast(e.message));
$('#history-menu').onclick=()=>{dialog('Drawing history','<p class="dialog-copy">Undo and redo apply to the active CAD drawing.</p>',[{label:'Undo',run:()=>task('Undoing CAD edit…',()=>mutation({op:'undo'}))},{label:'Redo',run:()=>task('Redoing CAD edit…',()=>mutation({op:'redo'}))}]);};
$('#studio-info').onclick=()=>dialog('CAD Studio · Open CAD Studio',`<p class="dialog-copy">This page embeds the ready-made Open CAD Studio editor. Use its ribbon and command line for native CAD drawing, selection, movement, layers, blocks and layouts.</p><dl class="studio-facts"><dt>CAD engine</dt><dd>Open CAD Studio v2026.44 · Hakan Seven and contributors</dd><dt>License</dt><dd>GPL-3.0 · corresponding source available</dd><dt>Processing</dt><dd>Local WebAssembly · no drawing upload</dd><dt>Save</dt><dd>DWG 2018 copy. Lossy conversion is not automatically allowed.</dd><dt>Workspace</dt><dd>CAD edits here are separate from the electrical circuits and annotations saved in the Electrical workspace.</dd><dt>Limitations</dt><dd>External references and custom fonts may require their original files.${state?.missing_fonts?.length?'<br>Missing font files: '+state.missing_fonts.map(esc).join(', '):''} Native file support is not a guarantee of complete fidelity for every drawing or physical-mobile acceptance.</dd></dl><p class="dialog-copy"><a href="cad-sources.html" target="_blank" rel="noopener">Source, licenses and component changes</a> · <a href="app/LICENSE-GPL-3.0.txt" target="_blank" rel="noopener">Component license</a></p>`,[{label:'Close',primary:true,run:()=>{}}]);
desktopUi=setupDesktop({dialog,toast,importFile,dirty,save,discard:()=>{pendingDownloads.clear();state=null;disposed=true;},confirmAction,sourceName:()=>sourceName});
window.addEventListener('beforeunload',e=>{if(!disposed&&dirty()){e.preventDefault();e.returnValue='';}});window.addEventListener('pagehide',()=>{disposed=true;clearInterval(pollTimer);});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save().catch(error=>toast(error.message));}});
async function initialize(){
 try{localStorage.setItem('opencadstudio.automation','1');}catch{}
 const engineUrl=new URL('app/index.html',document.baseURI);
 if(new URLSearchParams(location.search).get('renderer')==='host'||unifiedWeb)engineUrl.searchParams.set('spark_host','1');
 if(unifiedWeb)engineUrl.searchParams.set('spark_core',CAD_CORE);
 const inner=await waitForCadEngine(frame,engineUrl,{core:CAD_CORE,onStage:text=>$('#studio-loading p').textContent=text});
 // Keep GUI exports inside the same themed host save flow.
 inner.openCadStudioSaveFile=(name,bytes)=>{const id=state?.document_id;pendingDownloads.add(id);deliver(new Uint8Array(bytes),name).then(ok=>{if(ok!==false)pendingDownloads.delete(id);refresh();}).catch(e=>toast('Export failed: '+e.message));};
 const nativeClick=inner.HTMLInputElement.prototype.click;inner.HTMLInputElement.prototype.click=function(){if(this.type!=='file')return nativeClick.call(this);if(!desktop){this.removeAttribute('accept');return nativeClick.call(this);}const input=this;desktopUi.chooseFile().then(file=>{if(!file){input.dispatchEvent(new inner.Event('cancel'));return;}const transfer=new inner.DataTransfer();transfer.items.add(new inner.File([file.bytes],file.name));input.files=transfer.files;input.dispatchEvent(new inner.Event('change',{bubbles:true}));}).catch(e=>toast(e.message));};
 api=inner.ocsControl;window.sparkCadStudio={read,mutation,importFile,save,refresh,toggleCanvas,deliver,finishWorkspaceStartup:()=>{workspaceReady=true;update();},restartWorkspace:()=>{disposed=true;clearInterval(pollTimer);try{frame.contentWindow.onbeforeunload=null;}catch{}location.reload();},setPresentation:value=>{presentation=value;update();},get compact(){return narrowCanvas||!!state?.hosted_view;},get busy(){return busy||layoutJob;},get state(){return state;}};await refresh({timeoutMs:15000});$('#studio-loading').hidden=true;$('#studio-operation').textContent='Local processing · original files retained';resolveReady();pollTimer=setInterval(()=>refresh().catch(e=>toast(e.message)),2500);
 const pending=await pendingCadFile();if(pending){if(unifiedWeb){while(!disposed&&(!window.sparkWorkspace?.ready||window.sparkWorkspace.busy))await new Promise(r=>setTimeout(r,100));}else while(!disposed&&(busy||layoutJob||state?.modal)){await new Promise(r=>setTimeout(r,200));await refresh();}if(disposed)return;try{if(unifiedWeb)await window.sparkWorkspace.importFile(pending.file);else await importFile(pending.file);await consumeCadFile(pending.id);}catch(error){toast('Could not open the transferred drawing: '+error.message);}}
}
initialize().catch(error=>{rejectReady(error);showCadStartupFailure(error);});
