// Keep touch navigation separate from drafting. A second finger always cancels
// a pending edit, and a pinch cannot become a tap when either finger is lifted.
export function installTouchNavigation(surface,{getView,setView,limits,canDrag,down,move,up,cancel}){
 const contacts=new Map();let pending=null,mode='',origin=null,pinch=null,multi=false;
 const point=e=>({x:e.clientX,y:e.clientY});
 const pair=()=>{const [a,b]=[...contacts.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
 const startPinch=()=>{const p=pair(),r=surface.getBoundingClientRect(),v=getView();pinch={...p,k:v.k,wx:(p.x-r.left-v.x)/v.k,wy:(p.y-r.top-v.y)/v.k};mode='pinch';};
 const startPan=p=>{origin={...p,view:{...getView()}};mode='pan';};
 const pan=p=>setView({...origin.view,x:origin.view.x+p.x-origin.x,y:origin.view.y+p.y-origin.y});
 const reset=()=>{contacts.clear();pending=null;mode='';origin=null;pinch=null;multi=false;};
 surface.addEventListener('pointerdown',e=>{
  if(e.pointerType!=='touch')return;e.preventDefault();surface.setPointerCapture(e.pointerId);contacts.set(e.pointerId,point(e));
  if(contacts.size===1){pending={event:e,point:point(e),draggable:canDrag(e)};mode='pending';multi=false;}
  else {if(mode==='edit')cancel();pending=null;multi=true;startPinch();}
 },{passive:false});
 surface.addEventListener('pointermove',e=>{
  if(e.pointerType!=='touch'||!contacts.has(e.pointerId))return;e.preventDefault();contacts.set(e.pointerId,point(e));
  if(contacts.size>=2){const p=pair(),r=surface.getBoundingClientRect(),[min,max]=limits(),k=Math.max(min,Math.min(max,pinch.k*p.d/pinch.d));setView({k,x:p.x-r.left-pinch.wx*k,y:p.y-r.top-pinch.wy*k});return;}
  if(mode==='pending'){
   if(Math.hypot(e.clientX-pending.point.x,e.clientY-pending.point.y)<8)return;
   if(pending.draggable){down(pending.event);mode='edit';}
   else startPan(pending.point);
  }
  if(mode==='pan')pan(point(e));else if(mode==='edit')move(e);
 },{passive:false});
 const end=e=>{
  if(e.pointerType!=='touch'||!contacts.has(e.pointerId))return;e.preventDefault();const cancelled=e.type==='pointercancel';contacts.delete(e.pointerId);
  if(mode==='edit'){if(cancelled)cancel();else up();}
  else if(mode==='pending'&&!multi&&!cancelled){down(pending.event);up();}
  if(contacts.size>=2){startPinch();return;}
  if(contacts.size===1){multi=true;pending=null;startPan([...contacts.values()][0]);return;}
  reset();
 };
 surface.addEventListener('pointerup',end,{passive:false});surface.addEventListener('pointercancel',end,{passive:false});
 surface.addEventListener('lostpointercapture',e=>{if(contacts.has(e.pointerId))end({...e,type:'pointercancel',pointerType:'touch',pointerId:e.pointerId,preventDefault(){}});});
 window.addEventListener('blur',()=>{if(mode==='edit')cancel();reset();});
 // Safari gesture events must not zoom the whole page while manipulating CAD.
 for(const name of ['gesturestart','gesturechange','gestureend'])surface.addEventListener(name,e=>e.preventDefault(),{passive:false});
}
