let release;
export async function showVersion(){
 release??=fetch(new URL('./version.json',import.meta.url),{cache:'no-store'}).then(async response=>{
  if(!response.ok)return null;
  const value=await response.json();
  return typeof value.version==='string'&&/^[a-f\d]{40}$/i.test(value.commit)?value:null;
 }).catch(()=>null);
 const value=await release;if(!value)return;
 for(const label of document.querySelectorAll('[data-site-version]')){
  label.textContent=`v${value.version} · ${value.commit.slice(0,7)}`;
  label.title=`SparkWorld v${value.version} · Build ${value.commit}`;
 }
}
