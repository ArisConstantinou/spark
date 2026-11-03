import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,validateProject,pointForEntity} from '../web/workspace-store.js';
function project(){const p=createProject('Kitchen');p.working={name:'Kitchen.dwg',format:'dwg',data:'QUMxMDMy'};p.original={...p.working};p.circuits=[{id:'circuit-1',ref:'C1',name:'Sockets',notes:'User design'}];p.points.A1={id:'point-1',type:'double-socket',label:'S-01',circuit:'circuit-1',height:300,note:'Κουζίνα ⚡'};return p;}
test('complete project keeps original, working geometry and Unicode electrical data independently',()=>{const p=project(),copy=validateProject(p);assert.deepEqual(copy,p);copy.points.A1.note='Changed';assert.equal(p.points.A1.note,'Κουζίνα ⚡');});
test('malformed circuits and dangling circuit associations are rejected before restoration',()=>{const malformed=project();malformed.circuits=[null];assert.throws(()=>validateProject(malformed));const dangling=project();dangling.points.A1.circuit='missing';assert.throws(()=>validateProject(dangling));});
test('invalid native bindings and duplicated point identities are rejected',()=>{const invalid=project();invalid.points.BADHANDLE=invalid.points.A1;assert.throws(()=>validateProject(invalid));const duplicate=project();duplicate.points.A2={...duplicate.points.A1};assert.throws(()=>validateProject(duplicate));});

test('electrical notes follow the actual block instead of a recycled Undo handle',()=>{
 const p=project();p.definitions.blocks['double-socket']='SPARKWORLD_double_socket_original';
 assert.equal(pointForEntity(p,{handle:'A1',block:'SPARKWORLD_double_socket_original'}),p.points.A1);
 assert.equal(pointForEntity(p,{handle:'A1',type:'Line'}),null);
 assert.equal(pointForEntity(p,{handle:'A1',block:'unrelated-source-block'}),null);
 assert.equal(pointForEntity(p,{handle:'A2',block:'SPARKWORLD_double_socket_original'}),null);
 assert.equal(pointForEntity(p,null),null);
});
