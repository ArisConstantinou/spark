// SPDX-License-Identifier: GPL-3.0-only
// Touch policy for the true viewport host. Coordinates are its logical pixels;
// rendering, picking, previews, camera response and history stay in native CAD.
export function installCadGestures({inner,enabled,read,write,onError,onFinish}){
 let current=null,chain=Promise.resolve(),pending=0;
 const block=e=>{e.preventDefault();e.stopImmediatePropagation();};
 const point=t=>[t.clientX,t.clientY];
 const shape=points=>{const p=[...points.values()];return p.length>1?{center:[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2],spread:Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]),count:p.length}:{center:p[0],spread:0,count:p.length};};
 const eligible=e=>enabled()&&e.target?.tagName==='CANVAS';
 async function state(g){const s=await read({op:'state'});if(s.document_id!==g.document)throw Error('The active drawing changed during the touch gesture.');return s;}
 const pointer=(g,events,modifiers='')=>write({op:'pointer',document_id:g.document,events,modifiers});
 const click=(g,at)=>pointer(g,[{move:at},{press:'left'},{release:'left'}]);
 async function end(g,cancel){
  if(!g.document)return;await state(g);
  if(g.mode==='pan'||cancel)await write({op:'cancel',document_id:g.document});
  if(g.pressed)await pointer(g,[{release:'left'}]);g.pressed=false;
  if(g.mode==='pan'||cancel)await write({op:'select',document_id:g.document,handles:g.selection});
 }
 function queue(fn,g=current){pending++;chain=chain.then(fn).catch(async error=>{if(g){g.cancelled=true;g.latest=null;if(current===g)current=null;await end(g,true).catch(()=>{});}onError(error);}).finally(()=>pending--);}
 async function begin(g){const s=await read({op:'state'});if(s.modal||s.command||s.block_editor)throw Error('Finish the CAD command before navigating with this gesture.');g.document=s.document_id;g.selection=[...s.selection];}
 async function pan(g,at){
  if(g.mode==='move'){await end(g,true);g.mode='pending';}
  if(g.mode!=='pan'){await write({op:'run',document_id:g.document,cmd:'PAN'});await pointer(g,[{move:at},{press:'left'}]);g.pressed=true;g.mode='pan';}
 }
 async function move(g,points){
  await state(g);if(g.cancelled||!points.size)return;const now=shape(points);g.last=now.center;
  if(points.size>1){
   if(!g.multiple||now.count!==g.previous?.count){g.multiple=true;await pan(g,now.center);g.previous=now;return;}
   await pan(g,g.previous.center);await pointer(g,[{move:now.center}],'ctrl');
   if(g.previous.spread>4&&now.spread>4){const ratio=Math.max(.25,Math.min(4,now.spread/g.previous.spread));if(Math.abs(Math.log(ratio))>1e-5){
    const before=(await state(g)).camera.distance,target=before/ratio;let observed=before;
    // Calibrate the engine's actual wheel preference once per gesture.
    if(!g.gain){await pointer(g,[{wheel:.1}],'ctrl');observed=(await state(g)).camera.distance;g.gain=Math.log(observed/before)/.1;if(!Number.isFinite(g.gain)||Math.abs(g.gain)<1e-8)throw Error('The CAD camera did not respond to touch zoom.');}
    const wheel=Math.log(target/observed)/g.gain;if(Number.isFinite(wheel)&&Math.abs(wheel)>1e-5)await pointer(g,[{wheel}],'ctrl');
   }}g.previous=now;return;
  }
  if(g.hadMultiple)return;
  if(g.mode==='pending'&&Math.hypot(now.center[0]-g.start[0],now.center[1]-g.start[1])<=8)return;
  if(g.mode==='pending'){
   await click(g,g.start);const picked=await state(g),onSelected=picked.selection.some(h=>g.selection.includes(h));await write({op:'select',document_id:g.document,handles:g.selection});
   if(onSelected){await write({op:'run',document_id:g.document,cmd:'MOVE'});await click(g,g.start);g.mode='move';}
   else await pan(g,g.start);
  }
  await pointer(g,[{move:now.center}]);g.previous=now;
 }
 function queueMove(g,points){g.latest=points;if(g.queued)return;g.queued=true;queue(async()=>{try{while(g.latest){const p=g.latest;g.latest=null;await move(g,p);}}finally{g.queued=false;}},g);}
 inner.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&(current||eligible(e)))block(e);},true);
 for(const name of ['pointermove','pointerup','pointercancel'])inner.addEventListener(name,e=>{if(e.pointerType==='touch'&&(current||pending))block(e);},true);
 inner.addEventListener('touchstart',e=>{
  if(!current&&!eligible(e))return;block(e);
  if(!current){current={start:point(e.changedTouches[0]),points:new Map(),mode:'pending',multiple:false,selection:[]};const g=current;queue(()=>begin(g),g);}
  const g=current;for(const t of e.changedTouches)g.points.set(t.identifier,point(t));if(g.points.size>1){g.hadMultiple=true;queueMove(g,new Map(g.points));}
 },{capture:true,passive:false});
 inner.addEventListener('touchmove',e=>{if(!current)return;block(e);for(const t of e.changedTouches)current.points.set(t.identifier,point(t));queueMove(current,new Map(current.points));},{capture:true,passive:false});
 for(const name of ['touchend','touchcancel'])inner.addEventListener(name,e=>{
  if(!current)return;block(e);const g=current;for(const t of e.changedTouches)g.points.set(t.identifier,point(t));queueMove(g,new Map(g.points));for(const t of e.changedTouches)g.points.delete(t.identifier);
  if(name==='touchcancel'){g.cancelled=true;g.points.clear();}if(g.points.size)return;current=null;
  queue(async()=>{if(g.cancelled||g.mode==='move'&&g.hadMultiple)await end(g,true);else if(g.mode==='pending'&&!g.hadMultiple){await state(g);await click(g,g.start);}else{if(g.mode==='move'){await click(g,g.last);const s=await state(g);if(s.command){await end(g,true);throw Error('The CAD engine did not finish the touch move.');}}await end(g,false);}await onFinish();},g);
 },{capture:true,passive:false});
 return{get active(){return!!current||pending>0;}};
}
