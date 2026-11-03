// SPDX-License-Identifier: GPL-3.0-only
import {escape as esc} from './model.js';
const glyphs={line:'M4 20 20 4M3 17v4h4M17 3h4v4',polyline:'M3 18 9 6l7 12 5-9M2 17h3v3H2zM8 4h3v3H8z',circle:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',rectangle:'M3 5h18v14H3z',arc:'M4 20A16 16 0 0 1 20 4M3 16v5h5M16 3h5v5',move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4',copy:'M8 8h13v13H8zM3 16V3h13',rotate:'M20 8a8 8 0 1 0 0 8M20 2v6h-6',text:'M3 4h18M12 4v17M7 21h10',ruler:'m3 15 12-12 6 6L9 21zM7 11l3 3M11 7l3 3M15 3l3 3',erase:'m3 14 10-11 8 8-10 10H8zM7 10l10 10',select:'M5 3v17l5-6 5 7 3-2-5-7h8z',fit:'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${glyphs[name]||glyphs.move}"/></svg>`;
const tools={Draw:[['Line','LINE','line'],['Polyline','PLINE','polyline'],['Circle','CIRCLE','circle'],['Arc','ARC','arc'],['Rectangle','RECTANG','rectangle'],['Ellipse','ELLIPSE','circle'],['Spline','SPLINE','polyline']],Modify:[['Move','MOVE','move'],['Copy','COPY','copy'],['Rotate','ROTATE','rotate'],['Scale','SCALE','move'],['Mirror','MIRROR','copy'],['Offset','OFFSET','polyline'],['Trim','TRIM','erase'],['Extend','EXTEND','line'],['Erase','ERASE','erase']],Annotate:[['Text','TEXT','text'],['Multiline text','MTEXT','text'],['Linear dimension','DIMLINEAR','ruler'],['Aligned dimension','DIMALIGNED','ruler'],['Leader','LEADER','polyline']],View:[['Pan','PAN','move'],['Zoom','ZOOM','fit']]};

export async function mountCadControls({read,write,task,save,dialog,toast,frame,compact,switchDocument,switchLayout}){
 const available=new Set();let offset=0;
 do{const reply=await read({op:'commands',offset,limit:200});for(const name of reply.commands)available.add(name);offset=reply.next_offset;}while(offset!=null);
 let state=null,tab='Draw',documentKey='',optionsKey='';const host=document.createElement('section');host.className='cad-own-tools';host.setAttribute('aria-label','SparkWorld CAD tools');
 const documents=document.createElement('div');documents.className='cad-own-documents';documents.setAttribute('aria-label','Open drawings and layouts');frame.closest('.studio-frame-wrap').before(documents);
 host.innerHTML=`<div class="cad-tool-tabs" role="tablist" aria-label="CAD tool groups">${Object.keys(tools).map(name=>`<button type="button" role="tab" data-cad-tab="${name}">${name}</button>`).join('')}<button type="button" id="cad-own-undo" aria-label="Undo CAD edit">↶ Undo</button><button type="button" id="cad-own-redo" aria-label="Redo CAD edit">↷ Redo</button></div><div class="cad-own-tool-row"></div>`;
 frame.closest('.studio-frame-wrap').before(host);
 const command=document.createElement('form');command.className='cad-own-command';command.setAttribute('aria-label','CAD command input');command.innerHTML='<div id="cad-own-prompt" role="status">Choose a drawing tool or enter a CAD command.</div><div class="cad-command-row"><label for="cad-own-input">Command</label><input id="cad-own-input" autocomplete="off" spellcheck="false" aria-label="CAD command or next value"><button type="submit">Enter</button><button type="button" id="cad-own-cancel">Cancel</button></div>';
 frame.closest('.studio-frame-wrap').after(command);
 const input=command.querySelector('input');
 async function execute(cmd){await task('CAD · '+cmd,async()=>{const s=await read({op:'state'});if(!s.documents?.some(d=>d.id===s.document_id&&!d.start))throw Error('Open or create a drawing first.');if(s.modal)throw Error('Review the CAD notice before continuing.');if(s.command)throw Error('Finish or cancel the active command first.');await compact();await write({op:'run',cmd});});frame.focus();}
 function render(){host.querySelector('.cad-own-tool-row').innerHTML=`<button type="button" data-cad-cancel>${icon('select')}<span>Select</span></button>`+tools[tab].filter(([,cmd])=>available.has(cmd)).map(([label,cmd,glyph])=>`<button type="button" data-cad-command="${cmd}">${icon(glyph)}<span>${label}</span></button>`).join('')+`<button type="button" data-cad-fit>${icon('fit')}<span>Fit</span></button>`;
  for(const button of host.querySelectorAll('[data-cad-tab]'))button.setAttribute('aria-selected',String(button.dataset.cadTab===tab));
  for(const button of host.querySelectorAll('[data-cad-command]'))button.onclick=()=>execute(button.dataset.cadCommand).catch(e=>toast(e.message));
  host.querySelector('[data-cad-cancel]').onclick=()=>task('Selecting CAD objects…',()=>write({op:'cancel'})).catch(e=>toast(e.message));
  host.querySelector('[data-cad-fit]').onclick=()=>task('Fitting drawing…',()=>write({op:'action',name:'zoom_extents'})).catch(e=>toast(e.message));
 }
 for(const button of host.querySelectorAll('[data-cad-tab]'))button.onclick=()=>{tab=button.dataset.cadTab;render();};
 host.querySelector('#cad-own-undo').onclick=()=>task('Undoing CAD edit…',()=>write({op:'undo'})).catch(e=>toast(e.message));host.querySelector('#cad-own-redo').onclick=()=>task('Redoing CAD edit…',()=>write({op:'redo'})).catch(e=>toast(e.message));
 command.querySelector('#cad-own-cancel').onclick=()=>task('Cancelling CAD command…',()=>write({op:'cancel'})).catch(e=>toast(e.message));
 const options=document.createElement('div');options.className='cad-command-options';options.setAttribute('aria-label','Current CAD command options');options.hidden=true;command.querySelector('#cad-own-prompt').after(options);
 command.onsubmit=e=>{e.preventDefault();const text=input.value.trim();task('Sending CAD input…',async()=>{const s=await read({op:'state'});if(s.command)await write(text?{op:'input',kind:'token',text}:{op:'input',kind:'enter'});else if(text)await write({op:'run',cmd:text});else return;input.value='';}).catch(error=>toast(error.message));};
 function update(s){state=s;const c=s.command,prompt=c?(c.prompt||c.step?.prompt||c.name||JSON.stringify(c)):'Choose a drawing tool or enter a CAD command.';command.querySelector('#cad-own-prompt').textContent=typeof prompt==='string'?prompt:JSON.stringify(prompt);host.querySelector('#cad-own-undo').disabled=!!s.modal||!!c;host.querySelector('#cad-own-redo').disabled=!!s.modal||!!c;
  const nextOptions=JSON.stringify([s.document_id,c?.name,c?.prompt,c?.options]);
  if(nextOptions!==optionsKey){optionsKey=nextOptions;options.replaceChildren();options.hidden=!c?.options?.length;for(const option of c?.options||[]){const button=document.createElement('button');button.type='button';button.textContent=option.label;button.dataset.cadOption=option.keyword;button.onclick=()=>task('CAD option · '+option.label,async()=>{const current=await read({op:'state'});if(JSON.stringify([current.document_id,current.command?.name,current.command?.prompt,current.command?.options])!==nextOptions)throw Error('The CAD prompt changed. Choose an option from the current step.');await write(option.kind==='enter'?{op:'input',kind:'enter'}:{op:'input',kind:'token',text:option.keyword});}).catch(error=>toast(error.message));options.append(button);}}
  const active=s.documents.filter(d=>!d.start),key=JSON.stringify([s.document_id,active,s.layouts,s.layout]);
  if(key!==documentKey){documentKey=key;documents.hidden=!active.length||!s.hosted_view;documents.innerHTML='<div class="cad-document-tabs">'+active.map(d=>`<button type="button" data-cad-document="${d.id}" aria-pressed="${d.id===s.document_id}">${esc(d.path?.split(/[\\/]/).at(-1)||d.title)}${d.dirty?' •':''}</button>`).join('')+'</div>'+(Array.isArray(s.layouts)&&s.layouts.length?`<label class="cad-layout-choice">Layout<select id="cad-own-layout">${s.layouts.map(name=>`<option ${name===s.layout?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`:'');
   for(const b of documents.querySelectorAll('[data-cad-document]'))b.onclick=()=>switchDocument(Number(b.dataset.cadDocument)).catch(error=>toast(error.message));
   documents.querySelector('#cad-own-layout')?.addEventListener('change',event=>switchLayout(event.target.value).catch(error=>toast(error.message)));
  }
 }
 async function properties(){
  const pinned=await read({op:'state'});if(!pinned.selection.length)throw Error('Select a CAD object first.');
  const data=await read({op:'properties'}),layers=(await read({op:'records',collection:'layers',limit:10000})).records.map(r=>r.name),lineTypes=(await read({op:'records',collection:'line_types',limit:10000})).records.map(r=>r.name),fields=[];
  const body=data.sections.map(section=>`<details class="cad-property-section" open><summary>${esc(section.title)}</summary>${section.properties.map(p=>{
   const id='cad-property-'+fields.length;let editor='',kind=p.kind,options=p.options;
   if(kind==='layer')options=layers;if(kind==='linetype')options=['ByLayer','ByBlock',...lineTypes];
   if(kind==='readonly'||kind==='readonly_tooltip')return`<div class="cad-property-row"><span>${esc(p.label)}</span><output>${esc(p.value)}</output></div>`;
   if(kind==='number')editor=`<input type="number" step="any" id="${id}" value="${esc(p.value)}">`;
   else if(kind==='bool'||kind==='boolean')editor=`<input type="checkbox" id="${id}" ${p.value?'checked':''}>`;
   else if(options?.length)editor=`<select id="${id}">${[...new Set([String(p.value),...options.map(String)])].map(v=>`<option ${String(p.value)===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`;
   else if(['text','string','hyperlink','editable_choice','layer','linetype','hatch_pattern'].includes(kind))editor=`<input id="${id}" value="${esc(p.value)}">`;
   else if(kind==='color')editor=`<input type="number" min="0" max="256" step="1" id="${id}" value="${esc(p.value)}" title="CAD colour index: 0 ByBlock, 256 ByLayer">`;
   else return`<div class="cad-property-row"><span>${esc(p.label)}</span><output>${esc(p.value)}</output></div>`;
   fields.push({id,p});return`<label class="cad-property-row"><span>${esc(p.label)}</span>${editor}</label>`;
  }).join('')}</details>`).join('');
  dialog('CAD properties',`<p class="dialog-copy">${pinned.selection.length} selected · Changes update the native drawing. Each property is a separate undo step.</p><div class="cad-own-properties">${body}</div>`,[{label:'Apply properties',primary:true,run:async()=>{
   const changes=fields.map(({id,p})=>{const el=document.getElementById(id);const value=el.type==='checkbox'?el.checked:el.value;if(el.type==='number'&&(!Number.isFinite(Number(value))||value===''))throw Error('Enter a valid '+p.label+'.');return{p,value};}).filter(({p,value})=>String(value)!==String(p.value));
   await task('Applying CAD properties…',async()=>{for(const {p,value}of changes){const s=await read({op:'state'});if(s.document_id!==pinned.document_id||JSON.stringify(s.selection)!==JSON.stringify(pinned.selection))throw Error('The selected drawing or objects changed. Reopen Details.');await read({op:'property',document_id:pinned.document_id,revision:s.revision,request_id:'property-'+crypto.randomUUID(),field:p.id,value});}await save();});
  }},{label:'Close',run:()=>{}}]);
 }
 render();return{update,properties,element:host,commandElement:command};
}
