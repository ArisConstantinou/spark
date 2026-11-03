// User-facing import states and recovery, independently of native decoding.
module.exports=async({page,check})=>{
 await page.evaluate(()=>{window.__originalFileReader=window.FileReader;window.FileReader=class{readAsArrayBuffer(){}abort(){this.onabort?.();}};});
 const cancelled=page.evaluate(()=>sparkWorkspace.importFile(new File(['AC1032'+'0'.repeat(200000)],'Cancelled drawing.dwg')).then(()=>null,error=>error.name));
 await page.locator('#cad-import-progress').waitFor({state:'visible'});
 check((await page.locator('#cad-import-stage').textContent())==='Reading the selected file','Cloud-provider byte reading has a visible, named loading stage');
 check(await page.locator('.topbar').evaluate(el=>el.inert),'Loading prevents competing edits and duplicate imports');
 const bounds=await page.locator('.cad-import-card').boundingBox();const width=await page.evaluate(()=>innerWidth);check(bounds.x>=0&&bounds.x+bounds.width<=width,'Loading controls fit inside the current viewport');
 await page.getByRole('button',{name:'Cancel reading',exact:true}).click();
 check(await cancelled==='AbortError','Cancel stops the actual pending file read before decoding');
 await page.waitForFunction(()=>!sparkWorkspace.busy);
 check(!(await page.locator('.topbar').evaluate(el=>el.inert))&&!await page.locator('#cad-import-progress').count(),'Cancellation restores controls and removes the loading overlay');
 check(await page.evaluate(()=>!sessionStorage.getItem('sparkworld-opening-drawing')),'An ordinary cancellation clears the interrupted-import marker');
 await page.evaluate(()=>window.FileReader=window.__originalFileReader);
 const failed=await page.evaluate(()=>sparkWorkspace.importFile(new File(['bad'],'Unsupported.pdf')).then(()=>null,error=>error.message));
 check(failed?.includes('opens DWG')&&!await page.locator('#cad-import-progress').count(),'Rejected formats restore the usable workspace without a stuck loader');
 await page.evaluate(()=>sessionStorage.setItem('sparkworld-opening-drawing',JSON.stringify({name:'Interrupted drawing.dwg',stage:'Opening the CAD drawing'})));
 await page.reload();await page.waitForFunction(()=>window.sparkWorkspace?.ready,{},{timeout:120000});
 check((await page.locator('#dialog-title').textContent())==='The previous drawing did not finish opening','An interrupted tab reports the unfinished operation on the next visit');
 check(await page.evaluate(()=>!sparkWorkspace.project&&!sessionStorage.getItem('sparkworld-opening-drawing')),'Interrupted imports do not automatically reopen into a crash loop');
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
};
