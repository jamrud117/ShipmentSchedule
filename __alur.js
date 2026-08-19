const fs=require("fs"),path=require("path");const {JSDOM}=require("jsdom");
const ROOT="/home/claude/work/ShipmentSchedule";
const htmlAsli=fs.readFileSync(ROOT+"/index.html","utf8");
const html=htmlAsli.replace(/<script[^>]*>[\s\S]*?<\/script>/g,"");
const dom=new JSDOM(html,{runScripts:"dangerously",url:"http://localhost/"});const w=dom.window;
w.supabase={createClient:()=>({from:()=>({select:()=>({order:async()=>({data:[],error:null})})}),auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({})}})};
w.bootstrap={Modal:class{constructor(){}show(){}hide(){}static getInstance(){return null}static getOrCreateInstance(){return new w.bootstrap.Modal()}}};
w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
w.requestAnimationFrame=(f)=>w.setTimeout(f,0);w.cancelAnimationFrame=(i)=>w.clearTimeout(i);
[...htmlAsli.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m=>m[1]).forEach(f=>{
  const el=w.document.createElement("script");el.textContent=fs.readFileSync(path.join(ROOT,f),"utf8");
  w.document.head.appendChild(el);});

const pages=JSON.parse(fs.readFileSync("/home/claude/pdfx/items.json","utf8"));
const teks=pages.map(p=>w.groupPdfItemsIntoLines(p).join("\n")).join("\n\n");
const hasil=w.parsePibPdfText(teks,pages);
console.log("=== CATATAN IMPOR ===");
(hasil.notes||[]).forEach(n=>console.log("  •",n));
console.log("\n=== DAFTAR BARANG ===");
(hasil.items||[]).forEach((it,i)=>console.log(
  ` ${i+1}. ${String(it.namaBarang).slice(0,34).padEnd(34)} qty=${String(it.qty).padEnd(6)} sat=${String(it.satuan).padEnd(4)} netto=${String(it.netto).padEnd(7)} package="${it.package}"`));
