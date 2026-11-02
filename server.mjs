import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';
const root=process.env.SPARK_WEB_ROOT||fileURLToPath(new URL('./web/',import.meta.url));
const decoder=process.env.SPARK_CAD_DLL||fileURLToPath(new URL('./.out/cad/CadBridge.dll',import.meta.url));
const engineRoot=process.env.SPARK_ENGINE_ROOT||fileURLToPath(new URL('./.out/browser/wwwroot/',import.meta.url));
const dotnet=process.env.SPARK_DOTNET||'dotnet';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm','.json':'application/json','.webp':'image/webp'};
let busy=false;
async function body(req,max=64*1024*1024){let size=0;const parts=[];for await(const p of req){size+=p.length;if(size>max)throw Error('Request exceeds the local file-size limit.');parts.push(p);}return Buffer.concat(parts);}
function bridge(buffer,mode,format){return new Promise((resolve,reject)=>{
 const p=spawn(dotnet,[decoder,mode,format],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out=[],err='',length=0;
 const timer=setTimeout(()=>{p.kill();reject(Error('CAD conversion timed out after 120 seconds.'));},120000);
 p.stdout.on('data',b=>{length+=b.length;if(length>100*1024*1024){p.kill();reject(Error('Drawing output is too large.'));}else out.push(b);});
 p.stderr.on('data',b=>{err=(err+b.toString()).slice(-6000);});p.on('error',reject);p.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.concat(out)):reject(Error(err||'CAD conversion failed.'));});p.stdin.on('error',()=>{});p.stdin.end(buffer);
});}
http.createServer(async(req,res)=>{
 const send=(code,b,type='application/json')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(b);};
 try{
  const u=new URL(req.url,'http://127.0.0.1:5173');
  if(req.headers.origin&&req.headers.origin!=='http://127.0.0.1:5173'&&req.headers.origin!=='http://localhost:5173')return send(403,'{"error":"Local origin required"}');
  if(u.pathname==='/api/health'){let cad=true;try{await stat(decoder);}catch{cad=false;}return send(200,JSON.stringify({name:'SparkWorld',creator:'Aris',version:'0.1.0',cad,decoder:'ACadSharp 3.6.51 / MIT',port:5173}));}
  if(req.method==='POST'&&['/api/import','/api/export'].includes(u.pathname)){
   if(busy)return send(409,'{"error":"Another CAD conversion is running. Retry when it finishes."}');
   if(!['dwg','dxf'].includes(u.searchParams.get('format')))return send(400,'{"error":"Choose DWG or DXF."}');
   busy=true;try{const data=await body(req,u.pathname==='/api/export'?96*1024*1024:48*1024*1024);const result=await bridge(data,u.pathname==='/api/import'?'import':'export',u.searchParams.get('format'));send(200,result,u.pathname==='/api/import'?'application/json':'application/octet-stream');}finally{busy=false;}return;
  }
  if(!['GET','HEAD'].includes(req.method))return send(405,'{"error":"Method not allowed"}');
  const route=u.pathname.replace(/^\/spark(?=\/|$)/,'')||'/';
  const isEngine=route.startsWith('/engine/'),base=isEngine?engineRoot:root;
  const relative=decodeURIComponent(isEngine?route.slice(8):route==='/'?'index.html':route.slice(1));
  const file=path.resolve(base,relative);if(!file.startsWith(path.resolve(base)+path.sep))return send(403,'{"error":"Forbidden"}');
  const b=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':b.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:b);
 }catch(e){send(e.code==='ENOENT'?404:400,JSON.stringify({error:e.message}));}
}).listen(5173,'127.0.0.1',()=>console.log('SparkWorld: http://127.0.0.1:5173/'));
