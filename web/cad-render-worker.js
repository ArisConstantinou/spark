import {CadPainter} from './cad-display.js';
let painter;
self.onmessage=({data})=>{
 if(data.type==='source'){
  painter=new CadPainter(new OffscreenCanvas(1,1),data.font);painter.setSource(data.cad,data.hidden);
  const thumbnail=painter.makeThumbnail();if(thumbnail){const bitmap=thumbnail.transferToImageBitmap();self.postMessage({type:'thumbnail',bitmap},[bitmap]);}
 }else if(data.type==='render'&&painter){
  const {view,margin,viewportWidth,viewportHeight,dpr}=data,width=viewportWidth+margin*2,height=viewportHeight+margin*2;
  const started=performance.now();painter.resize(width,height,dpr);painter.draw({...view,x:view.x+margin,y:view.y+margin});
  const bitmap=painter.canvas.transferToImageBitmap();self.postMessage({type:'frame',bitmap,width,height,view,margin,viewportWidth,viewportHeight,dpr,stats:{...painter.stats,refineMs:performance.now()-started}},[bitmap]);
 }
};
