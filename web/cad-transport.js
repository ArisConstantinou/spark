// SPDX-License-Identifier: GPL-3.0-only
// Caller-pinned identity is a guard, never a hint to retarget an edit.
export function createCadMutation(read,nextRequestId){
 return async function mutation(request,options){
  const pinnedDocument=Object.hasOwn(request,'document_id'),pinnedRevision=Object.hasOwn(request,'revision');
  if(pinnedDocument&&(!Number.isSafeInteger(request.document_id)||request.document_id<=0))throw Error('The CAD request has an invalid drawing identity.');
  if(pinnedRevision&&(!Number.isSafeInteger(request.revision)||request.revision<0))throw Error('The CAD request has an invalid drawing revision.');
  let snapshot;
  if(!pinnedDocument||!pinnedRevision){
   snapshot=await read({op:'state'});
   if(pinnedDocument&&request.document_id!==snapshot.document_id)throw Error('The active drawing changed before this edit.');
  }
  return read({...request,
   request_id:Object.hasOwn(request,'request_id')?request.request_id:nextRequestId(),
   document_id:pinnedDocument?request.document_id:snapshot.document_id,
   revision:pinnedRevision?request.revision:snapshot.revision,
  },options);
 };
}
