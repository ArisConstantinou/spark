// SPDX-License-Identifier: GPL-3.0-only
import {SYMBOLS} from './model.js';
const schema='sparkworld/cad-v2';let database;
const open=()=>database||(database=new Promise((resolve,reject)=>{const r=indexedDB.open('sparkworld-cad-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));
async function transaction(mode,fn){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode),r=fn(tx.objectStore('projects'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Project storage was interrupted.'));});}
export function createProject(name='Untitled drawing'){return{schema,id:crypto.randomUUID(),name,updated:new Date().toISOString(),original:null,working:null,definitions:{blocks:{}},points:{},circuits:[],routes:{},factor:1};}
export function validateProject(value){
 if(!value||value.schema!==schema||typeof value.id!=='string'||typeof value.name!=='string'||value.name.length>200||!value.working||typeof value.working.data!=='string'||value.working.data.length>70*1024*1024||!['dwg','dxf'].includes(value.working.format)||!Number.isFinite(value.factor)||value.factor<=0||!Array.isArray(value.circuits)||value.circuits.length>2000||!value.points||Object.keys(value.points).length>20000||!value.routes||typeof value.definitions?.blocks!=='object')throw Error('This is not a valid SparkWorld CAD project.');
 if(value.original&&(!['dwg','dxf'].includes(value.original.format)||typeof value.original.data!=='string'||value.original.data.length>70*1024*1024))throw Error('Invalid original CAD source.');
 const text=(v,max)=>typeof v==='string'&&v.length<=max,id=v=>text(v,80)&&/^[A-Za-z0-9_-]+$/.test(v);
 if(!id(value.id)||!text(value.updated,40)||!Number.isFinite(Date.parse(value.updated))||!text(value.working.name,300))throw Error('Invalid project identity or save date.');
 const circuitIds=new Set();for(const c of value.circuits){if(!c||!id(c.id)||circuitIds.has(c.id)||!text(c.ref,80)||!text(c.name,120)||!text(c.notes,2000))throw Error('Invalid circuit metadata.');circuitIds.add(c.id);}
 const assignment=v=>v===''||circuitIds.has(v),pointIds=new Set();
 for(const [handle,p]of Object.entries(value.points)){if(!p||!/^[A-F\d]+$/i.test(handle)||!SYMBOLS.some(s=>s.id===p.type)||!text(p.label,120)||!id(p.id)||pointIds.has(p.id)||!assignment(p.circuit)||!text(p.note,2000)||!Number.isFinite(p.height)||p.height<0)throw Error('Invalid electrical point metadata.');pointIds.add(p.id);}
 if(Object.keys(value.routes).length>20000||!Object.entries(value.routes).every(([handle,r])=>/^[A-F\d]+$/i.test(handle)&&r&&id(r.id)&&assignment(r.circuit)))throw Error('Invalid circuit route metadata.');
 if(!Object.entries(value.definitions.blocks).every(([type,name])=>SYMBOLS.some(s=>s.id===type)&&text(name,255)&&name.length>0))throw Error('Invalid electrical block definitions.');
 return structuredClone(value);
}
export const projectStore={save:project=>transaction('readwrite',s=>s.put(validateProject(project))),all:()=>transaction('readonly',s=>s.getAll()),get:id=>transaction('readonly',s=>s.get(id))};
