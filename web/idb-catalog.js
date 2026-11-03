// The saved-drawing list only needs display metadata. A cursor keeps one
// large record in scope at a time and never retains its CAD payload.
export function readCatalog(database,store,project){
 return new Promise((resolve,reject)=>{
  const tx=database.transaction(store,'readonly'),rows=[],request=tx.objectStore(store).openCursor();
  request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const row=project(cursor.value);if(row)rows.push(row);cursor.continue();};
  tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Saved drawing list could not be read.'));
 });
}
