// SPDX-License-Identifier: GPL-3.0-only
// Host-owned text entry. The engine stores and renders the actual CAD entities.
import {escape as esc} from './model.js';

export function mountCadAnnotations({read,write,task,dialog,toast,frame}){
 let pending=null,gesture=null;
 const overlay=document.createElement('div');overlay.className='cad-text-placement';overlay.hidden=true;
 overlay.innerHTML='<div class="cad-text-placement-tip"><span>Tap to place text · drag cancels the tap</span><button type="button">Cancel</button></div>';
 frame.closest('.studio-frame-wrap').append(overlay);
 function cancel(){pending=null;gesture=null;overlay.hidden=true;}
 overlay.querySelector('button').onclick=cancel;
 document.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();},true);
 function assertDrawing(s,pinned){if(s.document_id!==pinned.document_id||s.layout!==pinned.layout)throw Error('The drawing or layout changed. Open the text tool again.');if(s.command||s.modal||s.text_editor||s.mtext_editor||s.block_editor)throw Error('Finish the current CAD operation first.');}
 async function create(draft,position){return task('Creating CAD text…',async()=>{
  const s=await read({op:'state'});assertDrawing(s,draft.pinned);
  const envelope=await write({op:'entities_create',entities:[{...draft.entity,position}]}),result=envelope.result||envelope;
  if(result.handles?.length!==1)throw Error('The engine did not confirm the text entity.');
  await write({op:'select',handles:result.handles});cancel();
 });}
 async function open(kind){
  cancel();const pinned=await read({op:'state'});
  if(!pinned.documents.some(d=>d.id===pinned.document_id&&!d.start))throw Error('Open or create a drawing first.');
  assertDrawing(pinned,pinned);
  const multiline=kind==='MTEXT',styles=(await read({op:'records',collection:'text_styles',limit:10000})).records,
   layers=(await read({op:'records',collection:'layers',limit:10000})).records;
  const num=(id,label,value)=>`<label class="field">${label}<input type="number" step="any" id="cad-text-${id}" value="${Number(value)||0}"></label>`;
  const select=(id,label,rows)=>`<label class="field">${label}<select id="cad-text-${id}">${rows.map(r=>`<option>${esc(r.name)}</option>`).join('')}</select></label>`;
  dialog(multiline?'Multiline text':'Drawing text',`<div class="cad-text-editor"><label class="field">${multiline?'Text · CAD formatting codes are preserved':'Text'}<textarea id="cad-text-value" rows="${multiline?5:2}" maxlength="32000" spellcheck="false"></textarea></label><div class="cad-text-fields">${num('height','Height · drawing units',2.5)}${num('rotation','Rotation · degrees',0)}${multiline?num('width','Wrap width · drawing units',100):''}${select('style','CAD text style',styles)}${select('layer','Layer',layers)}</div><details><summary>Exact position · drawing coordinates</summary><div class="cad-text-fields">${['x','y','z'].map((v,i)=>num(v,v.toUpperCase(),pinned.camera.target[i])).join('')}</div></details><p class="dialog-copy">Tap a position on the drawing, or use exact coordinates.</p></div>`,[
   {label:'Place on drawing',primary:true,run:()=>{const draft=values();if(Math.abs(pinned.camera.pitch-Math.PI/2)>.001||pinned.camera.projection!=='Orthographic')throw Error('Choose the Top orthographic view for point placement, or use exact coordinates.');pending=draft;overlay.hidden=false;}},
   {label:'Create at coordinates',run:async()=>{const draft=values();await create(draft,draft.position);}},
   {label:'Cancel',run:cancel}
  ]);
  const style=document.querySelector('#cad-text-style');if(styles.some(r=>r.name==='Standard'))style.value='Standard';
  const layer=document.querySelector('#cad-text-layer');if(layers.some(r=>r.name==='0'))layer.value='0';
  document.querySelector('#cad-text-value').focus();
  function values(){
   const value=document.querySelector('#cad-text-value').value;if(!value.trim())throw Error('Enter the text to add.');
   if(!multiline&&/[\r\n]/.test(value))throw Error('Use Multiline text for more than one line.');
   const number=id=>{const input=document.querySelector('#cad-text-'+id),n=Number(input.value);if(!input.value.trim()||!Number.isFinite(n)||Math.abs(n)>=1e12)throw Error('Enter a valid '+id+'.');return n;};
   const height=number('height'),width=multiline?number('width'):null;if(height<=0||multiline&&width<=0)throw Error('Text height and width must be positive.');
   return{pinned,position:['x','y','z'].map(number),entity:{type:multiline?'MText':'Text',value:multiline?value.replace(/\r\n|\r|\n/g,'\\P'):value,height,rotation_deg:number('rotation'),...(multiline?{width}:{}),style:style.value,layer:layer.value,color:256}};
  }
 }
 overlay.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;overlay.setPointerCapture(e.pointerId);if(gesture){gesture.multiple=true;gesture.ids.add(e.pointerId);}else gesture={x:e.clientX,y:e.clientY,moved:false,multiple:false,ids:new Set([e.pointerId])};});
 overlay.addEventListener('pointermove',e=>{if(gesture&&Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>8)gesture.moved=true;});
 overlay.addEventListener('pointercancel',()=>{gesture=null;});
 overlay.addEventListener('pointerup',e=>{if(!gesture)return;gesture.ids.delete(e.pointerId);if(gesture.ids.size)return;const g=gesture;gesture=null;if(g.moved||g.multiple||!pending)return;
  const draft=pending,box=overlay.getBoundingClientRect();
  task('Positioning CAD text…',async()=>{const s=await read({op:'state'});assertDrawing(s,draft.pinned);const [w,h]=s.viewport_size;if(Math.abs(box.width-w)>1||Math.abs(box.height-h)>1)throw Error('The drawing is resizing. Try placement again.');if(Math.abs(s.camera.pitch-Math.PI/2)>.001||s.camera.projection!=='Orthographic')throw Error('Choose the Top orthographic view before placing text.');const unit=2*s.camera.distance*Math.tan(s.camera.fov_y/2)/h;
   return[s.camera.target[0]+(e.clientX-box.left-w/2)*unit,s.camera.target[1]-(e.clientY-box.top-h/2)*unit,draft.position[2]];
  }).then(position=>pending===draft?create(draft,position):null).catch(error=>toast(error.message));
 });
 return{open,cancel,get active(){return!!pending;}};
}
