export const SCHEMA='sparkworld/v1';
export const uid=()=>crypto.randomUUID();
export const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const circle=(r=11)=>Array.from({length:33},(_,i)=>[Math.cos(i*Math.PI/16)*r,Math.sin(i*Math.PI/16)*r]);
const rect=(w=24,h=18)=>[[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,-h/2]];
const box=(x,y,w,h)=>rect(w,h).map(p=>[p[0]+x,p[1]+y]);
// Front-view Type G: vertical earth above horizontal neutral and line slots.
const typeG=(x=0,y=0,k=1)=>[box(x,y-5*k,2*k,5*k),box(x-5*k,y+3*k,4*k,2*k),box(x+5*k,y+3*k,4*k,2*k)];
export const SYMBOLS=[
 {id:'ceiling',name:'Ceiling light',category:'Lighting',prefix:'L',color:'#52db9a',lines:[circle(),[[-8,-8],[8,8]],[[-8,8],[8,-8]]]},
 {id:'downlight',name:'Downlight',category:'Lighting',prefix:'L',color:'#52db9a',lines:[circle(),circle(3)]},
 {id:'pendant',name:'Pendant',category:'Lighting',prefix:'L',color:'#52db9a',lines:[circle(8),[[0,-16],[0,-8]]]},
 {id:'wall-light',name:'Wall light',category:'Lighting',prefix:'L',color:'#52db9a',lines:[circle(9),[[-13,-14],[-13,14]]]},
 {id:'single-socket',name:'Single 13A',category:'UK / Cyprus sockets',prefix:'S',color:'#64aaff',system:'Type G · BS 1363 pattern',gangs:1,lines:[rect(26,26),...typeG(0,2,.9),box(8,-8,3,5)]},
 {id:'double-socket',name:'Double 13A',category:'UK / Cyprus sockets',prefix:'S',color:'#64aaff',system:'Type G · BS 1363 pattern',gangs:2,lines:[rect(32,19),...typeG(-9,2,.65),...typeG(7,2,.65),box(-2,-5,3,5),box(14,-5,3,5)]},
 {id:'weatherproof',name:'Outdoor 13A',category:'UK / Cyprus sockets',prefix:'S',color:'#64aaff',system:'Type G · weatherproof enclosure',gangs:1,lines:[rect(28,30),rect(23,23),...typeG(0,2,.85),[[-11,-12],[11,-12]]]},
 {id:'switch',name:'1 gang switch',category:'Switches',prefix:'SW',color:'#d1a1ff',lines:[circle(4),[[3,-3],[12,-12]]]},
 {id:'switch2',name:'2 gang switch',category:'Switches',prefix:'SW',color:'#d1a1ff',lines:[circle(4),[[3,-3],[12,-12]],[[4,1],[15,-5]]]},
 {id:'ac',name:'AC indoor',category:'AC & Mechanical',prefix:'AC',color:'#ffb85e',lines:[rect(30,14),[[-11,3],[11,3]],[[-9,7],[-9,12]],[[0,7],[0,12]],[[9,7],[9,12]]]},
 {id:'data',name:'Data outlet',category:'Data & Media',prefix:'D',color:'#d1a1ff',lines:[rect(22,20),rect(10,9),[[-3,0],[-3,3]],[[0,0],[0,3]],[[3,0],[3,3]]]},
 {id:'tv',name:'TV outlet',category:'Data & Media',prefix:'TV',color:'#d1a1ff',lines:[rect(24,18),circle(4)]},
 {id:'board',name:'Distribution board',category:'Distribution',prefix:'DB',color:'#ffb85e',lines:[rect(26,30),[[-7,-8],[7,-8]],[[-7,0],[7,0]],[[-7,8],[7,8]]]},
];
export function symbolSVG(type){const s=SYMBOLS.find(s=>s.id===type)||SYMBOLS[0];return s.lines.map(p=>`<polyline points="${p.map(v=>v.join(',')).join(' ')}"/>`).join('');}
export function blank(name='Untitled drawing'){return{schema:SCHEMA,id:uid(),name,created:new Date().toISOString(),updated:new Date().toISOString(),objects:[],wires:[],measures:[],circuits:[],hiddenLayers:[],cad:null,background:null,calibrated:false,grid:100};}
export function validate(raw){
 if(!raw||![SCHEMA,'aris-volt/v1','fyp-electrical/v1'].includes(raw.schema)||!Array.isArray(raw.objects)||!Array.isArray(raw.wires)||!Array.isArray(raw.circuits))throw Error('This is not an SparkWorld drawing.');
 if(raw.objects.length>20000||raw.wires.length>20000||raw.circuits.length>2000)throw Error('Drawing exceeds safe editor limits.');
 for(const o of raw.objects){if(!SYMBOLS.some(s=>s.id===o.type)||![o.x,o.y,o.rotation,o.size].every(Number.isFinite)||o.size<=0||o.size>1e7)throw Error('Invalid symbol data.');}
 for(const w of [...raw.wires,...(raw.measures||[])]){if(!Array.isArray(w.points)||w.points.length<2||w.points.length>10000||!w.points.every(p=>p.length===2&&p.every(Number.isFinite)))throw Error('Invalid route geometry.');}
 if(raw.background&&!/^data:image\/(png|jpeg|webp);base64,/.test(raw.background.data))throw Error('Unsupported image reference.');
 if(raw.cad&&(!Array.isArray(raw.cad.items)||raw.cad.items.length>120000))throw Error('Invalid CAD reference.');
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v);
 const nums=a=>Array.isArray(a)&&a.every(v=>Number.isFinite(v)&&Math.abs(v)<1e12);
 const text=(v,n=500)=>typeof v==='string'&&v.length<=n;
 if(!id(raw.id)||!text(raw.name,120)||!Number.isFinite(raw.grid)||raw.grid<1||raw.grid>10000||typeof raw.calibrated!=='boolean'||!Array.isArray(raw.hiddenLayers)||!raw.hiddenLayers.every(v=>text(v)))throw Error('Invalid drawing metadata.');
 const seen=new Set();for(const v of [...raw.objects,...raw.wires,...(raw.measures||[]),...raw.circuits]){if(!id(v.id)||seen.has(v.id))throw Error('Invalid or duplicate object identifier.');seen.add(v.id);}
 if((raw.measures||[]).length>20000)throw Error('Too many measurements.');
 for(const o of raw.objects)if(!text(o.label,120)||!text(o.note,2000)||!Number.isFinite(o.height)||o.height<0||!nums([o.x,o.y,o.rotation,o.size])||!(o.circuit===''||id(o.circuit)))throw Error('Invalid symbol properties.');
 for(const c of raw.circuits)if(!text(c.ref,80)||!text(c.name,120)||!text(c.type,80)||!text(c.notes,2000)||!/^#[a-f\d]{6}$/i.test(c.color))throw Error('Invalid circuit properties.');
 for(const w of raw.wires)if(!(w.circuit===''||id(w.circuit)))throw Error('Invalid route circuit.');
 for(const w of [...raw.wires,...(raw.measures||[])])if(!w.points.every(nums))throw Error('Geometry is outside editor limits.');
 if(raw.background&&(!nums([raw.background.width,raw.background.height])||raw.background.width<=0||raw.background.height<=0||!text(raw.background.name,300)))throw Error('Invalid image dimensions.');
 if(raw.cad){const c=raw.cad;if(!nums(c.bounds)||c.bounds.length!==4||!Number.isFinite(c.factor)||c.factor<=0||!Array.isArray(c.layers)||!c.layers.every(l=>text(l.name))||!text(c.original,70*1024*1024)||!['dwg','dxf'].includes(c.originalFormat)||!text(c.fileName,300))throw Error('Invalid CAD metadata.');
  for(const i of c.items){if(!text(i.layer)||(i.visibilityLayers&&(!Array.isArray(i.visibilityLayers)||!i.visibilityLayers.every(v=>text(v))))||!['text','path'].includes(i.kind))throw Error('Invalid CAD item.');if(i.kind==='path'){if(!text(i.d,1000000)||!/^[MLZmlz0-9eE.,+\s-]*$/.test(i.d))throw Error('Invalid CAD path.');if(i.fill!==undefined&&(!['solid','hatch'].includes(i.fill)||!['nonzero','evenodd'].includes(i.fillRule)))throw Error('Invalid CAD fill.');if(i.fill==='hatch'&&(!Array.isArray(i.patterns)||!i.patterns.length||i.patterns.length>100||!i.patterns.every(p=>['basePoint','axis','step'].every(k=>nums(p[k])&&p[k].length===2)&&nums(p.dashes)&&p.dashes.length<=100&&Math.abs(p.axis[0]*p.step[1]-p.axis[1]*p.step[0])>Math.hypot(...p.axis)*Math.hypot(...p.step)*1e-12)))throw Error('Invalid CAD hatch pattern.');}else if(!nums([i.x,i.y,i.height,i.rotation||0])||!text(i.text,100000))throw Error('Invalid CAD text.');}
 }
 if(!text(raw.created,40)||!text(raw.updated,40)||!Number.isFinite(Date.parse(raw.updated)))throw Error('Invalid save date.');
 return {...blank(),...structuredClone(raw),schema:SCHEMA,hiddenLayers:raw.hiddenLayers||[],measures:raw.measures||[]};
}
export class History{
 constructor(){this.undo=[];this.redo=[];}
 snapshot(d){return JSON.stringify({name:d.name,objects:d.objects,wires:d.wires,measures:d.measures,circuits:d.circuits,hiddenLayers:d.hiddenLayers,calibrated:d.calibrated,grid:d.grid,cadScale:d.cad?{factor:d.cad.factor,unitOverride:d.cad.unitOverride}:null,background:d.background?{width:d.background.width,height:d.background.height}:null});}
 push(d){this.undo.push(this.snapshot(d));if(this.undo.length>80)this.undo.shift();this.redo=[];}
 restore(d,s){const a=JSON.parse(s);if(a.background&&d.background){d.background.width=a.background.width;d.background.height=a.background.height;}if(a.cadScale&&d.cad){rescaleCad(d.cad,a.cadScale.factor);if(a.cadScale.unitOverride===undefined)delete d.cad.unitOverride;else d.cad.unitOverride=a.cadScale.unitOverride;}delete a.cadScale;delete a.background;Object.assign(d,a);}
 back(d){if(!this.undo.length)return false;this.redo.push(this.snapshot(d));this.restore(d,this.undo.pop());return true;}
 forward(d){if(!this.redo.length)return false;this.undo.push(this.snapshot(d));this.restore(d,this.redo.pop());return true;}
}
export function rescaleCad(cad,factor){const ratio=factor/cad.factor;if(!Number.isFinite(ratio)||ratio<=0)throw Error('Invalid CAD scale.');if(ratio!==1){for(const i of cad.items){if(i.bounds)i.bounds=i.bounds.map(v=>v*ratio);if(i.kind==='path'){i.d=i.d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi,v=>Number(v)*ratio);for(const p of i.patterns||[])for(const k of ['basePoint','axis','step'])p[k]=p[k].map(v=>v*ratio);}else{i.x*=ratio;i.y*=ratio;i.height*=ratio;}}cad.bounds=cad.bounds.map(v=>v*ratio);}cad.factor=factor;}
export function distance(points){return points.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);}
const boundsCache=new WeakMap();
function cadBounds(cad,hidden){const key=cad.factor+'|'+cad.bounds.join(',')+'|'+hidden.join(';'),cached=boundsCache.get(cad);if(cached?.key===key)return cached;
 const items=cad.items.filter(i=>Array.isArray(i.bounds)&&i.bounds.length===4&&i.bounds.every(Number.isFinite)&&!(i.visibilityLayers||[i.layer]).some(l=>hidden.includes(l)));
 const bounds=list=>{const b=[Infinity,Infinity,-Infinity,-Infinity];for(const i of list){b[0]=Math.min(b[0],i.bounds[0]);b[1]=Math.min(b[1],i.bounds[1]);b[2]=Math.max(b[2],i.bounds[2]);b[3]=Math.max(b[3],i.bounds[3]);}return list.length?b:[...cad.bounds];};
 let core=items;
 // Only focus across a dominant empty gap, with at least 95% of the entities
 // on one side. Every object stays in the drawing; Fit all remains available.
 for(const axis of [0,1]){if(core.length<100)continue;const sorted=core.map(i=>({i,v:(i.bounds[axis]+i.bounds[axis+2])/2})).sort((a,b)=>a.v-b.v),span=sorted.at(-1).v-sorted[0].v;let gap=0,cut=0;for(let n=1;n<sorted.length;n++){const g=sorted[n].v-sorted[n-1].v;if(g>gap){gap=g;cut=n;}}if(span>0&&gap>span*.35&&(cut/core.length<=.05||cut/core.length>=.95))core=(cut/core.length<=.05?sorted.slice(cut):sorted.slice(0,cut)).map(v=>v.i);}
 const result={key,all:bounds(items),focus:bounds(core),excluded:items.length-core.length};boundsCache.set(cad,result);return result;
}
export function drawingBounds(d,{all=false}={}){const c=d.cad?cadBounds(d.cad,d.hiddenLayers):null;let b=c?[...(all?c.all:c.focus)]:d.background?[0,0,d.background.width,d.background.height]:[0,0,16000,10000];for(const o of d.objects)b=[Math.min(b[0],o.x-o.size),Math.min(b[1],o.y-o.size),Math.max(b[2],o.x+o.size),Math.max(b[3],o.y+o.size)];for(const w of [...d.wires,...d.measures])for(const p of w.points)b=[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])];b.excluded=all?0:c?.excluded||0;return b;}
export function objectSegments(o){const s=SYMBOLS.find(s=>s.id===o.type),r=o.rotation*Math.PI/180,k=o.size/32;const at=p=>[o.x+(p[0]*Math.cos(r)-p[1]*Math.sin(r))*k,o.y+(p[0]*Math.sin(r)+p[1]*Math.cos(r))*k];return s.lines.flatMap(p=>p.slice(1).map((b,i)=>({a:at(p[i]),b:at(b)})));}
// Keep browser path coordinates near the local drawing origin. Native millimetre
// coordinates remain unchanged in the model, measurements and CAD exports.
export function drawingFrame(d){if(!d.cad)return{x:0,y:0,unit:1};const b=d.cad.bounds,w=b[2]-b[0],h=b[3]-b[1];return{x:b[0]+w/2,y:b[1]+h/2,unit:Math.max(1,10**Math.ceil(Math.log10(Math.max(w,h,1)/10000)))};}
export function cadMarkup(cad,hiddenLayers=[],{color='#95a8b7',stroke=.8,screenStroke=true}={}){
 if(!cad)return '';
 const {x:ox,y:oy,unit}=drawingFrame({cad});
 const x=v=>(v-ox)/unit,y=v=>(v-oy)/unit;
 const paths=[],fills=[],defs=[],texts=[];let batch=[],indices=[],count=0,patternId=0;
 const flush=()=>{if(!batch.length)return;const first=indices[0],sparse=indices.some((v,n)=>v!==first+n);paths.push(`<path class="cad-path" data-first="${first}" ${sparse?`data-entity-indices="${indices.join(',')}"`:''} data-entity-count="${batch.length}" d="${escape(batch.join(' '))}" fill="none" stroke="${color}" stroke-width="${screenStroke?stroke:stroke/unit}" ${screenStroke?'vector-effect="non-scaling-stroke"':''}/>`);batch=[];indices=[];};
 for(const i of cad.items){if((i.visibilityLayers||[i.layer]).some(l=>hiddenLayers.includes(l)))continue;
  if(i.kind==='text'){texts.push(`<text x="${x(i.x)}" y="${y(i.y)}" font-size="${i.height/unit}" transform="rotate(${i.rotation||0} ${x(i.x)} ${y(i.y)})" fill="${color}">${escape(i.text)}</text>`);continue;}
  let n=0;const d=i.d.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi,v=>String((Number(v)-(n++%2?oy:ox))/unit));
  if(i.fill){const index=count++;
   if(i.fill==='solid')fills.push(`<path class="cad-fill" data-first="${index}" data-entity-count="1" d="${escape(d)}" fill="${color}" fill-rule="${i.fillRule}"/>`);
   else for(const [n,p] of i.patterns.entries()){
    const id='cad-hatch-'+patternId++,cycle=p.dashes.reduce((s,v)=>s+Math.abs(v),0)||1;
    const [ax,ay]=p.axis.map(v=>v/unit),[sx,sy]=p.step.map(v=>v/unit),spacing=Math.abs(ax*sy-ay*sx)/(ax*ax+ay*ay),weight=spacing*.025;
    let cursor=0,lines='';const line=(a,b)=>`<path d="M${a},0 H${b} M${a},${spacing} H${b}"/>`;
    if(!p.dashes.length)lines=line(0,cycle);else for(const dash of p.dashes){if(dash>0)lines+=line(cursor,cursor+dash);else if(dash===0)for(const cx of cursor===0?[0,cycle]:[cursor])for(const cy of [0,spacing])lines+=`<circle cx="${cx}" cy="${cy}" r="${weight/2}" fill="${color}" stroke="none"/>`;cursor+=Math.abs(dash);}
    defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="${cycle}" height="${spacing}" patternTransform="matrix(${ax} ${ay} ${sx/spacing} ${sy/spacing} ${x(p.basePoint[0])} ${y(p.basePoint[1])})"><g fill="none" stroke="${color}" stroke-width="${weight}">${lines}</g></pattern>`);
    fills.push(`<path class="cad-fill" data-first="${index}" data-entity-count="${n===0?1:0}" d="${escape(d)}" fill="url(#${id})" fill-rule="evenodd"/>`);
   }
  }else{batch.push(d);indices.push(count++);if(batch.length===512)flush();}
 }flush();return (defs.length?'<defs>'+defs.join('')+'</defs>':'')+fills.join('')+paths.join('')+texts.join('');
}
export function exportSVG(d,{paper=false}={}){
 const f=drawingFrame(d),x=v=>(v-f.x)/f.unit,y=v=>(v-f.y)/f.unit,raw=drawingBounds(d,{all:true}),b=[x(raw[0]),y(raw[1]),x(raw[2]),y(raw[3])],pad=Math.max(b[2]-b[0],b[3]-b[1])*.025,w=b[2]-b[0]+pad*2,h=b[3]-b[1]+pad*2;
 const color=paper?'#182b3a':'#c6d4de';
 const cad=cadMarkup(d.cad,d.hiddenLayers,{color,stroke:Math.max(w/3500,1/f.unit)*f.unit,screenStroke:false,local:true});
 const bg=d.background?`<image href="${d.background.data}" x="${x(0)}" y="${y(0)}" width="${d.background.width/f.unit}" height="${d.background.height/f.unit}"/>`:'';
 const wires=d.wires.map(v=>`<polyline points="${v.points.map(p=>[x(p[0]),y(p[1])].join(',')).join(' ')}" fill="none" stroke="${escape(d.circuits.find(c=>c.id===v.circuit)?.color||'#3e9eff')}" stroke-width="${w/700}"/>`).join('');
 const objects=d.objects.map(o=>`<g transform="translate(${x(o.x)} ${y(o.y)}) rotate(${o.rotation}) scale(${o.size/f.unit/32})" fill="none" stroke="${escape(d.circuits.find(c=>c.id===o.circuit)?.color||SYMBOLS.find(s=>s.id===o.type).color)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${symbolSVG(o.type)}</g><text x="${x(o.x+o.size*.7)}" y="${y(o.y)}" fill="${color}" font-size="${o.size/f.unit*.5}">${escape(o.label)}</text>`).join('');
 const measures=d.measures.map(m=>`<polyline points="${m.points.map(p=>[x(p[0]),y(p[1])].join(',')).join(' ')}" fill="none" stroke="#e0b76a" stroke-width="${w/1000}"/><text x="${x(m.points[0][0])}" y="${y(m.points[0][1])-w/150}" font-size="${w/90}" fill="${color}">${d.calibrated?(distance(m.points)/1000).toFixed(2)+' m':'Uncalibrated'}</text>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="${Math.round(1920*h/w)}" viewBox="${b[0]-pad} ${b[1]-pad} ${w} ${h}"><rect x="${b[0]-pad}" y="${b[1]-pad}" width="${w}" height="${h}" fill="${paper?'#fff':'#111b24'}"/><g font-family="Arial,sans-serif">${bg}${cad}${wires}${objects}${measures}</g></svg>`;
}

let database;
async function db(){if(database)return database;database=await new Promise((resolve,reject)=>{const r=indexedDB.open('fyp-electrical-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('drawings',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return database;}
async function transaction(mode,run){const data=await db();return new Promise((resolve,reject)=>{const tx=data.transaction('drawings',mode);const request=run(tx.objectStore('drawings'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted'));});}
export const storage={save:d=>transaction('readwrite',s=>s.put(structuredClone(d))),all:()=>transaction('readonly',s=>s.getAll()),get:id=>transaction('readonly',s=>s.get(id)),remove:id=>transaction('readwrite',s=>s.delete(id))};
