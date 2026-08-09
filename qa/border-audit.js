"use strict";

/* AUDIT GARIS DOKUMEN CETAK

   Bukan memeriksa aturan CSS-nya, melainkan HASILNYA: tiap elemen
   dirender ke DOM, border terhitungnya dibaca, lalu tiap batas
   geometris ditelusuri siapa pemiliknya.

   Dua hal yang diperiksa:
     1. Seluruh garis harus SATU ketebalan.
     2. Tidak ada batas yang digambar dua elemen sekaligus.

   Grid tabel dibangun dengan memperhitungkan colspan & rowspan —
   mencocokkan sel antarbaris menurut indeks salah begitu ada keduanya,
   dan dokumen ini penuh keduanya.

   Elemen yang MENJOROK dari bingkai (kotak tanda tangan surat jalan)
   bukan garis ganda: garisnya memang dua, terpisah jarak, dan itu
   disengaja.

   Catatan: var() disubstitusi manual karena jsdom tidak menguraikannya.
   Kalau ada var tanpa definisi, ia dilaporkan — bukan diam-diam
   terbaca sebagai "tanpa border".
*/
function auditGarisCetak(JSDOM, dokumen) {
  const laporan = [];
  for (const d of dokumen) {
  /* jsdom tidak mengurai var(). Variabelnya disubstitusi di sini,
     persis seperti yang dilakukan peramban — kalau ada var yang tidak
     punya definisi, ia dibiarkan dan akan terbaca sebagai "tanpa
     border", sehingga justru ketahuan. */
  const def = {};
  d.css.replace(/(--[\w-]+):\s*([^;]+);/g, (_, k, v) => { def[k] = v.trim(); });
  const cssJelas = d.css.replace(/var\((--[\w-]+)\)/g, (m, k) => def[k] || m);
  if (/var\(--/.test(cssJelas)) { ganda.push('var() tanpa definisi'); }
  const j=new JSDOM(`<style>${cssJelas}</style><body>${d.html}</body>`);
  const w=j.window, D=w.document;
  const sisi=(el,s)=>{const cs=w.getComputedStyle(el);
    const st=cs['border'+s+'Style']; if(!st||st==='none') return 0;
    return Math.round((parseFloat(cs['border'+s+'Width'])||0)*100)/100;};
  const nama=(el)=>el.tagName.toLowerCase()+(el.className?'.'+String(el.className).trim().split(/\s+/).join('.'):'');

  // 1) Ketebalan yang dipakai
  const tebal=new Map();
  D.querySelectorAll('*').forEach(el=>['Top','Right','Bottom','Left'].forEach(s=>{
    const v=sisi(el,s); if(v>0) tebal.set(v,(tebal.get(v)||0)+1);}));

  /* Grid sebenarnya: colspan & rowspan diperhitungkan.

     Mencocokkan sel antarbaris menurut indeks salah begitu ada
     colspan/rowspan — dan tabel ini penuh keduanya (baris Total,
     header "Unit Price"/"CBM", sel Keterangan yang membentang). */
  const bangunGrid=(tb)=>{
    const grid=[], isi=[];
    [...tb.rows].forEach((tr,r)=>{
      grid[r]=grid[r]||[];
      let c=0;
      [...tr.cells].forEach(td=>{
        while(grid[r][c]) c++;
        const cs=td.colSpan||1, rs=td.rowSpan||1;
        for(let dr=0;dr<rs;dr++) for(let dc=0;dc<cs;dc++){
          grid[r+dr]=grid[r+dr]||[];
          grid[r+dr][c+dc]={el:td, kiri:dc===0, kanan:dc===cs-1, atas:dr===0, bawah:dr===rs-1};
        }
        isi.push(td); c+=cs;
      });
    });
    return grid;
  };

  const ganda=[];
  D.querySelectorAll('table').forEach(tb=>{
    const grid=bangunGrid(tb);
    grid.forEach((baris,r)=>{
      (baris||[]).forEach((sel,c)=>{
        if(!sel) return;
        const kn=(grid[r]||[])[c+1];
        // Batas tegak: hanya kalau keduanya sel BERBEDA
        if(kn && kn.el!==sel.el && sel.kanan && kn.kiri
           && sisi(sel.el,'Right')>0 && sisi(kn.el,'Left')>0)
          ganda.push(`${nama(sel.el)} kanan + ${nama(kn.el)} kiri`);
        const bw=(grid[r+1]||[])[c];
        if(bw && bw.el!==sel.el && sel.bawah && bw.atas
           && sisi(sel.el,'Bottom')>0 && sisi(bw.el,'Top')>0)
          ganda.push(`${nama(sel.el)} bawah + ${nama(bw.el)} atas`);
      });
    });
  });

  /* Blok bertumpuk langsung di dalam bingkai.

     Kalau blok berikutnya berupa TABEL, garis atasnya digambar oleh
     sel baris pertamanya — bukan oleh elemen tabelnya. Memeriksa
     elemen tabel saja membuat garis ganda paling khas di dokumen ini
     lolos: judul yang menggambar border-bottom sementara baris
     pertama blok di bawahnya menggambar border-top. */
  const sisiAtasBlok=(el)=>{
    if(sisi(el,'Top')>0) return el;
    const tb = el.tagName==='TABLE' ? el : el.querySelector('table');
    if(!tb || !tb.rows.length) return null;
    const pertama=[...tb.rows[0].cells].find(td=>sisi(td,'Top')>0);
    return pertama||null;
  };
  const sisiBawahBlok=(el)=>{
    if(sisi(el,'Bottom')>0) return el;
    const tb = el.tagName==='TABLE' ? el : el.querySelector('table');
    if(!tb || !tb.rows.length) return null;
    const akhir=[...tb.rows[tb.rows.length-1].cells].find(td=>sisi(td,'Bottom')>0);
    return akhir||null;
  };
  D.querySelectorAll('.ci-box,.sj-box').forEach(box=>{
    const anak=[...box.children];
    anak.forEach((el,i)=>{const nx=anak[i+1];
      if(!nx) return;
      /* Dua blok yang TERPISAH JARAK bukan garis ganda — garisnya
         memang dua, dan itu disengaja (kotak tanda tangan surat jalan
         diberi margin dari tabel barang di atasnya). */
      const cs1=w.getComputedStyle(el), cs2=w.getComputedStyle(nx);
      const jarak=(parseFloat(cs1.marginBottom)||0)+(parseFloat(cs2.marginTop)||0);
      if(jarak>0) return;
      const bawah=sisiBawahBlok(el), atas=sisiAtasBlok(nx);
      if(bawah && atas)
        ganda.push(`${nama(bawah)} bawah + ${nama(atas)} atas`);});
  });

  /* BINGKAI vs ISINYA — sumber bug yang paling sering terlewat.

     Yang dibandingkan bukan border elemen bloknya, melainkan border
     yang BENAR-BENAR tergambar — pada tabel, itu milik SEL, bukan
     elemen tabelnya. Membandingkan elemen blok saja membuat dua kelas
     cacat lolos: sel kolom pertama yang menggambar tepi kiri, dan
     baris terakhir yang menggambar tepi bawah. */
  D.querySelectorAll('.ci-box,.sj-box').forEach(box=>{
    /* Elemen yang sengaja MENJOROK dari bingkai — garisnya memang
       dua, terpisah jarak.

       Ditulis sebagai daftar, bukan dihitung dari padding/margin:
       jsdom mengarang nilai padding untuk sisi yang tidak diatur,
       sehingga perhitungan geometris selalu bilang "menjorok" dan
       SELURUH pemeriksaan bingkai terlewati tanpa bersuara.

       Kalau nanti ada blok menjorok baru dan lupa didaftarkan, yang
       muncul positif palsu — arah kesalahan yang aman. */
    const MENJOROK = ['.sj-sign'];
    const menjorok=(el)=>MENJOROK.some(sel=>el.closest && el.closest(sel));
    const lapor=(s,el)=>{
      if(!el || el===box || sisi(el,s)<=0 || menjorok(el)) return;
      ganda.push(`bingkai ${nama(box)} ${s} + ${nama(el)} ${s}`);
    };
    const anak=[...box.children];
    ['Top','Bottom','Left','Right'].forEach(s=>{
      if(sisi(box,s)<=0) return;
      if(s==='Top')    lapor(s, anak[0] && sisiAtasBlok(anak[0]));
      if(s==='Bottom') lapor(s, anak[anak.length-1] && sisiBawahBlok(anak[anak.length-1]));
      if(s==='Left'||s==='Right'){
        box.querySelectorAll('table').forEach(tb=>{
          const grid=bangunGrid(tb);
          const kandidat=new Set();
          grid.forEach(brs=>{ if(!brs) return;
            const isi=brs.filter(Boolean);
            if(!isi.length) return;
            const sel = s==='Left' ? isi[0] : isi[isi.length-1];
            if(sel && (s==='Left' ? sel.kiri : sel.kanan)) kandidat.add(sel.el);});
          kandidat.forEach(el=>lapor(s,el));
        });
      }
    });
  });

  
    laporan.push({
      nama: d.nama,
      tebal: [...tebal.entries()].map(([v, n]) => ({ px: v, jumlah: n })),
      ganda: [...new Set(ganda)],
    });
  }
  return laporan;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { auditGarisCetak };
}
