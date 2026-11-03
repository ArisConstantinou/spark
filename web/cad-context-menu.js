// SPDX-License-Identifier: GPL-3.0-only
// The host owns canvas menus; commands still run against the native document.
export function installCadContextMenu({inner,frame,state,enabled,defer,act,onError}){
 const menu=document.createElement('section');menu.className='cad-context-menu';menu.hidden=true;menu.setAttribute('aria-label','Drawing actions');menu.setAttribute('role','menu');document.body.append(menu);
 const paths={move:'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4',copy:'M8 8h13v13H8zM3 16V3h13',rotate:'M20 8a8 8 0 1 0 0 8M20 2v6h-6',erase:'m3 14 10-11 8 8-10 10H8z',undo:'M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14',redo:'m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14',fit:'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',layers:'m12 3 10 6-10 6L2 9zM2 13l10 6 10-6M2 17l10 6 10-6',details:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',settings:'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6',cancel:'m5 5 14 14M19 5 5 19',finish:'m4 12 5 5L20 6'};
 let pinned=null,pending=false,opening=false,generation=0;
 function close(focus=false){generation++;opening=false;menu.hidden=true;if(focus)frame.focus();}
 function open(event){
  if(event.target?.tagName!=='CANVAS'||!enabled())return;
  event.preventDefault();event.stopImmediatePropagation();
  if(pending||opening)return;
  const point={x:event.clientX,y:event.clientY},token=++generation;opening=true;
  Promise.resolve().then(state).then(s=>{if(token===generation)render(s,point);}).catch(onError).finally(()=>{if(token===generation)opening=false;});
 }
 function render(s,point){
  pinned={documentId:s.document_id,selection:[...s.selection],command:s.command?.name};
  const actions=s.command?[['finish','Accept / next step'],['cancel','Cancel command']]:[['move','Move'],['copy','Copy'],['rotate','Rotate'],['erase','Erase'],['undo','Undo'],['redo','Redo'],['fit','Fit drawing'],['layers','Layers'],['details','Details'],['settings','UI Settings']];
  menu.replaceChildren();const heading=document.createElement('header'),title=document.createElement('span'),dismiss=document.createElement('button');title.textContent=s.command?'Current command':s.selection.length?`${s.selection.length} selected · Drawing actions`:'Drawing actions';dismiss.type='button';dismiss.textContent='×';dismiss.setAttribute('aria-label','Close drawing actions');dismiss.onclick=()=>close(true);heading.append(title,dismiss);menu.append(heading);
  const grid=document.createElement('div');grid.className='cad-context-actions';menu.append(grid);
  for(const [id,label]of actions){const button=document.createElement('button');button.type='button';button.dataset.contextAction=id;button.setAttribute('role','menuitem');button.disabled=id==='details'&&!s.selection.length;button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[id]}"/></svg><span>${label}</span>`;button.onclick=()=>{const target=pinned;close();pending=true;menu.dataset.busy='true';Promise.resolve().then(()=>act(id,target)).catch(onError).finally(()=>{pending=false;menu.dataset.busy='false';});};grid.append(button);}
  menu.hidden=false;const rect=frame.getBoundingClientRect(),bounds=menu.getBoundingClientRect(),x=rect.left+point.x,y=rect.top+point.y;
  menu.style.left=Math.max(8,Math.min(x,innerWidth-bounds.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-bounds.height-8))+'px';menu.querySelector('[role=menuitem]:not(:disabled)')?.focus();
 }
 inner.addEventListener('pointerdown',event=>{if(event.button===2)open(event);else close();},true);
 inner.addEventListener('pointerup',event=>{if(event.button===2&&event.target?.tagName==='CANVAS'&&enabled()){event.preventDefault();event.stopImmediatePropagation();}},true);
 inner.addEventListener('contextmenu',event=>{if(event.target?.tagName!=='CANVAS'||!enabled())return;event.preventDefault();event.stopImmediatePropagation();if(menu.hidden)open(event);},true);
 inner.addEventListener('keydown',event=>{if(event.key==='Escape'&&(opening||!menu.hidden)){event.preventDefault();event.stopImmediatePropagation();close(true);}},true);
 // Inert iframe input lands on its parent while automatic saving owns the
 // document. Preserve only the menu intent; never replay an editing click.
 frame.parentElement.addEventListener('pointerdown',event=>{
  if(event.button!==2||!frame.inert||event.target.closest('button,input,select,textarea,a'))return;
  const waiting=defer?.(),rect=frame.getBoundingClientRect();
  if(!waiting||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return;
  event.preventDefault();event.stopImmediatePropagation();if(pending||opening)return;
  const token=++generation,point={x:event.clientX-rect.left,y:event.clientY-rect.top};opening=true;
  Promise.resolve(waiting.done).then(()=>token===generation&&enabled()?state():null).then(s=>{if(s&&token===generation&&s.document_id===waiting.documentId)render(s,point);}).catch(onError).finally(()=>{if(token===generation)opening=false;});
 },true);
 frame.parentElement.addEventListener('contextmenu',event=>{if(opening||frame.inert&&defer?.()){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&opening){event.preventDefault();event.stopImmediatePropagation();close(true);}},true);
 document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))close();},true);
 window.addEventListener('resize',()=>close());window.addEventListener('blur',()=>queueMicrotask(()=>{if(!document.hasFocus()&&!frame.contentDocument?.hasFocus())close();}));
 menu.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();close(true);return;}if(event.key==='Tab'){close();return;}const buttons=[...menu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(['ArrowUp','ArrowLeft'].includes(event.key)?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();}});
 return{close};
}
