"use strict";
(async()=>{
 try {
  let stored=await window.kai.call("storage.get",{key:"legacy-compare-tally"});
  if(stored===null){ const original=await window.kai.call("desktop.preferencesRead",{keys:["kai-compare-tally"]});if(original["kai-compare-tally"]){try{stored=JSON.parse(original["kai-compare-tally"]);}catch{}if(stored)await window.kai.call("storage.set",{key:"legacy-compare-tally",value:stored});}}
  if(stored!==null)localStorage.setItem("kai-compare-tally",JSON.stringify(stored));
  const result=await fetch("/core/models").then(r=>r.json());
  const aliases=result.aliases||result.models||[];
  pickable=aliases.filter(m=>m.status==="ready").map(m=>({v:m.alias,label:"Local · "+m.label.split(" (")[0]}));
  const network=await fetch("/core/network").then(r=>r.json()).catch(()=>null);
  if(network&&network.privacyMode!=="local-only"&&network.schedulerUrl&&network.walletUnlocked!==false)pickable.push({v:"koinos-network",label:"Koinos Network · Auto"});
  renderCompare();
  $("view-compare").hidden=false;
  $("cmp-vote").addEventListener("click",()=>{let tally;try{tally=JSON.parse(localStorage.getItem("kai-compare-tally")||"{}");}catch{return;}void window.kai.call("storage.set",{key:"legacy-compare-tally",value:tally}).catch(error=>{ $("cmp-status").hidden=false;$("cmp-status").textContent=error.message; });});
 }catch(error){$("view-compare").hidden=false;$("cmp-status").hidden=false;$("cmp-status").textContent=error.message;}
})();
