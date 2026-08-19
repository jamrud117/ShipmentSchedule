/* ==================================================================
   AUDIT KEAMANAN SUPABASE — ShipmentSchedule

   CARA PAKAI. Buka Supabase Dashboard -> SQL Editor -> tempel
   SELURUH berkas ini -> Run. Baca kolom VONIS di tiap bagian.

   KENAPA INI ADA. Kunci publishable di js/config.js memang boleh
   dilihat siapa pun — itu gunanya. Yang menahan orang asing membaca
   data DDI BUKAN kerahasiaan kunci itu, melainkan Row Level Security
   di database. Kalau RLS mati atau kebijakannya longgar, repositori
   privat sekalipun tidak menolong: kuncinya tetap terkirim ke setiap
   peramban yang membuka halaman.

   Jalankan ulang tiap kali menambah tabel baru.
================================================================== */

/* ------------------------------------------------------------------
   1. RLS HIDUP DI SETIAP TABEL?

   Ini pemeriksaan terpenting. Tabel publik tanpa RLS bisa dibaca —
   dan sering juga ditulis — oleh siapa pun yang punya kunci
   publishable, tanpa login sama sekali.
------------------------------------------------------------------ */
SELECT
  '1. RLS PER TABEL'                        AS bagian,
  c.relname                                 AS tabel,
  CASE WHEN c.relrowsecurity THEN 'hidup' ELSE 'MATI' END AS rls,
  CASE
    WHEN NOT c.relrowsecurity THEN 'BAHAYA — terbuka untuk umum'
    WHEN NOT c.relforcerowsecurity AND c.relowner <> 10 THEN 'aman'
    ELSE 'aman'
  END                                       AS vonis
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;


/* ------------------------------------------------------------------
   2. ADAKAH KEBIJAKAN YANG MENGIZINKAN PERAN "anon"?

   "anon" = pengunjung yang BELUM login. Untuk aplikasi internal DDI,
   satu-satunya yang wajar dijangkau anon adalah fungsi login. Tidak
   ada tabel jadwal, barang, atau profil yang perlu dibuka untuknya.

   Kebijakan dengan roles = {public} juga ikut kena: "public" berarti
   SEMUA peran, termasuk anon.
------------------------------------------------------------------ */
SELECT
  '2. KEBIJAKAN TERBUKA'                    AS bagian,
  tablename                                 AS tabel,
  policyname                                AS kebijakan,
  cmd                                       AS perintah,
  roles::text                               AS peran,
  'PERIKSA — anon/public kebagian'          AS vonis
FROM pg_policies
WHERE schemaname = 'public'
  AND (roles::text LIKE '%anon%' OR roles::text = '{public}')
ORDER BY tablename, policyname;
/* Kosong = bagus. */


/* ------------------------------------------------------------------
   3. TABEL BER-RLS TAPI TANPA KEBIJAKAN SAMA SEKALI

   Ini bukan lubang keamanan — RLS tanpa kebijakan justru menolak
   semuanya. Tapi biasanya artinya tabel itu rusak diam-diam: aplikasi
   membaca kosong terus tanpa pesan galat yang jelas.
------------------------------------------------------------------ */
SELECT
  '3. RLS TANPA KEBIJAKAN'                  AS bagian,
  c.relname                                 AS tabel,
  'aplikasi akan selalu membaca kosong'     AS vonis
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  );


/* ------------------------------------------------------------------
   4. FUNGSI SECURITY DEFINER — SIAPA YANG BOLEH MEMANGGIL?

   admin_set_password dan admin_delete_user berjalan dengan hak
   PEMBUATNYA, menembus RLS. Kalau pemeriksaan admin di dalamnya
   kurang, siapa pun yang sudah login — termasuk akun viewer — bisa
   mengganti sandi akun lain.

   Bacalah kolom `isi_fungsi`. Yang dicari: baris yang memastikan
   pemanggilnya benar-benar admin, misalnya
     if (select role from profiles where id = auth.uid()) <> 'exim'
     then raise exception ...
   Kalau pemeriksaan itu TIDAK ADA, tambal sekarang juga.
------------------------------------------------------------------ */
SELECT
  '4. FUNGSI ISTIMEWA'                      AS bagian,
  p.proname                                 AS fungsi,
  CASE WHEN p.prosecdef THEN 'DEFINER (menembus RLS)' ELSE 'INVOKER' END AS mode,
  pg_get_functiondef(p.oid)                 AS isi_fungsi
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY p.proname;


/* ------------------------------------------------------------------
   5. SIAPA SAJA YANG DAPAT HAK LANGSUNG DI TABEL

   GRANT itu lapisan DI LUAR RLS. Peran anon yang punya GRANT SELECT
   di sebuah tabel tanpa RLS bisa membaca isinya tanpa halangan apa
   pun. Supabase memberi GRANT luas secara bawaan, jadi jangan kaget
   melihat anon di sini — yang menahannya memang RLS di bagian 1.
   Bagian ini untuk memastikan tidak ada tabel yang lolos DUA-DUANYA.
------------------------------------------------------------------ */
SELECT
  '5. HAK LANGSUNG ANON'                    AS bagian,
  g.table_name                              AS tabel,
  string_agg(DISTINCT g.privilege_type, ', ' ORDER BY g.privilege_type) AS hak,
  CASE WHEN c.relrowsecurity
       THEN 'aman — ditahan RLS'
       ELSE 'BAHAYA — tanpa RLS, benar-benar terbuka' END AS vonis
FROM information_schema.role_table_grants g
JOIN pg_class c      ON c.relname = g.table_name
JOIN pg_namespace n  ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE g.table_schema = 'public'
  AND g.grantee = 'anon'
GROUP BY g.table_name, c.relrowsecurity
ORDER BY c.relrowsecurity, g.table_name;
