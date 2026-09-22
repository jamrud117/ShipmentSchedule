"use strict";
/* ------------------------------------------------------------------
   BANDING GARIS EXCEL CIPL KUMHO -- GARIS YANG TERLIHAT, BUKAN ATRIBUT

   Pemakaian (butuh paket exceljs):
     node qa/banding-garis-excel.js <berkas-asli.xlsx> <hasil.xlsx> CI
     node qa/banding-garis-excel.js <berkas-asli.xlsx> <hasil.xlsx> PL

   Kenapa bukan membandingkan border tiap sel: garis yang sama bisa
   disimpan sebagai "bawah baris 9" atau "atas baris 10", dan garis di
   DALAM sel gabungan tidak pernah digambar Excel. Membandingkan
   atributnya menghasilkan ratusan "beda" yang tidak kelihatan dan
   menenggelamkan beda yang sungguhan. Alat ini menyatukan keduanya
   jadi peta garis yang terlihat, lalu membandingkan PETA itu --
   blok kepala baris demi baris, blok kaki disejajarkan ke baris
   TOTAL (jumlah baris barangnya memang boleh berbeda).

   Dipakai untuk memastikan hasil unduhan 0 garis berbeda dari berkas
   Kumho aslinya.
------------------------------------------------------------------ */
/* Membandingkan GARIS YANG TERLIHAT, bukan atribut sel.
   Garis antara baris r & r+1 ada kalau bawah(r) ATAU atas(r+1) diset;
   garis di dalam sel gabungan tidak digambar Excel, jadi diabaikan. */
const ExcelJS=require('exceljs');
const K=(s)=>({thin:'t',medium:'M',thick:'T',dotted:'.',hair:'h',dashed:'-',double:'D'}[s]||s);
const kol=(a)=>a.replace(/\d+/g,'').split('').reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
async function tepi(f, sheet){
  const wb=new ExcelJS.Workbook(); await wb.xlsx.readFile(f);
  const ws=wb.getWorksheet(sheet); let total=null;
  // Sel TOTAL di lembar PL asli berupa RUMUS (=CI!...), jadi yang dibaca hasilnya.
  const teks=(v)=>v&&typeof v==='object'?(v.result!=null?v.result:(v.richText?v.richText.map(t=>t.text).join(''):'')):v;
  ws.eachRow((r,n)=>r.eachCell({includeEmpty:false},c=>{ if(String(teks(c.value)||'').trim()==='TOTAL :') total=n; }));
  const merges=(ws.model.merges||[]).map(m=>{const [a,b]=m.split(':');return {r1:+a.match(/\d+/)[0],c1:kol(a),r2:+b.match(/\d+/)[0],c2:kol(b)};});
  const dalam=(r,c)=>merges.find(m=>r>=m.r1&&r<=m.r2&&c>=m.c1&&c<=m.c2);
  const b=(r,c)=>ws.getRow(r).getCell(c).border||{};
  const H={}, V={};
  for(let r=0;r<=ws.rowCount;r++) for(let c=1;c<=11;c++){
    // garis mendatar di bawah baris r (antara r dan r+1)
    const m1=r>0&&dalam(r,c), m2=dalam(r+1,c);
    if(m1&&m2&&m1===m2) continue;
    const s=(r>0&&b(r,c).bottom)||(r+1<=ws.rowCount&&b(r+1,c).top);
    if(s) H[r+':'+c]=K(s.style);
  }
  for(let r=1;r<=ws.rowCount;r++) for(let c=0;c<=11;c++){
    const m1=c>0&&dalam(r,c), m2=c<11&&dalam(r,c+1);
    if(m1&&m2&&m1===m2) continue;
    const s=(c>0&&b(r,c).right)||(c<11&&b(r,c+1).left);
    if(s) V[r+':'+c]=K(s.style);
  }
  return {H,V,total,rows:ws.rowCount};
}
(async()=>{
  const [fa,fb,sheet]=process.argv.slice(2);
  const A=await tepi(fa,sheet), B=await tepi(fb,sheet);
  const kepala = sheet==='CI'?31:30;
  const selaras=(r,X)=> r<=kepala ? r : (r - X.total);   // kaki disejajarkan ke TOTAL
  const kunci=(r,X)=> r<=kepala ? 'K'+r : 'T'+(r-X.total);
  const kumpul=(X,peta)=>{const o={};for(const [k,v] of Object.entries(peta)){const [r,c]=k.split(':').map(Number);
      if(r>kepala && (r<X.total-1)) continue; o[kunci(r,X)+':'+c]=v;} return o;};
  const beda=[];
  for (const jenis of ['H','V']) {
    const a=kumpul(A,A[jenis]), b=kumpul(B,B[jenis]);
    new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>{
      if((a[k]||'')!==(b[k]||'')){
        const [r,c]=k.split(':');
        const lokasi = jenis==='H' ? `mendatar di bawah ${r} kolom ${String.fromCharCode(64+ +c)}` : `tegak di ${r} kanan kolom ${c==='0'?'(tepi kiri)':String.fromCharCode(64+ +c)}`;
        beda.push(`${lokasi.padEnd(38)} asli=${(a[k]||'-').padEnd(2)} kita=${b[k]||'-'}`);
      }
    });
  }
  console.log(`${sheet}: ${beda.length} garis berbeda (K=baris kepala, T±n=relatif baris TOTAL)`);
  beda.sort().forEach(x=>console.log('  '+x));
})().catch(e=>console.log('ERR',e.message));
