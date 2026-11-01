// Read-only real-file verification: exercise every rendered root entity type.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.CODEX_GENERATED_OUTPUT,report={status:'RUNNING',checks:[],errors:[]};
if(!root||!process.env.DWG_PATH)throw Error('Use a guarded job and DWG_PATH.');
const url=process.env.SPARK_NATIVE_URL||'http://127.0.0.1:5173/';
async function post(mode,body){const r=await fetch(url+'api/'+mode+'?format=dwg',{method:'POST',body});if(!r.ok)throw Error(await r.text());return mode==='import'?r.json():Buffer.from(await r.arrayBuffer());}
const bounds=items=>[Math.min(...items.map(i=>i.bounds[0])),Math.min(...items.map(i=>i.bounds[1])),Math.max(...items.map(i=>i.bounds[2])),Math.max(...items.map(i=>i.bounds[3]))];
(async()=>{
 await fs.writeFile(path.join(root,'tests/native-source-edits.json'),JSON.stringify(report));
 const original=await fs.readFile(process.env.DWG_PATH),before=await post('import',original),types=new Map(),group=new Map();
 for(const item of before.items){if(!group.has(item.owner))group.set(item.owner,[]);group.get(item.owner).push(item);}
 for(const object of before.sourceObjects||[])if(group.has(object.handle)){const type=object.type==='Hatch'?'Hatch '+(group.get(object.handle).some(i=>i.patterns?.length)?'patterned':'solid'):object.type;if(!types.has(type))types.set(type,object.handle);}
 const cadMoves=Object.fromEntries([...types.values()].map(owner=>[owner,{dx:before.factor*2,dy:before.factor*3}]));
 const exported=await post('export',JSON.stringify({factor:before.factor,original:original.toString('base64'),originalFormat:'dwg',cadMoves,segments:[],labels:[]})),after=await post('import',exported);
 for(const [type,owner]of types){const a=group.get(owner),b=after.items.filter(i=>i.owner===owner);assert.equal(b.length,a.length,type+' lost display parts');const x=bounds(a),y=bounds(b),m=cadMoves[owner];report.lastBounds={type,owner,before:x,after:y,move:m,error:y.map((v,n)=>v-x[n]-(n%2?m.dy:m.dx))};if(report.lastBounds.error.some(v=>Math.abs(v)>=.1)){const parts=items=>items.slice(0,12).map(({kind,bounds,text,height,x,y,rotation,sourceType,d})=>({kind,bounds,text,height,x,y,rotation,sourceType,d:d?.slice(0,800)}));report.lastParts={before:parts(a),after:parts(b)};}for(let n=0;n<4;n++)assert(Math.abs(report.lastBounds.error[n])<.1,type+' native movement bounds mismatch');
  for(let n=0;n<a.length;n++)if(a[n].patterns?.length){assert.equal(b[n].patterns.length,a[n].patterns.length);for(let k=0;k<a[n].patterns.length;k++){const p=a[n].patterns[k],q=b[n].patterns[k];assert(Math.abs(q.basePoint[0]-p.basePoint[0]-m.dx)<.1&&Math.abs(q.basePoint[1]-p.basePoint[1]-m.dy)<.1,type+' hatch phase did not move with the boundary');assert.deepEqual(q.axis,p.axis,type+' changed hatch angle');assert.deepEqual(q.step,p.step,type+' changed hatch spacing');assert.deepEqual(q.dashes,p.dashes,type+' changed hatch dash lengths');}}
  report.checks.push(type+' root movement and parts preserved');
 }
 const unchanged=[...group.keys()].find(id=>!cadMoves[id]);if(unchanged){assert.deepEqual(bounds(after.items.filter(i=>i.owner===unchanged)),bounds(group.get(unchanged)));report.checks.push('Unselected source object unchanged');}
 assert.equal(after.items.length,before.items.length);assert.deepEqual(after.coverage,before.coverage);report.checks.push('Total geometry and type coverage unchanged');report.status='PASS';
})().catch(e=>{report.status='FAIL';report.failure=e.stack;process.exitCode=1;}).finally(async()=>{await fs.writeFile(path.join(root,'tests/native-source-edits.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));});
