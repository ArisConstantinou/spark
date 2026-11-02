// Inventory and block visibility are different: a layer can be enabled while a
// parent/child block dependency still hides all of the geometry it controls.
const cache=new WeakMap();
const addBounds=(a,b)=>a?[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])]:[...b];
function index(cad){
 const key=cad.factor+'|'+(cad.bounds||[]).join(',')+'|'+cad.items?.length,cached=cache.get(cad);if(cached?.key===key)return cached;
 const rows=new Map((cad.layers||[]).map(l=>[l.name,{...l,groups:[]}])),groups=new Map();
 const row=name=>{if(!rows.has(name))rows.set(name,{name,visible:true,groups:[]});return rows.get(name);};
 for(const item of cad.items||[]){
  if(!Array.isArray(item.bounds)||item.bounds.length!==4||!item.bounds.every(Number.isFinite))continue;
  const names=[...new Set([item.layer,...(item.visibilityLayers||[])])],key=JSON.stringify([item.layer,names]);let group=groups.get(key);
  if(!group){group={names,count:0,bounds:null};groups.set(key,group);for(const name of names)row(name).groups.push(group);}
  group.count++;group.bounds=addBounds(group.bounds,item.bounds);
 }
 const result={key,rows:[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)),groups:[...groups.values()]};cache.set(cad,result);return result;
}
export function cadLayerRows(cad,hiddenLayers=[]){
 if(!cad)return[];const hidden=new Set(hiddenLayers);
 return index(cad).rows.map(row=>{
  const blocked=new Set();let total=0,visibleCount=0,bounds=null;
  for(const group of row.groups){total+=group.count;bounds=addBounds(bounds,group.bounds);const missing=group.names.filter(n=>hidden.has(n));if(!missing.length)visibleCount+=group.count;for(const name of missing)if(name!==row.name)blocked.add(name);}
  const unsupported=cad.unsupportedByLayer?.[row.name]||{},invisible=cad.invisibleByLayer?.[row.name]||0;
  return{...row,groups:undefined,enabled:!hidden.has(row.name),total,visibleCount,bounds,blockedBy:[...blocked],unsupported,invisible};
 });
}
export function revealCadLayer(cad,hiddenLayers,name){
 const row=index(cad).rows.find(l=>l.name===name),required=new Set([name]);for(const group of row?.groups||[])for(const dependency of group.names)required.add(dependency);
 return hiddenLayers.filter(n=>!required.has(n));
}
export function sourceHiddenLayers(cad){return(cad?.layers||[]).filter(l=>l.visible===false).map(l=>l.name);}
export function cadLayerSummary(cad,hiddenLayers=[]){
 if(!cad)return{total:0,visible:0};const hidden=new Set(hiddenLayers);let total=0,visible=0;
 for(const group of index(cad).groups){total+=group.count;if(!group.names.some(n=>hidden.has(n)))visible+=group.count;}return{total,visible};
}
