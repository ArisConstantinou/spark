// SPDX-License-Identifier: GPL-3.0-only
export const UI_KEY='sparkworld-ui-v1';
export const PRESETS=[
 {id:'classic',name:'Studio',description:'One compact tool row. One group at a time.',diagram:'row'},
 {id:'shelves',name:'1 · Shelves',description:'Independent tool rows. Optional stacking experiment.',diagram:'shelves'},
 {id:'drawer',name:'2 · Side dock',description:'Groups and tools in a floating side drawer.',diagram:'drawer'},
 {id:'context',name:'3 · Context',description:'Selection actions beside the selected-object summary.',diagram:'context'},
 {id:'personal',name:'4 · Personal',description:'Your favourites first, with searchable commands.',diagram:'personal'},
 {id:'morph',name:'5 · Morph',description:'A single capsule changes from groups to tools.',diagram:'morph'},
 {id:'compass',name:'6 · Compass',description:'One circular menu. Choose a group, then a tool.',diagram:'compass'},
 {id:'direct',name:'7 · Direct',description:'Selection-first Move, Rotate and Copy; creation tools on demand.',diagram:'direct'},
 {id:'rooms',name:'8 · Tool rooms',description:'A temporary overview of the tool families.',diagram:'rooms'},
 {id:'rings',name:'9 · Orbit rings',description:'Nested circles: groups, tools, then favourites or command options.',diagram:'rings'}
];
export const GROUPS=['Draw','Modify','Annotate','View'];
const base={layout:'rings',position:'right',header:'compact',navigation:'auto',command:'active',status:false,labels:true,density:'comfortable',theme:'obsidian',accent:'#238bff',opacity:98,ringSize:424,rings:3,sectors:6,autoClose:true,groupOrder:GROUPS,favourites:['LINE','PLINE','MOVE','COPY','TEXT','CIRCLE']};
export function defaults(){return{version:1,desktop:structuredClone(base),mobile:{...structuredClone(base),ringSize:296,navigation:'shown'},saved:[]};}
const choice=(value,values,fallback)=>values.includes(value)?value:fallback;
const number=(value,min,max,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,Math.round(value))):fallback;
export function profile(value={},fallback=base){const p={...fallback};
 p.layout=choice(value.layout,PRESETS.map(p=>p.id),fallback.layout);p.position=choice(value.position,['left','right','centre'],fallback.position);
 p.header=choice(value.header,['shown','compact','auto'],fallback.header);p.navigation=choice(value.navigation,['shown','auto'],fallback.navigation);p.command=choice(value.command,['always','active'],fallback.command);
 p.density=choice(value.density,['comfortable','compact','large'],fallback.density);p.theme=choice(value.theme,['obsidian','midnight','slate'],fallback.theme);
 for(const k of ['status','labels','autoClose'])p[k]=typeof value[k]==='boolean'?value[k]:fallback[k];
 p.accent=typeof value.accent==='string'&&/^#[\da-f]{6}$/i.test(value.accent)?value.accent:fallback.accent;
 p.opacity=number(value.opacity,85,100,fallback.opacity);p.ringSize=number(value.ringSize,260,560,fallback.ringSize);p.rings=number(value.rings,1,4,fallback.rings);p.sectors=number(value.sectors,4,8,fallback.sectors);
 p.groupOrder=Array.isArray(value.groupOrder)?[...new Set(value.groupOrder.filter(k=>GROUPS.includes(k))),...GROUPS.filter(k=>!value.groupOrder.includes(k))]:[...fallback.groupOrder];
 p.favourites=Array.isArray(value.favourites)?[...new Set(value.favourites.filter(k=>typeof k==='string'&&/^[A-Z][A-Z0-9_-]{0,30}$/.test(k)))].slice(0,12):[...fallback.favourites];return p;
}
export function normalize(value){if(!value||value.version!==1)throw Error('Choose a SparkWorld UI settings file (version 1).');const d=defaults();return{version:1,desktop:profile(value.desktop,d.desktop),mobile:profile(value.mobile,d.mobile),saved:Array.isArray(value.saved)?value.saved.slice(0,12).filter(s=>s&&typeof s.name==='string'&&s.name.trim()).map(s=>({name:s.name.trim().slice(0,60),desktop:profile(s.desktop,d.desktop),mobile:profile(s.mobile,d.mobile)})):[]};}
export function loadUI(storage){try{const text=storage.getItem(UI_KEY);return text?normalize(JSON.parse(text)):defaults();}catch{return defaults();}}
export function saveUI(storage,value){const clean=normalize(value);storage.setItem(UI_KEY,JSON.stringify(clean));return clean;}
export function usePreset(config,device,id){const result=normalize(config);result[device].layout=choice(id,PRESETS.map(p=>p.id),'rings');if(id==='classic'||id==='shelves'){Object.assign(result[device],{header:'shown',navigation:'shown',command:'always',status:true,autoClose:false});}else Object.assign(result[device],{header:'compact',navigation:device==='mobile'?'shown':'auto',command:'active',status:false,autoClose:true});return result;}
