// A private worker hosts the CAD runtime for one operation. Source files never
// leave the device, and terminating the worker releases the managed heap.
// Our own message handler must not be mistaken for a .NET pthread worker.
self.dotnetSidecar=true;
self.onmessage=async({data})=>{
 try{
  self.postMessage({phase:'Loading CAD engine…'});
  const {dotnet}=await import('./engine/_framework/dotnet.js');
  const runtime=await dotnet.withDiagnosticTracing(false).create();
  const config=runtime.getConfig(),exports=await runtime.getAssemblyExports(config.mainAssemblyName);
  self.postMessage({phase:data.mode==='import'?'Reading drawing…':'Writing CAD drawing…'});
  if(data.mode==='import'){
   const json=exports.BrowserCad.Import(new Uint8Array(data.bytes),data.format);
   self.postMessage({ok:true,json});
  }else{
   const result=exports.BrowserCad.Export(new Uint8Array(data.bytes),data.format),bytes=new Uint8Array(result);
   self.postMessage({ok:true,bytes},[bytes.buffer]);
  }
 }catch(error){self.postMessage({ok:false,error:error?.message||String(error)});}
};
