// One bounded startup covers downloads, iframe load and the native bridge.
export async function waitForCadEngine(frame,url,{core,timeoutMs=120000,onStage=()=>{}}={}){
 const controller=new AbortController(),timeout=Error('The CAD engine did not finish loading. Check your connection and retry.');
 const timer=setTimeout(()=>controller.abort(timeout),timeoutMs),signal=controller.signal;
 let poll,onLoad,onError,onAbort,inner,onNativeError;
 try{
  if(typeof WebAssembly!=='object')throw Error('This browser cannot run the CAD engine. Enable WebAssembly or use a supported browser.');
  onStage('Checking CAD files…');
  const manifestResponse=await fetch(new URL('.component-manifest.json',url),{cache:'no-cache',signal});
  if(!manifestResponse.ok)throw Error('The CAD engine files are unavailable. Retry after the website update finishes.');
  const manifest=await manifestResponse.json();
  if(manifest.integration_commit!==core)throw Error('The CAD engine update is incomplete. Retry after the website update finishes.');
  const wasm=Object.keys(manifest.files||{}).find(name=>/^OpenCADStudio-[a-f\d]+_bg\.wasm$/.test(name));
  const script=Object.keys(manifest.files||{}).find(name=>/^OpenCADStudio-[a-f\d]+\.js$/.test(name));
  if(!wasm||!script)throw Error('The CAD engine download is incomplete. Please retry.');
  const assets=await Promise.all(['index.html','ocs-control.js',script,wasm].map(name=>fetch(new URL(name,url),{method:'HEAD',cache:'no-cache',signal})));
  if(assets.some(asset=>!asset.ok)||!assets.at(-1).headers.get('content-type')?.includes('application/wasm'))throw Error('The CAD engine download is unavailable. Check your connection and retry.');
  onStage('Loading the CAD engine. The first visit downloads a large file; keep this tab open.');
  return await new Promise((resolve,reject)=>{
   const check=()=>{try{
    const window=frame.contentWindow;
    if(window?.ocsControl&&window.wasmBindings?.ocs_control_submit)resolve(window);
   }catch(error){reject(error);}};
   onLoad=()=>{
    inner=frame.contentWindow;
    onNativeError=event=>reject(Error(event.reason?.message||event.message||'The CAD engine could not start in this browser. Please retry.'));
    inner.addEventListener('error',onNativeError);inner.addEventListener('unhandledrejection',onNativeError);
    onStage('Starting the drawing engine…');check();
   };
   onError=()=>reject(Error('The CAD engine page could not load. Check your connection and retry.'));
   onAbort=()=>reject(timeout);
   frame.addEventListener('load',onLoad);frame.addEventListener('error',onError);signal.addEventListener('abort',onAbort,{once:true});
   poll=setInterval(check,50);
   // Install handlers before navigation, including when the page is cached.
   frame.src=url;
   if(signal.aborted)onAbort();
  });
 }catch(error){throw signal.aborted?timeout:error;}
 finally{
  clearTimeout(timer);clearInterval(poll);
  frame.removeEventListener('load',onLoad);frame.removeEventListener('error',onError);signal.removeEventListener('abort',onAbort);
  inner?.removeEventListener('error',onNativeError);inner?.removeEventListener('unhandledrejection',onNativeError);
 }
}

export function showCadStartupFailure(error){
 const loading=document.querySelector('#studio-loading');if(!loading)return;
 loading.hidden=false;loading.dataset.failed='true';
 loading.querySelector('.spinner').hidden=true;
 loading.querySelector('h1').textContent='CAD workspace could not start';
 loading.querySelector('p').textContent=error.message+' Your original files and saved projects are unchanged.';
 const retry=document.querySelector('#retry-cad');retry.hidden=false;retry.onclick=()=>location.reload();
 const status=document.querySelector('#engine-status');if(status)status.textContent='CAD engine unavailable';
 const operation=document.querySelector('#studio-operation');if(operation)operation.textContent='Startup failed · retry to reconnect';
}
