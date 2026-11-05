import test from 'node:test';
import assert from 'node:assert/strict';
import {createCadMutation} from '../web/cad-transport.js';

function fixture(){
 const calls=[],snapshot={document_id:3,revision:7};let serial=0;
 const read=async(request,options)=>{calls.push({request,options});return request.op==='state'?snapshot:{ok:true};};
 return{calls,snapshot,mutation:createCadMutation(read,()=> 'generated-'+ ++serial)};
}
test('Caller-pinned identity and replay token reach the engine unchanged, without another state lookup',async()=>{
 const {calls,mutation}=fixture(),request={op:'select',document_id:2,revision:5,request_id:'pinned',handles:['AB']},options={timeoutMs:321};
 await mutation(request,options);
 assert.equal(calls.length,1);assert.deepEqual(calls[0],{request,options});
});
test('A partially pinned inactive document is rejected instead of being retargeted',async()=>{
 const {calls,mutation}=fixture();await assert.rejects(mutation({op:'select',document_id:2,handles:[]}),/active drawing changed/);
 assert.equal(calls.length,1);assert.equal(calls[0].request.op,'state');
});
test('Unpinned owner actions use one fresh snapshot and a new request token',async()=>{
 const {calls,mutation}=fixture();await mutation({op:'select',handles:[]});
 assert.deepEqual(calls.map(row=>row.request),[{op:'state'},{op:'select',handles:[],request_id:'generated-1',document_id:3,revision:7}]);
});
test('An explicit revision is preserved when the current document must be resolved',async()=>{
 const {calls,mutation}=fixture();await mutation({op:'select',revision:4,handles:[]});
 assert.equal(calls[1].request.revision,4);assert.equal(calls[1].request.document_id,3);
});
test('Malformed explicit guards never turn into an unguarded native edit',async()=>{
 for(const bad of [null,undefined,0,-1,'3',NaN,Infinity]){
  const {calls,mutation}=fixture();await assert.rejects(mutation({op:'select',document_id:bad,revision:7}),/invalid drawing identity/);assert.equal(calls.length,0);
 }
 for(const bad of [null,undefined,-1,'7',NaN,Infinity]){
  const {calls,mutation}=fixture();await assert.rejects(mutation({op:'select',document_id:3,revision:bad}),/invalid drawing revision/);assert.equal(calls.length,0);
 }
});
test('Native stale-revision errors are propagated and never retried or rebound',async()=>{
 let calls=0;const mutation=createCadMutation(async()=>{calls++;throw Error('stale revision');},()=> 'unused');
 await assert.rejects(mutation({op:'select',document_id:3,revision:6}),/stale revision/);assert.equal(calls,1);
});
