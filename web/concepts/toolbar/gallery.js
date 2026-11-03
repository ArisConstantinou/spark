const notice=document.querySelector('#notice');let timeout;
for(const button of document.querySelectorAll('[data-choice]'))button.addEventListener('click',async()=>{
 const text='Επιλέγω το concept '+button.dataset.choice+' για την εργαλειοθήκη του SparkWorld.';
 try{await navigator.clipboard.writeText(text);notice.textContent='Αντιγράφηκε. Κάνε επικόλληση στο chat όταν θέλεις.';}catch{notice.textContent=text;}
 notice.hidden=false;clearTimeout(timeout);timeout=setTimeout(()=>notice.hidden=true,5500);
});
const links=[...document.querySelectorAll('.concept-nav a')];
if('IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting)for(const link of links){
   if(link.hash==='#'+entry.target.id)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');
  }
 },{rootMargin:'-90px 0px -55% 0px'});
 for(const section of document.querySelectorAll('.concept'))observer.observe(section);
}
