// Real stage boundaries, never a guessed percent based on compressed DWG size.
const marker='sparkworld-opening-drawing';
const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
export function interruptedImport(){try{return JSON.parse(sessionStorage.getItem(marker)||'null');}catch{return null;}}
export function clearInterruptedImport(){try{sessionStorage.removeItem(marker);}catch{}}
export function drawingLoader(file,{restoring=false}={}){
 const previousFocus=document.activeElement,controller=new AbortController(),started=performance.now();
 const overlay=document.createElement('section');overlay.id='cad-import-progress';overlay.className='cad-import-progress';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','cad-import-title');
 overlay.innerHTML='<div class="cad-import-card"><div class="cad-import-heading"><span class="spinner" aria-hidden="true"></span><span class="eyebrow">LOCAL DRAWING IMPORT</span></div><h1 id="cad-import-title">Opening your drawing</h1><div class="cad-import-file"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h5"/></svg><div><strong></strong><span></span></div></div><ol><li>Read file</li><li>Open CAD</li><li>Save on device</li></ol><h2 id="cad-import-stage" role="status" aria-live="polite"></h2><p class="cad-import-detail"></p><div class="cad-import-bottom"><span class="cad-import-elapsed"></span><button type="button">Cancel reading</button></div><p class="cad-import-privacy">Drawing data stays on this device.</p></div>';
 overlay.querySelector('.cad-import-file strong').textContent=file.name;
 overlay.querySelector('.cad-import-file span').textContent=(file.size/1048576).toLocaleString(undefined,{maximumFractionDigits:2})+' MiB · '+file.name.split('.').at(-1).toUpperCase();
 if(restoring){overlay.querySelector('.eyebrow').textContent='SAVED DRAWING';overlay.querySelector('#cad-import-title').textContent='Restoring your drawing';const steps=['Saved project','Open CAD','Restore settings'];overlay.querySelectorAll('li').forEach((item,i)=>item.textContent=steps[i]);}
 document.body.append(overlay);
 const roots=[document.querySelector('.topbar'),document.querySelector('.studio-workspace'),document.querySelector('.studio-footer')].filter(Boolean),wasInert=roots.map(root=>root.inert);roots.forEach(root=>root.inert=true);
 const cancel=overlay.querySelector('button');cancel.onclick=()=>controller.abort(new DOMException('Drawing import cancelled before decoding.','AbortError'));cancel.focus();
 const clock=setInterval(()=>overlay.querySelector('.cad-import-elapsed').textContent=Math.floor((performance.now()-started)/1000)+'s elapsed',1000);
 let stopped=false;
 return {
  signal:controller.signal,
  async stage(index,title,detail){
   controller.signal.throwIfAborted();
   overlay.querySelector('#cad-import-stage').textContent=title;overlay.querySelector('.cad-import-detail').textContent=detail;
   overlay.querySelectorAll('li').forEach((item,i)=>{item.dataset.state=i<index?'done':i===index?'current':'next';if(i===index)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
   cancel.hidden=index>0;
   try{sessionStorage.setItem(marker,JSON.stringify({name:file.name,size:file.size,stage:title,at:new Date().toISOString()}));}catch{}
   await paint();controller.signal.throwIfAborted();
  },
  finish(){if(stopped)return;stopped=true;clearInterval(clock);clearInterruptedImport();overlay.remove();roots.forEach((root,i)=>root.inert=wasInert[i]);if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});},
 };
}
export async function readSelectedFile(file,signal,{text=false}={}){
 signal?.throwIfAborted();
 return new Promise((resolve,reject)=>{
  const reader=new FileReader(),abort=()=>{reader.abort();reject(signal.reason);};
  signal?.addEventListener('abort',abort,{once:true});
  const clean=()=>signal?.removeEventListener('abort',abort);
  reader.onload=()=>{clean();resolve(text?reader.result:new Uint8Array(reader.result));};
  reader.onerror=()=>{clean();reject(reader.error||Error('The selected file could not be read.'));};
  reader.onabort=()=>{clean();reject(signal?.reason||Error('Reading cancelled.'));};
  if(text)reader.readAsText(file);else reader.readAsArrayBuffer(file);
 });
}
export async function readDrawing(file,signal){
 const bytes=await readSelectedFile(file,signal);
 // Multiples of three make independently encoded chunks join losslessly.
 // Release each short binary string instead of retaining a file-sized one.
 const chunks=[];
 for(let offset=0;offset<bytes.length;offset+=196608){
  signal?.throwIfAborted();const part=bytes.subarray(offset,offset+196608);let raw='';
  for(let i=0;i<part.length;i+=32768)raw+=String.fromCharCode(...part.subarray(i,i+32768));
  chunks.push(btoa(raw));if(offset%1572864===0)await paint();
 }
 signal?.throwIfAborted();return chunks.join('');
}
