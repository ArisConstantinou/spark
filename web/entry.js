// The web product has one native CAD workspace. Earlier image drawings retain
// their own compatible route; existing Windows delivery remains unchanged.
const workspace=new URLSearchParams(location.search).get('workspace');
if(!globalThis.chrome?.webview&&!['image','legacy'].includes(workspace)){
 const response=await fetch(new URL('./cad-studio.html',import.meta.url));
 if(!response.ok)throw Error('The CAD workspace could not load.');
 const page=new DOMParser().parseFromString(await response.text(),'text/html');
 page.body.querySelectorAll('script').forEach(script=>script.remove());
 document.body.className=page.body.className;document.body.dataset.sparkWorkspace='cad';document.body.replaceChildren(...page.body.childNodes);
 const style=document.createElement('link');style.rel='stylesheet';style.href=new URL('./cad-studio.css',import.meta.url);document.head.append(style);
 const workspaceStyle=document.createElement('link');workspaceStyle.rel='stylesheet';workspaceStyle.href=new URL('./cad-workspace.css',import.meta.url);document.head.append(workspaceStyle);
 await import('./cad-studio.js');await import('./cad-workspace.js');
}else await import('./app.js');
