const local=['127.0.0.1','localhost'].includes(location.hostname);
export const desktop=!!globalThis.chrome?.webview;
const browserEngine=!desktop&&(!local||new URLSearchParams(location.search).get('engine')==='browser');
const pending=new Map(),listeners=new Set();let serial=0;
if(desktop)chrome.webview.addEventListener('message',({data})=>{
 if(data.event){for(const listener of listeners)listener(data);return;}
 const job=pending.get(data.id);if(!job)return;
 if(data.chunk!==undefined){job.chunks.push(data.chunk);return;}
 pending.delete(data.id);clearTimeout(job.timer);
 if(data.error)job.reject(Error(data.error));else{let result=data.result;if(data.chunked)result=JSON.parse(job.chunks.join(''));job.resolve(result);}
});
export const onHostEvent=listener=>{listeners.add(listener);return()=>listeners.delete(listener);};
export function hostRequest(method,args={}){
 if(!desktop)return Promise.reject(Error('This action requires SparkWorld for Windows.'));
 return new Promise((resolve,reject)=>{const id=String(++serial),timer=setTimeout(()=>{pending.delete(id);reject(Error('The desktop operation timed out.'));},180000);pending.set(id,{resolve,reject,timer,chunks:[]});chrome.webview.postMessage({id,method,args});});
}
function wasmJob(mode,format,data,onPhase){
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./cad-engine-worker.js',import.meta.url),{type:'module'}),bytes=new Uint8Array(data).slice();const timer=setTimeout(()=>finish(Error('CAD processing timed out. Try a floor-specific drawing.')),180000);
  function finish(error,result){clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);}
  worker.onmessage=({data})=>{if(data.phase){onPhase?.(data.phase);return;}if(!data.ok)return finish(Error(data.error));try{finish(null,mode==='import'?JSON.parse(data.json):data.bytes);}catch(e){finish(e);}};
  worker.onerror=e=>finish(Error(e.message||'The browser CAD engine could not start.'));
  worker.postMessage({mode,format,bytes:bytes.buffer},[bytes.buffer]);
 });
}
async function uploadHost(method,bytes,args){
 const upload=await hostRequest('upload.begin',{length:bytes.byteLength});
 try{const data=new Uint8Array(bytes);for(let n=0;n<data.length;n+=131072){let raw='';for(const byte of data.subarray(n,n+131072))raw+=String.fromCharCode(byte);await hostRequest('upload.chunk',{token:upload.token,data:btoa(raw)});}return await hostRequest(method,{...args,token:upload.token});}finally{hostRequest('upload.release',{token:upload.token}).catch(()=>{});}
}
export async function importCad(bytes,format,onPhase){
 if(desktop)return uploadHost('cad.import',bytes,{format});
 if(browserEngine)return wasmJob('import',format,bytes,onPhase);
 const res=await fetch(new URL('api/import?format='+format,document.baseURI),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes});const data=await res.json();if(!res.ok)throw Error(data.error);return data;
}
export async function exportCad(request,format,onPhase){
 const bytes=new TextEncoder().encode(JSON.stringify(request));
 if(desktop){const data=await uploadHost('cad.export',bytes,{format});return Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0));}
 if(browserEngine)return wasmJob('export',format,bytes,onPhase);
 const res=await fetch(new URL('api/export?format='+format,document.baseURI),{method:'POST',headers:{'Content-Type':'application/json'},body:bytes});if(!res.ok)throw Error((await res.json()).error);return new Uint8Array(await res.arrayBuffer());
}
export async function health(){
 if(desktop)return hostRequest('app.info');
 if(browserEngine){const response=await fetch(new URL('./engine/_framework/dotnet.js',import.meta.url),{method:'HEAD'});return{cad:response.ok,mode:'browser',decoder:'ACadSharp 3.6.51 · WebAssembly'};}
 return(await fetch(new URL('api/health',document.baseURI))).json();
}
export async function saveDesktop(bytes,name,mime,options){return uploadHost('file.save',bytes,{name,mime,...options});}
