import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blank,effectiveCad,History,rescaleCad} from '../web/model.js';

function drawing(){const d=blank();d.cad={factor:1,bounds:[0,0,100,50],original:'protected source',items:[{id:'g0',owner:'42',kind:'path',d:'M0 0L100 50',bounds:[0,0,100,50],patterns:[{basePoint:[5,6],axis:[1,0],step:[0,2],dashes:[1,-1]}]},{id:'g1',owner:'42',kind:'text',text:'label',x:10,y:20,height:3,bounds:[10,17,25,20]},{id:'g2',owner:'43',kind:'path',d:'M5 5L10 10',bounds:[5,5,10,10]}]};return d;}
test('moving a root shifts every child and hatch phase without changing source',()=>{
 const d=drawing(),original=JSON.stringify(d.cad);d.cadMoves={'42':{dx:20,dy:30}};const moved=effectiveCad(d);
 assert.equal(moved.items[0].d,'M20 30L120 80');assert.deepEqual(moved.items[0].patterns[0].basePoint,[25,36]);assert.deepEqual(moved.items[0].patterns[0].step,[0,2]);assert.equal(moved.items[1].x,30);assert.equal(moved.items[1].y,50);assert.equal(moved.items[2],d.cad.items[2]);assert.equal(JSON.stringify(d.cad),original);
});
test('source offsets reset, undo and redo with the same source byte stream',()=>{
 const d=drawing(),h=new History();h.push(d);d.cadMoves={'42':{dx:20,dy:30}};assert.equal(effectiveCad(d).items[0].bounds[0],20);
 assert(h.back(d));assert.equal(effectiveCad(d),d.cad);assert(h.forward(d));assert.equal(effectiveCad(d).items[0].bounds[0],20);assert.equal(d.cad.original,'protected source');
});
test('unit changes and their undo preserve physical source offsets',()=>{
 const d=drawing(),h=new History();d.cadMoves={'42':{dx:20,dy:30}};h.push(d);rescaleCad(d.cad,1000);d.cadMoves['42']={dx:20000,dy:30000};assert.equal(effectiveCad(d).items[0].bounds[2],120000);h.back(d);assert.equal(d.cad.factor,1);assert.equal(effectiveCad(d).items[0].bounds[2],120);h.forward(d);assert.equal(effectiveCad(d).items[0].bounds[2],120000);
});
