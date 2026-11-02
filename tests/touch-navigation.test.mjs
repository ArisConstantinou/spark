import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installTouchNavigation} from '../web/touch-navigation.js';

function setup(draggable=false){
 const listeners=new Map(),events=[];let view={x:0,y:0,k:1};
 const surface={addEventListener:(type,fn)=>listeners.set(type,fn),setPointerCapture(){},getBoundingClientRect:()=>({left:0,top:0})};
 globalThis.window={addEventListener(){}};
 installTouchNavigation(surface,{getView:()=>view,setView:v=>view=v,limits:()=>[.1,10],canDrag:()=>draggable,down:()=>events.push('down'),move:()=>events.push('move'),up:()=>events.push('up'),cancel:()=>events.push('cancel')});
 return {events,get view(){return view;},send(type,id,x,y){listeners.get(type)({type,pointerType:'touch',pointerId:id,clientX:x,clientY:y,preventDefault(){}});}};
}
test('pinch scales around the moving midpoint, never emitting edit events',()=>{
 const s=setup();s.send('pointerdown',1,40,100);s.send('pointerdown',2,60,100);s.send('pointermove',1,30,110);s.send('pointermove',2,90,110);
 assert.equal(s.view.k,3);assert.equal((60-s.view.x)/s.view.k,50);assert.equal((110-s.view.y)/s.view.k,100);assert.deepEqual(s.events,[]);
});
test('lifting either pinch finger cannot turn the remaining finger into a tap',()=>{
 for(const lift of [1,2]){const s=setup();s.send('pointerdown',1,40,100);s.send('pointerdown',2,60,100);s.send('pointerup',lift,40,100);s.send('pointermove',lift===1?2:1,80,120);s.send('pointerup',lift===1?2:1,80,120);assert.deepEqual(s.events,[]);s.send('pointerdown',3,50,50);s.send('pointerup',3,50,50);assert.deepEqual(s.events,['down','up']);}
});
test('a second finger cancels a selected-object drag before pinch begins',()=>{
 const s=setup(true);s.send('pointerdown',1,50,50);s.send('pointermove',1,70,50);s.send('pointerdown',2,100,50);s.send('pointermove',2,120,50);s.send('pointerup',1,70,50);s.send('pointerup',2,120,50);assert.deepEqual(s.events,['down','move','cancel']);
});
test('cancelled contact neither edits nor poisons the next tap',()=>{
 const s=setup();s.send('pointerdown',1,50,50);s.send('pointercancel',1,50,50);assert.deepEqual(s.events,[]);s.send('pointerdown',2,50,50);s.send('pointerup',2,50,50);assert.deepEqual(s.events,['down','up']);
});
test('finger jitter stays a tap; intentional unselected drag only pans',()=>{
 const s=setup();s.send('pointerdown',1,50,50);s.send('pointermove',1,52,51);s.send('pointerup',1,52,51);assert.deepEqual(s.events,['down','up']);s.events.length=0;s.send('pointerdown',2,50,50);s.send('pointermove',2,70,80);s.send('pointerup',2,70,80);assert.deepEqual(s.view,{x:20,y:30,k:1});assert.deepEqual(s.events,[]);
});
test('pinch respects zoom limits without nonfinite camera values',()=>{
 const s=setup();s.send('pointerdown',1,0,0);s.send('pointerdown',2,1,0);s.send('pointermove',2,100000,0);assert.equal(s.view.k,10);assert(Object.values(s.view).every(Number.isFinite));
});
test('three-finger transitions rebase without a camera jump or edit',()=>{
 const s=setup();s.send('pointerdown',1,30,30);s.send('pointerdown',2,60,30);s.send('pointerdown',3,90,30);const old={...s.view};s.send('pointerup',1,30,30);s.send('pointermove',2,60,30);assert.deepEqual(s.view,old);s.send('pointerup',2,60,30);s.send('pointerup',3,90,30);assert.deepEqual(s.events,[]);
});
