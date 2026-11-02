// SPDX-License-Identifier: GPL-3.0-only
// Electrical vectors and native CAD share the engine's document and undo stack.
import {SYMBOLS} from './model.js';

const finite = n => Number.isFinite(n) && Math.abs(n) < 1e12;
const result = reply => reply.result || reply;
const hex = value => typeof value === 'string' && /^[0-9a-f]+$/i.test(value);

/** The transport must serialize mutations and reject non-ok engine replies.
 * Definitions are prepared before editing; placement itself is one native undo.
 * No existing block, source entity or layer is replaced by this adapter.
 */
export class NativeElectrical {
 constructor(transport) {
  this.transport = transport;
  this.documentId = null;
  this.blocks = new Map();
 }
 async state() {
  const state = await this.transport.read({op:'state'});
  if (state.document_id !== this.documentId) {
   this.documentId = state.document_id;
   this.blocks.clear();
  }
  if (!state.document_id || state.documents?.find(d=>d.id===state.document_id)?.start)
   throw Error('Open a drawing before using electrical tools.');
  if (state.modal || state.block_editor || state.layout !== 'Model')
   throw Error('Close the CAD notice or block editor and choose Model before placing electrical symbols.');
  return state;
 }
 async mutate(request) {
  const state=await this.transport.read({op:'state'});
  if (state.document_id!==this.documentId)
   throw Error('The active drawing changed. Reopen its electrical tools before editing.');
  // Send the identity and revision in the same request as the edit. A second
  // tab activation between this read and submission must fail, never redirect
  // the operation into an unrelated document.
  return this.transport.read({...request,request_id:'sparkworld-'+crypto.randomUUID(),
   document_id:this.documentId,revision:state.revision});
 }
 async prepare(types = SYMBOLS.map(s=>s.id)) {
  await this.state();
  // UUID names prevent collision with unrelated source blocks. Persist the map
  // with a project checkpoint instead of trusting a name prefix on import.
  const pending = [...new Set(types)].filter(type=>!this.blocks.has(type)).map(type=>{
   const symbol = SYMBOLS.find(s=>s.id===type);
   if (!symbol) throw Error('Unknown electrical symbol: '+type);
   const name = 'SPARKWORLD_'+type.replace(/-/g,'_')+'_'+crypto.randomUUID().replace(/-/g,'');
   const entities = symbol.lines.map(points=>({
    type:'LwPolyline',vertices:points.map(([x,y])=>[x,-y]),
    layer:'0',color:0,closed:false,
   }));
   return {type,name,entities};
  });
  if (!pending.length) return [];
  const entities = pending.flatMap(p=>p.entities);
  const created = result(await this.mutate({op:'entities_create',entities}));
  if (created.handles?.length !== entities.length || !created.handles.every(hex))
   throw Error('The CAD engine did not return the electrical definition handles.');
  const definitions = [], seeds = [];let offset = 0;
  for (const {type,name,entities} of pending) {
   const handles = created.handles.slice(offset,offset+entities.length);offset+=entities.length;
   const defined = result(await this.mutate({op:'block_define',name,
    base:[0,0,0],handles,insert_at:[0,0,0]}));
   if (!hex(defined.insert)) throw Error('The CAD block definition could not be confirmed.');
   seeds.push(defined.insert);
   definitions.push({type,name});
  }
  // Remove only the instances made by this preparation, together. Batching
  // these writes avoids two full-document undo snapshots for every symbol.
  await this.mutate({op:'entities_delete',handles:seeds});
  for (const {type,name} of definitions) this.blocks.set(type,name);
  return definitions;
 }
 async place(point,{millimetresPerUnit=1,layer='SparkWorld Electrical'}={}) {
  await this.state();
  if (!this.blocks.has(point.type)) throw Error('Prepare this electrical symbol before placement.');
  if (![point.x,point.y,point.size,point.rotation,millimetresPerUnit].every(finite)
   || point.size<=0 || millimetresPerUnit<=0)
   throw Error('Invalid electrical position, size or drawing units.');
  if (typeof layer!=='string' || !layer.length || layer.length>200)
   throw Error('Choose a valid electrical layer.');
  const created = result(await this.mutate({op:'entities_create',entities:[{
   type:'Insert',block:this.blocks.get(point.type),
   position:[point.x/millimetresPerUnit,-point.y/millimetresPerUnit,0],
   scale:point.size/(32*millimetresPerUnit),rotation_deg:-point.rotation,
   layer,color:256,
  }]}));
  if (created.handles?.length!==1 || !hex(created.handles[0]))
   throw Error('The CAD engine did not confirm symbol placement.');
  return {id:point.id,type:point.type,handle:created.handles[0],block:this.blocks.get(point.type)};
 }
 async move(handles,dx,dy,{millimetresPerUnit=1}={}) {
  await this.state();
  if (!handles.length || !handles.every(hex) || ![dx,dy,millimetresPerUnit].every(finite)
   || millimetresPerUnit<=0) throw Error('Invalid native movement.');
  return this.mutate({op:'entities_transform',handles,action:'move',
   vector:[dx/millimetresPerUnit,-dy/millimetresPerUnit,0]});
 }
 /** Metadata is a separate undoable edit. Never pretend it is part of the
  * placement undo step: this pinned web engine has no working batch operation.
  * Positions are read from native geometry, rather than duplicated in XData.
  */
 async writeMetadata(binding,point) {
  await this.state();
  if (!hex(binding.handle) || binding.type!==point.type || binding.id!==point.id
   || !SYMBOLS.some(s=>s.id===point.type)) throw Error('Invalid electrical binding.');
  const metadata = {version:1,kind:'electrical-point',id:point.id,type:point.type,
   label:point.label||'',circuit:point.circuit||'',height:point.height??0,note:point.note||''};
  if (![metadata.id,metadata.label,metadata.circuit,metadata.note].every(v=>typeof v==='string')
   || !finite(metadata.height) || metadata.height<0) throw Error('Invalid electrical metadata.');
  const text = JSON.stringify(metadata),encoder = new TextEncoder();
  if (encoder.encode(text).length>12000) throw Error('Electrical metadata is too large for a native CAD record.');
  // DXF group 1000 has a 255-byte limit. Split at Unicode character boundaries.
  const chunks = [];let chunk='',length=0;
  for (const character of text) {
   const size=encoder.encode(character).length;
   if (length+size>220) {chunks.push(chunk);chunk='';length=0;}
   chunk+=character;length+=size;
  }
  if(chunk) chunks.push(chunk);
  return this.mutate({op:'xdata_set',handles:[binding.handle],app:'SPARKWORLD',
   data:['electrical-point/v1',...chunks].map(value=>({code:1000,value}))});
 }
 async readMetadata(handles) {
  await this.state();
  if (!handles.length || !handles.every(hex)) throw Error('Invalid native handles.');
  const reply=await this.transport.read({op:'xdata_get',handles,app:'SPARKWORLD'});
  return (reply.items||[]).flatMap(item=>{
   const values=item.xdata?.SPARKWORLD;
   if (!Array.isArray(values) || values[0]!=='electrical-point/v1'
    || !values.every(v=>typeof v==='string') || values.join('').length>12000) return [];
   try {
    const value=JSON.parse(values.slice(1).join(''));
    if(value.version!==1 || value.kind!=='electrical-point'
     || !SYMBOLS.some(s=>s.id===value.type) || typeof value.id!=='string') return [];
    return [{handle:item.handle,metadata:value}];
   } catch {return [];}
  });
 }
 definitions() {
  return {documentId:this.documentId,blocks:Object.fromEntries(this.blocks)};
 }
 async restoreDefinitions(saved) {
  await this.state();
  const names=new Set();let offset=0;
  for (;;) {
   const records=await this.transport.read({op:'records',collection:'block_records',offset,limit:10000});
   for (const record of records.records||[]) names.add(record.properties?.name||record.name);
   if (records.next_offset==null) break;
   if (!Number.isInteger(records.next_offset)||records.next_offset<=offset)
    throw Error('The CAD block table returned an invalid page.');
   offset=records.next_offset;
  }
  const restored = new Map();
  for (const [type,name] of Object.entries(saved?.blocks||{})) {
   if (!SYMBOLS.some(s=>s.id===type) || typeof name!=='string' || !names.has(name))
    throw Error('The saved electrical block is missing from this drawing: '+type);
   restored.set(type,name);
  }
  this.blocks = restored;
 }
}
