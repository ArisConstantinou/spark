// Startup no longer opens CAD implicitly. Tests which intentionally verify
// restoration must take the same explicit action as a returning user.
module.exports=async function continueSaved(page){
 await page.waitForFunction(()=>window.sparkWorkspace?.ready,null,{timeout:120000});
 const resume=page.getByRole('button',{name:'Continue saved drawing',exact:true});
 await resume.waitFor({state:'visible'});await resume.click();
 await page.waitForFunction(()=>sparkWorkspace.busy||sparkWorkspace.project||document.querySelector('#dialog')?.open,null,{timeout:120000});
};
