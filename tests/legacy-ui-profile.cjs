// Geometry/annotation suites deliberately exercise the preserved Studio layout.
// ui-layout-lab.cjs separately exercises every new presentation and real commands.
module.exports=async function(context){const {defaults,usePreset,UI_KEY}=await import('../web/ui-preferences.js');let config=usePreset(defaults(),'desktop','classic');config=usePreset(config,'mobile','classic');await context.addInitScript(({key,config})=>localStorage.setItem(key,JSON.stringify(config)),{key:UI_KEY,config});};
