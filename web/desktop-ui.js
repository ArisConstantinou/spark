import {desktop,hostRequest,onHostEvent,saveDesktop} from './platform.js';
import {escape as esc} from './model.js';
const $=s=>document.querySelector(s);
const paths={folder:'M3 5h6l2 2h10v12H3z',file:'M6 3h8l4 4v14H6z M14 3v5h5',cad:'M4 19V5h7v8h9v6z M11 5h9v8',up:'M12 20V4 M5 11l7-7 7 7'};
const icon=kind=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[kind]||paths.file}"/></svg>`;

export function setupDesktop({dialog,toast,importFile,dirty,save,discard,confirmAction,sourceName}){
 if(!desktop)return null;document.body.classList.add('desktop-app');
 const controls=document.createElement('div');controls.className='desktop-window-controls';controls.setAttribute('aria-label','Window controls');
 for(const [name,path,action]of [['Minimize','M5 12h14','window.minimize'],['Maximize','M6 6h12v12H6z','window.maximize'],['Close','M6 6l12 12 M18 6L6 18','close']]){
  const button=document.createElement('button');button.type='button';button.title=button.ariaLabel=name;button.innerHTML=`<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;button.onclick=()=>action==='close'?requestClose():hostRequest(action).catch(e=>toast(e.message));controls.append(button);
 }$('.topbar').append(controls);
 const draggable=e=>!e.target.closest('button,input,select,textarea');$('.topbar').addEventListener('pointerdown',e=>{if(e.button===0&&draggable(e))hostRequest('window.drag').catch(e=>toast(e.message));});$('.topbar').addEventListener('dblclick',e=>{if(draggable(e))hostRequest('window.maximize').catch(e=>toast(e.message));});$('.brand').onclick=e=>e.preventDefault();
 let closing=false;$('#dialog').addEventListener('close',()=>closing=false);
 function requestClose(){if(closing)return;if(!dirty()){discard();hostRequest('window.close').catch(()=>{});return;}closing=true;dialog('Close SparkWorld?',`<p class="dialog-copy">Save your current drawing on this device before closing?</p>`,[{label:'Cancel',run:()=>{}},{label:'Discard changes',run:()=>{discard();hostRequest('window.close').catch(()=>{});}},{label:'Save and close',primary:true,run:async()=>{if(!(await save(false)))return false;discard();hostRequest('window.close').catch(()=>{});}}]);}
 onHostEvent(e=>{if(e.event==='close-request')requestClose();});
 let lastFolder='';
 function picker({saveMode=false,name='',allFiles=false}){
  return new Promise(resolve=>{
   let folder=lastFolder,selected='',version=0,finished=false;
   const finish=value=>{if(finished)return;finished=true;$('#dialog').removeEventListener('close',cancel);$('#dialog').close();resolve(value);};
   const cancel=()=>finish(null);$('#dialog').addEventListener('close',cancel,{once:true});
   dialog(saveMode?'Save your drawing':'Open a drawing',`<div class="desktop-file-path"><button type="button" id="file-up" aria-label="Parent folder">${icon('up')}</button><input id="file-folder" aria-label="Folder path"><button type="button" id="file-go">Go</button></div><div class="desktop-file-browser"><nav id="file-shortcuts" aria-label="Folders"></nav><div class="desktop-file-main"><label class="search"><input id="file-filter" type="search" aria-label="Filter files" placeholder="Filter files in this folder"></label><div id="desktop-file-list" class="desktop-file-list" role="list"></div><p id="file-list-info" class="inspector-note"></p></div></div><label class="field">${saveMode?'File name':'Selected file'}<input id="file-name" value="${esc(name)}" aria-label="File name"></label>`,[{label:'Cancel',run:()=>{finish(null);return false;}},{label:saveMode?'Save file':'Open drawing',primary:true,run:async()=>{
    const filename=$('#file-name').value.trim();if(!filename){toast('Select or enter a file name.');return false;}
    const path=/^[A-Za-z]:[\\/]/.test(filename)?filename:folder.replace(/[\\/]+$/,'')+'\\'+filename;
    if(saveMode){if(sourceName()&&filename.toLowerCase()===sourceName().toLowerCase()){toast('Choose a different name to retain the original reference file.');return false;}const stat=await hostRequest('file.stat',{path});if(stat.exists&&!(await confirmAction('Replace the existing exported file “'+filename+'”?',{title:'Replace file?',confirmLabel:'Replace'})))return false;finish({path,stamp:stat.stamp});}
    else finish({path:selected||path});return false;
   }}]);
   async function load(path){selected='';const own=++version;$('#file-list-info').textContent='Reading this folder…';try{const data=await hostRequest('file.list',{path,query:$('#file-filter').value});if(own!==version||finished)return;folder=data.path;lastFolder=folder;$('#file-folder').value=folder;$('#file-up').disabled=!data.parent;$('#file-up').onclick=()=>load(data.parent);$('#file-shortcuts').innerHTML=data.shortcuts.map(s=>`<button type="button" data-folder="${esc(s.path)}">${icon('folder')}<span>${esc(s.name)}</span></button>`).join('');$('#file-shortcuts').querySelectorAll('[data-folder]').forEach(b=>b.onclick=()=>load(b.dataset.folder));
    const show=()=>{const q=$('#file-filter').value.toLowerCase(),entries=data.entries.filter(e=>(e.directory||saveMode||allFiles||/\.(dwg|dxf|json|png|jpe?g|webp)$/i.test(e.name))&&e.name.toLowerCase().includes(q));$('#desktop-file-list').innerHTML=entries.map(e=>`<button type="button" class="desktop-file-row" data-path="${esc(e.path)}" data-folder="${e.directory?'yes':'no'}" data-name="${esc(e.name)}">${icon(e.directory?'folder':/\.(dwg|dxf)$/i.test(e.name)?'cad':'file')}<span>${esc(e.name)}</span><small>${e.directory?'Folder':e.length<1024?e.length+' B':(e.length/1024).toLocaleString('en',{maximumFractionDigits:0})+' KB'}</small></button>`).join('');$('#file-list-info').textContent=entries.length+' matching entries'+(data.truncated?' · first 2,000 matches · narrow the filter to find more':'');$('#desktop-file-list').querySelectorAll('[data-path]').forEach(b=>{b.onclick=()=>{if(b.dataset.folder==='yes')load(b.dataset.path);else{selected=b.dataset.path;$('#file-name').value=b.dataset.name;$('#desktop-file-list').querySelectorAll('button').forEach(v=>v.classList.toggle('selected',v===b));}};b.ondblclick=()=>{if(b.dataset.folder==='no'&&!saveMode){finish({path:b.dataset.path});}};});};let filterTimer;$('#file-filter').oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(()=>load(folder),160);};show();
   }catch(e){if(own===version&&!finished){$('#file-list-info').textContent=e.message;toast(e.message);}}}
   $('#file-name').oninput=()=>selected='';$('#file-go').onclick=()=>load($('#file-folder').value);$('#file-folder').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();load(e.target.value);}};load(folder);
  });
 }
 async function open(){try{const chosen=await picker({});if(!chosen)return;const file=await hostRequest('file.read',chosen),bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));await importFile(new File([bytes],file.name));}catch(e){toast('Could not open the file: '+e.message);}}
 for(const id of ['import','welcome-import'])$('#'+id).onclick=open;
 return{open,async chooseFile(){const chosen=await picker({allFiles:true});if(!chosen)return null;const file=await hostRequest('file.read',chosen);return{name:file.name,bytes:Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0))};},async saveData(data,name,mime){const selected=await picker({saveMode:true,name});if(!selected)return false;const bytes=data instanceof Blob?new Uint8Array(await data.arrayBuffer()):typeof data==='string'?new TextEncoder().encode(data):new Uint8Array(data);await saveDesktop(bytes,name,mime,selected);toast('File saved.');return true;}};
}
