# Setup MAS-APP

Panduan setup awal aplikasi Manajemen Armada PT. Mitra Angkutan Sejati.

## Prasyarat

- Python 3.11+ (backend FastAPI)
- Node.js 18+ dan npm (frontend React/Vite)
- Akun Supabase ([daftar gratis](https://supabase.com))

## 1. Buat Supabase Project

1. Login ke [supabase.com](https://supabase.com) → **New project**
2. Isi:
   - **Name:** `mas-app` (atau bebas)
   - **Database password:** simpan baik-baik (untuk koneksi langsung)
   - **Region:** pilih `Southeast Asia (Singapore)` untuk latency terbaik di Indonesia
3. Tunggu provisioning ±2 menit

## 2. Jalankan Migration SQL

Buka **SQL Editor** di Supabase Dashboard, lalu jalankan file di folder
`supabase/migrations/` **berurutan**:

| Urutan | File                                       | Isi                                         |
|--------|--------------------------------------------|---------------------------------------------|
| 1      | `20260520000001_init_schema.sql`           | Tables, indexes, updated_at triggers        |
| 2      | `20260520000002_functions_triggers.sql`    | gen_job_number, gen_share_token, sync triggers, RPC utilisasi |
| 3      | `20260520000003_rls_policies.sql`          | Row Level Security semua tabel              |
| 4      | `20260520000004_storage.sql`               | Bucket `job-photos` + storage policies      |
| 5      | `20260520000005_seed.sql`                  | Seed jenis_unit (Lowbed, Highbed, dst)      |
| 6      | `20260520000006_realtime.sql`              | Aktifkan realtime untuk jobs/units/photos   |

Cara: copy isi file → paste ke **SQL Editor** → **Run**.

Migration setelah nomor 6 dijalankan berurutan sesuai nama file (nama file
diawali tanggal, jadi urutan abjad = urutan jalan). Yang terbaru:

| File                                | Isi                                                        |
|-------------------------------------|------------------------------------------------------------|
| `20260804000001_quotations.sql`     | Modul penawaran: tabel `quotations` & `quotation_items`, penomoran surat otomatis (`0018/SK/MAS/VIII/2026`), kolom legalitas di `customers` |
| `20260804000002_fix_quotation_number_ambiguity.sql` | Perbaikan `next_quotation_number()` — tanpa ini penerbitan nomor gagal dengan error *column reference "tahun" is ambiguous* |
| `20260805000001_uang_jalan.sql`     | Modul uang jalan: tabel `sumber_dana` & `uang_jalan`, kolom `jobs.uang_jalan_pagu`, helper `can_access_job()` |
| `20260907000001_driver_portal.sql`  | Sesi portal driver (PIN + `driver_sessions`), konfirmasi `jobs.accepted_at`, RPC tulis untuk driver, dan **perketatan policy anon** pada halaman pelacakan |
| `20260907000002_masa_berlaku_dokumen.sql` | Masa berlaku STNK/KIR/pajak di `units` dan SIM di `drivers`, dipakai pengingat di lonceng notifikasi |
| `20260907000003_invoices.sql`       | Modul tagihan & piutang: `invoices`, `invoice_items`, `invoice_payments`, penomoran `0001/INV/MAS/I/2026`, RPC `get_piutang_summary()` & `get_job_profitability()` |
| `20260907000004_pod.sql`            | Bukti terima barang: kolom `jobs.pod_*` dan RPC `driver_submit_pod()` yang menutup job sekaligus menyimpan tanda tangan penerima |
| `20260922000001_alur_job_v2_enum.sql` | **Jalankan sendiri dulu, lalu klik Run lagi untuk file berikutnya.** Menambah nilai enum status job v2 (`ditugaskan`, `diterima`, `serah_terima_pool`, `menunggu_validasi`) dan tipe foto `serah_terima`. Postgres melarang nilai enum baru dipakai di transaksi yang sama, karena itu dipisah. |
| `20260922000002_alur_job_v2.sql`    | Alur job v2 sesuai `PRD-Alur-Kerja-Job-v2.md`: Lock System driver, Sequence Lock uang jalan, slot foto per sisi (`job_photos.stage/slot`), pengajuan uang jalan (`uang_jalan_requests`), bukti transfer (`uang_jalan.bukti_transfer_path` + bucket privat `bukti-transfer`), validasi admin (`admin_validate_job`, `admin_return_job`), perangkat push (`driver_devices`), notifikasi kejadian (`notifications`). Menonaktifkan `driver_submit_pod` (e-POD dihapus). |
| `20260924000001_profiles_email_unique.sql` | Email pengguna unik di `profiles` (tanpa membedakan huruf besar/kecil). Berhenti dengan daftar email ganda kalau data lama masih bentrok. |
| `20260924000002_move_to_transport_schema.sql` | **Pindahkan seluruh tabel, enum, dan fungsi aplikasi dari `public` ke schema `transport`.** Setelah menjalankannya, buka **Project Settings → Data API → Exposed schemas** dan tambahkan `transport` — tanpa itu semua request API ditolak. Backend membaca schema dari `SUPABASE_DB_SCHEMA` (default `transport`). |
| `20260924000003_hr_karyawan.sql` | Schema `hr` dengan tabel `hr.karyawan` (id, nama, tanggal lahir, alamat). RLS aktif, hanya superadmin yang boleh akses. |
| `20260924000004_pengguna_wajib_karyawan.sql` | Pengguna wajib terhubung ke karyawan (`profiles.karyawan_id` → `hr.karyawan`, satu karyawan satu akun). Membuat karyawan dummy bernama sama untuk setiap pengguna lama. Pendaftaran akun tanpa karyawan ditolak database. |
| `20260924000005_tambah_karyawan.sql` | Fungsi `tambah_karyawan()` (tombol Tambah karyawan) dan `karyawan_pilihan_pengguna()` (pilihan nama di Edit pengguna). Hanya superadmin. |
| `20260924000006_jenis_unit_nama_unik.sql` | Nama jenis unit unik tanpa membedakan huruf besar/kecil dan spasi berlebih. Berhenti dengan daftar nama ganda kalau data lama masih bentrok. |
| `20260924000007_soft_delete.sql` | **Soft delete di semua tabel.** Kolom `status` (1 = aktif, 2 = dihapus) di setiap tabel `transport` & `hr`; kolom `status` lama diganti nama (`units.status_operasional`, `jobs.status_job`, `incident_logs.status_penanganan`, `quotations.status_penawaran`, `invoices.status_tagihan`, `uang_jalan_requests.status_pengajuan`). DELETE apa pun diubah database jadi `status = 2`. **Naikkan backend versi baru bersamaan** — backend lama memakai nama kolom lama. Sekaligus memperbaiki `next_invoice_number()` yang gagal dengan *column reference "tahun" is ambiguous*. |
| `20260924000008_transaksi.sql` | Fungsi `jalankan_transaksi()`: proses tulis beberapa langkah (tambah/edit invoice & penawaran, ubah status + catatan, selesaikan insiden, ganti foto) dijalankan dalam **satu transaksi** — semua tersimpan, atau semua dibatalkan (rollback). Logout driver juga jadi satu transaksi. **Naikkan backend versi baru bersamaan.** |
| `20260924000009_log_sistem.sql` | **Log sistem** (`transport.log_sistem`): karyawan, aksi (Login/Logout/Tambah Data/Update Data/Hapus Data), keterangan, waktu, IP address. Tambah/ubah/hapus dicatat trigger dalam transaksi yang sama; login/logout admin dicatat backend, login/logout driver di fungsi database. Hanya superadmin yang bisa membaca. |
| `20260924000010_log_sistem_daftar.sql` | Fungsi `daftar_log_sistem()` untuk halaman **Log Sistem** (menu superadmin): filter tanggal, karyawan, aksi, pencarian, dan paging di server. |
| `20260924000011_zona_waktu_wib.sql` | **Zona waktu database → Asia/Jakarta (WIB).** Dashboard Supabase & API menampilkan jam WIB (kolom `TIMESTAMPTZ` seperti `log_sistem.waktu` tidak perlu dikonversi). Fungsi penomoran job/tagihan/penawaran, umur piutang, dan cek tanggal lahir dibuat eksplisit memakai tanggal WIB. Setelah menjalankan, restart project Supabase supaya koneksi baru memakai WIB. |
| `20260924000012_log_tambah_pengguna.sql` | Log "Tambah Data Pengguna" terisi karyawan pembuat & IP (akun dibuat lewat Supabase Auth yang tidak membawa identitas). Titipan pembuat hanya dipercaya bila milik superadmin aktif. **Naikkan backend versi baru bersamaan.** |
| `20260924000013_unit_trailer.sql` | **Master Unit Trailer** (menu Master → Unit Trailer): kode trailer (unik), tahun, jenis unit trailer, kapasitas muatan (ton), status trailer. Soft delete + log sistem. Baca sesuai scope jenis unit, tambah/edit/hapus superadmin. |
| `20260924000014_jenis_unit_trailer.sql` | **Master Jenis Unit Trailer** (tabel sendiri, beda dengan Jenis Unit truk). Unit Trailer memakai `jenis_unit_trailer_id`; trailer lama dipindahkan otomatis ke jenis unit trailer bernama sama. Pencatat log tidak lagi bisa gagal karena label tabel belum terdaftar. |
| `20260924000015_unit_trailer_status.sql` | Status unit trailer hanya **Standby / Perbaikan** (trailer berstatus "terpakai" dikembalikan ke standby). |
| `20260924000016_jenis_unit_trailer_jenis_unit.sql` | Jenis Unit Trailer **wajib terhubung ke Jenis Unit** (`jenis_unit_id`). Jenis unit trailer yang sudah terdaftar dihubungkan ke jenis unit **Tractor Head** (`4cf7792f-b353-4f2c-8b49-bfb9a9eb7b4f`). Akses operator ke Unit Trailer mengikuti scope Jenis Unit. |
| `20260924000017_job_unit_trailer.sql` | **Unit Trailer di Job** (`jobs.unit_trailer_id`). Bila jenis unit dari unit yang dipilih punya jenis unit trailer, unit trailer wajib & harus yang cocok; bila tidak, harus kosong — dijaga trigger database. Fungsi `unit_trailer_untuk_unit()` untuk pilihan di form job. **Naikkan backend & frontend versi baru bersamaan.** |
| `20260924000018_karyawan_akun_per_role.sql` | Satu karyawan boleh punya **akun per role** (mis. Operator + Super Administrator); karyawan + role yang sama ditolak ("data sudah terdaftar"). Form Tambah/Edit Pengguna menampilkan semua karyawan. **Naikkan backend & frontend versi baru bersamaan.** |
| `20260924000019_sesi_login_log_wajib.sql` | **Sesi login + karyawan & IP wajib di log sistem.** Login menyimpan karyawan & IP ke `sesi_pengguna`; setiap aksi memakainya — sesi tidak ditemukan → diminta login lagi; sesi dihapus hanya saat logout. Driver wajib terhubung ke karyawan (driver lama dihubungkan/dibuatkan karyawan otomatis). **Semua pengguna perlu login ulang setelah deploy.** Naikkan backend versi baru bersamaan. |
| `20260924000020_menu_karyawan.sql` | **Menu Karyawan** (superadmin): tambah/edit/hapus karyawan + status aktif. Karyawan **nonaktif** → akun pengguna & driver miliknya tidak bisa login/dipakai. Nama driver dipilih dari karyawan (nama driver & akun mengikuti nama karyawan). Tombol "Tambah karyawan" di Pengguna dihapus. Naikkan backend & frontend bersamaan. |
| `20260924000021_tagihan_job_tervalidasi.sql` | Rincian tagihan hanya boleh berisi job yang **sudah divalidasi admin** (dijaga juga di database). |
| `20260924000022_job_ganti_unit.sql` | **Ganti truk** di job (saat loading / dalam perjalanan / unloading): truk pengganti Stand by, driver opsional ikut diganti, alasan wajib; truk lama otomatis Perbaikan. Riwayat di tabel `job_ganti_unit`, tampil di detail job. Naikkan backend & frontend bersamaan. |
| `20260924000023_istilah_surat_jalan.sql` | Istilah foto "surat timbang" → **"surat jalan"** di pesan aplikasi driver (kode slot tetap `surat_timbang`). |
| `20260924000024_slot_surat_jalan.sql` | Kode slot foto `surat_timbang` → **`surat_jalan`** (data foto lama ikut diubah, tercatat di log sistem). Aplikasi driver versi lama yang masih mengirim `surat_timbang` tetap diterima. **Urutan: migration + backend dulu, baru rilis aplikasi driver baru.** |
| `20260924000025_pengguna_multi_role.sql` | **Satu akun, banyak role.** `profiles.roles` (role lama ikut terisi); role yang dipakai dipilih per sesi login (pilihan role setelah login & dari menu profil, tercatat di log). Karyawan + role yang sama tidak boleh di dua akun aktif. Menutup celah: pengguna non-superadmin tidak bisa mengubah role/scope/status akunnya sendiri. **Naikkan backend & frontend bersamaan.** |
| `20260924000026_edit_akun_sendiri.sql` | Superadmin boleh **mengedit akunnya sendiri** di menu Pengguna (email, karyawan, role, scope) — role Super Administrator tidak bisa dilepas dari akun sendiri dan akun sendiri tidak bisa dinonaktifkan. Naikkan backend & frontend bersamaan. |
| `20260924000027_aktifkan_pengguna_cek_karyawan.sql` | Pengguna **hanya bisa diaktifkan bila karyawannya berstatus Aktif** (juga saat akun dibuat atau dipindah karyawan). Menu Pengguna menandai akun yang karyawannya nonaktif. Naikkan backend & frontend bersamaan. |
| `20260924000028_unit_terjual.sql` | Status unit baru **Terjual**: tidak bisa dipakai job, tidak ikut dashboard/peta/jadwal/jumlah armada, tidak berubah otomatis oleh job/insiden. Hanya bisa dijual bila tidak ada job yang belum selesai. Bisa dikoreksi kembali ke Stand by. Laporan utilisasi tidak menghitung hari setelah terjual. Naikkan backend & frontend bersamaan. |
| `20260924000029_unit_diafkirkan.sql` | Status unit baru **Diafkirkan** — perlakuan sama dengan Terjual (tidak bisa dipakai job, keluar dari armada, bisa dikoreksi ke Stand by). Naikkan backend & frontend bersamaan. |
| `20260924000030_perbaikan_review.sql` | **Perbaikan keamanan hasil code review.** Langkah transaksi tidak lagi bisa memalsukan pelaku log / hapus permanen; pembuatan akun hanya lewat menu Pengguna (sign up mandiri ditolak, data titipan lewat `app_metadata`) dan kini tercatat di log; halaman tracking publik menyembunyikan data terhapus; pencairan uang jalan hanya menandai pengajuan job yang sama; edit tagihan lama tidak lagi ditolak; logout driver sesi lama tidak gagal; ganti truk aman dari dua admin bersamaan. **Wajib naikkan backend versi baru bersamaan** (tanpa itu tambah pengguna ditolak). Tambah pengguna lewat Supabase Dashboard (Add user) juga ditolak — pakai menu Pengguna. |
| `20260926000001_ganti_truk_insiden.sql` | **Ganti truk** kini sekaligus mencatat **insiden kerusakan** untuk truk lama (tanggal & jam, lokasi GPS terakhir, deskripsi — diisi di form ganti truk). Truk lama jadi Breakdown lalu mengikuti alur insiden (Perbaikan → Standby), tidak lagi langsung Perbaikan. Naikkan backend & frontend bersamaan. |
| `20260926000002_afkir_insiden.sql` | **Afkir unit menutup insiden**: unit diafkirkan (dari Standby / Breakdown / Perbaikan, setelah konfirmasi) → semua insiden Open / Dalam penanganan jadi **Selesai (diafkirkan)**. Kembali dari Diafkirkan ke Standby wajib alasan, dan insiden tadi dibuka lagi ke Open / Dalam penanganan sesuai pilihan (status unit lalu mengikuti insiden). Naikkan backend & frontend bersamaan. |
| `20260926000003_koreksi_zona_waktu.sql` | **Koreksi data jam lama**: ETD/ETA job & tanggal insiden yang tersimpan 7 jam terlalu lambat dimundurkan 7 jam. **Jalankan SEBELUM frontend baru naik** (data dari frontend baru sudah benar). Aman dijalankan ulang (tidak mengoreksi dua kali). Job/insiden yang pernah diedit masih perlu dicek manual — query pemeriksaannya ada di bawah file migrasi. |
| `20260926000004_penjualan_kontak_pisah.sql` | **Penjualan unit**: kontak pembeli dipisah jadi **No HP** dan **Email** (keduanya opsional, formatnya divalidasi). Isi kolom kontak lama dipindah otomatis (bagian email → Email, sisanya → No HP), lalu kolom lama dihapus. Naikkan backend & frontend bersamaan. |
| `20260926000005_penjualan_cek_status_aset.sql` | **Penjualan unit**: unit / unit trailer yang sedang **Bertugas** (termasuk masih dipakai job yang belum selesai), **Perbaikan**, atau **Terjual** ditolak saat dicatat terjual. Di form, semua aset yang belum terjual tampil; yang tidak bisa dijual menampilkan alasannya. Jalankan setelah 000004. Naikkan backend & frontend bersamaan. |
| `20260926000006_unit_trailer_setara_unit.sql` | **Unit trailer diperlakukan sama dengan unit**: status sama (Standby / Bertugas / Breakdown / Perbaikan / Terjual / Diafkirkan), dokumen KIR & SRUT (opsional), riwayat status, status otomatis Bertugas saat dipakai job, insiden bisa dicatat langsung pada trailer (alur Breakdown → Perbaikan → Standby), serta afkir & kembali dari afkir. Penanda insiden yang ditutup sistem kini umum (`ditutup_karena`: diafkirkan / terjual). Trailer Standby yang sedang dipakai job otomatis jadi Bertugas. Naikkan backend & frontend bersamaan. |
| `20260926000007_penjualan_tutup_insiden.sql` | **Jual aset Breakdown**: setelah konfirmasi, aset jadi Terjual dan insiden yang masih terbuka ditandai **Selesai (terjual)**. Batal jual membuka lagi insiden tersebut (aset kembali Breakdown) dan aset yang Diafkirkan saat dijual kembali ke Diafkirkan. Jalankan setelah 000006. |
| `20260926000008_penghapusan_aset.sql` | **Menu Penghapusan Unit & Unit Trailer** (superadmin): satu-satunya jalan menandai aset **Diafkirkan** — tanggal, alasan (wajib), catatan, dan bukti (bucket baru `bukti-penghapusan`). Semua aset bisa dihapus kecuali yang Terjual / Diafkirkan; yang sedang Bertugas ditolak sampai job-nya selesai. Insiden terbuka ditutup **Selesai (diafkirkan)**. Batal hapus wajib alasan, aset kembali Standby, insiden dibuka lagi sesuai pilihan. Tombol **Ubah status** di detail unit / unit trailer dihapus. Naikkan backend & frontend bersamaan. |
| `20260926000009_rapikan_data_lama.sql` | **Perapian data lama** agar sesuai aturan baru: status Bertugas ↔ job berjalan disamakan; insiden terbuka pada aset Terjual/Diafkirkan ditutup; aset Breakdown/Perbaikan tanpa insiden, Terjual tanpa catatan penjualan, dan Diafkirkan tanpa catatan penghapusan dilengkapi **data dummy** bertanda `[DUMMY migrasi 000009]` (penjualan dummy: Rp 1). Aman dijalankan ulang. Ringkasan jumlah tampil sebagai NOTICE; query untuk mencari data dummy ada di bawah file. |
| `20260926000010_hapus_atau_nonaktifkan_aset.sql` | **Hapus atau nonaktifkan unit / unit trailer**: tombol Hapus (hilang dari aplikasi seakan tidak pernah ada) hanya bila belum punya riwayat job, insiden, service, penjualan, maupun penghapusan; selain itu tombol Nonaktifkan. Unit trailer kini bisa dinonaktifkan (`is_active`). Naikkan backend & frontend bersamaan. |
| `20260926000011_nomor_dokumen_aset.sql` | **Nomor otomatis dokumen aset**: surat penjualan `0001/SPJ/MAS/<bulan>/<tahun>`, berita acara serah terima `0001/BAST/MAS/…`, berita acara penghapusan `0001/BAP/MAS/…` — dibuat saat transaksi dicatat, urut per tahun. Catatan lama diberi nomor otomatis. Dokumen bisa diunduh (Cetak / Simpan PDF) dari menu Penjualan & Penghapusan. Naikkan backend & frontend bersamaan. |
| `20260926000012_penyerah_dokumen_ttd_edit.sql` | **Penjualan & penghapusan**: nama & jabatan orang yang menyerahkan unit (tercetak di surat & BAST); unggah surat penjualan & BAST bertanda tangan terpisah (opsional, boleh tidak bersamaan) dan berita acara penghapusan bertanda tangan; **edit & batalkan hanya selama belum ada dokumen bertanda tangan** (dijaga di DB). Jalankan setelah 000011. Naikkan backend & frontend bersamaan. |
| `20260926000013_tagihan_job_unik.sql` | **Satu job hanya boleh ditagihkan satu kali**: rincian tagihan dengan job yang sudah ada di tagihan lain (yang tidak dibatalkan) atau dipilih dua kali di tagihan yang sama ditolak di DB; memulihkan tagihan batal / terhapus juga dicek. Tidak mengubah data — jumlah job ganda di data lama dilaporkan lewat NOTICE. Jalankan setelah 000012. |
| `20260926000014_tagihan_terkunci.sql` | **Tagihan terkunci**: tagihan yang sudah ada pembayaran atau faktur pajak tidak bisa diedit (isi & rincian) maupun dihapus — dijaga di DB. Kolom yang diisi sistem (pembayaran, status lunas, faktur) tetap berjalan. Tidak mengubah data. Jalankan setelah 000013. |
| `20260926000015_penawaran_keputusan_per_item.sql` | **Penawaran per item**: keputusan deal / ditolak dan revisi harga per item (harga awal tetap tersimpan); `jobs.quotation_item_id` — job hanya dari item deal pada penawaran berstatus Deal (dijaga DB); keputusan item terkunci setelah dibuat job. Data lama: item dari penawaran Deal/Ditolak ikut berkeputusan sama; job lama dari penawaran ber-item tunggal dihubungkan ke itemnya (butuh superadmin aktif untuk log). **Naikkan backend & frontend bersamaan** (backend baru membaca kolom baru). Jalankan setelah 000014. |

> **Cek setelah migration 000019 (data produksi).** Driver lama dihubungkan ke
> karyawan berdasarkan kesamaan nama. Periksa apakah ada driver yang tersambung
> ke karyawan yang salah (mis. karyawan kantor yang punya akun pengguna):
>
> ```sql
> SELECT d.nama AS driver, d.no_hp, k.nama AS karyawan, d.status AS status_driver,
>        (SELECT string_agg(p.email, ', ') FROM transport.profiles p
>          WHERE p.karyawan_id = k.id AND p.status = 1) AS akun_pengguna
>   FROM transport.drivers d JOIN hr.karyawan k ON k.id = d.karyawan_id
>  ORDER BY akun_pengguna NULLS LAST, d.nama;
> ```
> Baris dengan `akun_pengguna` terisi perlu dicek; koreksi lewat menu Driver
> (ganti nama driver ke karyawan yang benar).

> **Mengubah data lewat SQL Editor.** Sejak migration 000019, perubahan data
> di luar aplikasi ditolak kecuali identitas diisi dulu (karyawan superadmin):
>
> ```sql
> SELECT transport.mulai_sesi_manual('<karyawan_id superadmin>', 'SQL Editor - alasan');
> UPDATE transport.invoices SET status = 1 WHERE invoice_number = '...';
> SELECT transport.selesai_sesi_manual();
> ```

> **Mengembalikan data yang terhapus.** Baris yang dihapus pengguna tetap ada
> dengan `status = 2`. Kembalikan lewat SQL Editor, mis.
> `UPDATE transport.invoices SET status = 1 WHERE invoice_number = '...';`
> — anak yang ikut terhapus (item, pembayaran) dikembalikan dengan cara yang
> sama. Hapus permanen hanya bila memang disengaja:
> `BEGIN; SET LOCAL app.hard_delete = 'on'; DELETE FROM ...; COMMIT;`

> **Migration baru setelah pindah schema.** Objek tanpa nama schema akan
> dibuat di `public`. Awali setiap file migration baru dengan
> `SET search_path = transport, extensions;`, dan beri fungsi baru
> `SET search_path = transport, extensions`.

> **Migration alur job v2 mengubah status job.** `menunggu_pickup` dimigrasikan
> ke `ditugaskan`; job yang sudah `selesai` dianggap tervalidasi. Jalankan
> bersamaan dengan penerapan backend + frontend versi ini — kode lama tidak
> mengenal status baru.

> **Migration portal driver mengubah cara halaman pelacakan customer membaca
> data.** Sebelumnya policy anon melepas *semua* job aktif kepada siapa pun
> yang tahu URL Supabase — token-nya tidak pernah benar-benar dicocokkan.
> Sekarang token dikirim sebagai header `x-share-token` oleh
> `createAnonClient(token)`. Karena itu migration ini harus dijalankan
> bersamaan dengan penerapan kode aplikasinya; menjalankan salah satunya saja
> membuat halaman `/track/<token>` menampilkan "link kedaluwarsa".

> Nomor tagihan mulai dari 0001 tiap tahun. Kalau Anda sudah pernah menerbitkan
> invoice manual tahun ini, tambahkan baris
> `INSERT INTO document_counters (doc_type, tahun, last_seq) VALUES ('invoice', 2026, <nomor terakhir>);`
> sebelum membuat tagihan pertama, supaya penomorannya menyambung arsip.

> Migration uang jalan menanam lima baris `sumber_dana` sesuai kolom kas di
> laporan Excel yang berjalan (`BRI Rika`, `BRI`, `OA`, dan dua kolom yang
> sepanjang Agustus 2026 bernilai nol). Nama dan pemegangnya bisa diubah dari
> aplikasi; kolom `kolom_excel` yang menentukan pencairan masuk kolom mana saat
> laporan diekspor kembali ke format lama.

> Migration penawaran menyimpan nomor surat terakhir yang dipakai (0017 tahun
> 2026) ke tabel `document_counters`, supaya penomoran dari aplikasi menyambung
> arsip Word yang sudah berjalan dan tidak mengulang dari 0001. Kalau nomor
> terakhir Anda ternyata bukan 0017, ubah baris `INSERT INTO document_counters`
> di bagian akhir file itu **sebelum** dijalankan.

## 3. Buat Admin User Pertama

Buka **Authentication → Users → Add user → Create new user**:

- **Email:** admin email Anda
- **Password:** minimal 6 karakter
- **Auto Confirm User:** centang ✓

Trigger `handle_new_user` akan otomatis membuat row di tabel `profiles` dengan
role `admin`. Cek di **Table Editor → profiles** untuk verifikasi.

> Maksimum 3 admin user untuk MVP (sesuai PRD FR-AUTH-06). Tambahkan via cara
> yang sama bila perlu.

## 4. Konfigurasi Environment Variables

Ada dua sisi yang perlu dikonfigurasi.

**Backend** — salin `backend/.env.example` jadi `backend/.env`, lalu isi:

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=...            # Settings → API → anon / publishable key
SUPABASE_SERVICE_ROLE_KEY=...    # service role / secret key — hanya untuk cron & snapshot mileage
SUPABASE_DB_SCHEMA=transport     # schema tabel aplikasi (harus ada di Data API → Exposed schemas)
TRACKSOLID_ACCOUNT=...
TRACKSOLID_PASSWORD=...
OPENROUTESERVICE_API_KEY=...
CRON_SECRET=...                  # bebas; dipakai penjadwal eksternal memanggil /api/cron/*
APP_URL=http://localhost:5173    # URL frontend, untuk tautan reset password
CORS_ORIGINS=http://localhost:5173
FIREBASE_CREDENTIALS_FILE=       # opsional: path service-account JSON Firebase untuk push ke aplikasi driver
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` menembus semua RLS. Jangan commit, jangan
> pernah dikirim ke browser. File `.env` sudah di-gitignore.

**Frontend** — saat pengembangan tidak perlu apa-apa: Vite mem-proxy `/api`
ke `http://localhost:8000`. Untuk produksi, salin `frontend/.env.example` jadi
`frontend/.env` dan isi `VITE_API_URL` dengan alamat backend (kosongkan bila
frontend dan backend dilayani dari origin yang sama lewat reverse proxy).

## 4b. Portal Driver

Driver login di `/driver/login` dengan **nomor HP + PIN 6 angka**. PIN di-set
admin dari **Driver → pilih driver → Edit → PIN portal driver**; tombol *Acak*
menghasilkan PIN acak. PIN hanya bisa dilihat sekali saat dibuat — setelahnya
hanya bisa diganti, karena yang tersimpan di database adalah hash-nya.

Driver tanpa PIN tidak bisa membuka portal sama sekali. Mengganti PIN otomatis
mencabut semua sesi perangkat driver itu, jadi ini juga cara mengeluarkan HP
yang hilang.

Alur di sisi driver: job baru muncul bertanda **Belum dikonfirmasi** → driver
menekan **Terima Job** → barulah tombol update status terbuka. Job ditutup
lewat form **Serah terima** (nama penerima + tanda tangan di layar), bukan
lewat tombol status. Admin tetap bisa menutup job dari kantor tanpa serah
terima, untuk penerima yang menolak tanda tangan digital.

## 5. Install Dependencies & Jalankan

Backend (terminal 1):

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Dokumentasi OpenAPI tersedia di <http://localhost:8000/docs>.

Frontend (terminal 2):

```powershell
cd frontend
npm install
npm run dev
```

Buka <http://localhost:5173/login> dan login dengan admin user yang Anda buat.

Untuk mengakses dari HP di jaringan yang sama: `npm run dev:lan`, lalu
tambahkan origin HP (mis. `http://192.168.1.10:5173`) ke `CORS_ORIGINS` backend.

## 6. (Opsional) Email SMTP untuk Reset Password

Untuk MVP, Supabase pakai SMTP bawaan dengan rate limit ketat. Untuk
production, configure custom SMTP di **Authentication → Email Templates →
SMTP Settings**.

## 7. Deploy

- **Backend**: jalankan `uvicorn app.main:app --host 0.0.0.0 --port 8000`
  (atau lewat Docker/systemd) di server mana pun yang punya Python 3.11+.
  Set `ENVIRONMENT=production` supaya `/docs` dimatikan, dan isi `CORS_ORIGINS`
  dengan domain frontend.
- **Frontend**: `npm run build` menghasilkan `frontend/dist/` statis — bisa
  di-host di Vercel/Netlify/Nginx. Karena ini SPA, semua path harus di-rewrite
  ke `index.html`. Isi `VITE_API_URL` saat build bila backend beda origin.
- **Cron mileage**: jadwalkan `POST https://<backend>/api/cron/sync-mileage/backfill`
  dengan header `Authorization: Bearer <CRON_SECRET>` (mis. harian) untuk
  mengisi snapshot mileage hari-hari yang terlewat.

---

## Setelah Setup

### Tambah unit/driver/customer pertama

Login → menu **Unit / Driver / Customer** → **+ Tambah**.

### Buat job pertama

**Job → + Job baru** → isi form. Setelah simpan, Anda dapat **share link
customer** yang bisa langsung di-copy.

### Test customer tracking

Buka share link di browser/tab incognito. Customer tidak perlu login.

---

## Troubleshooting

**"Failed to create user" saat add admin**
→ Database belum di-migrate. Pastikan migration 01 & 02 sudah dijalankan.

**Login berhasil tapi data kosong**
→ Cek apakah profile row tercipta di tabel `profiles`. Kalau tidak, jalankan
ulang migration 02 (trigger `handle_new_user`). Atau buat manual:
```sql
INSERT INTO profiles (id, email, nama, role)
VALUES ('<user-id-dari-auth>', '<email>', '<nama>', 'admin');
```

**RLS error saat insert**
→ Pastikan user yang login punya row di `profiles` dengan `is_active = true`.

**Upload foto gagal**
→ Cek bucket `job-photos` ada di Storage. Jalankan migration 04 bila belum.

**Frontend tidak bisa memanggil API (error CORS / network)**
→ Pastikan backend jalan di port 8000 dan origin frontend ada di `CORS_ORIGINS`.
Saat dev, Vite mem-proxy `/api` sehingga CORS tidak diperlukan.

**Customer page kosong / 404**
→ Pastikan migration 03 (RLS) sudah jalan dan share_token valid.

---

## Struktur Folder

```
backend/app/
├── core/            config, auth Supabase, sesi driver, klien Supabase, error, storage
├── domain/          fungsi murni (bentrok jadwal, status servis, uang jalan)
├── integrations/    TrackSolid, OpenRouteService, polyline/ETA
└── modules/<fitur>/ router.py · service.py · schemas.py

frontend/src/
├── app/             router, provider, layout, guard
├── lib/             klien API, sesi, util
├── types/           tipe domain
├── components/      ui/ dan layout/
└── features/<fitur>/ api.ts · queries.ts · components/ · pages/

mobile/lib/
├── core/            config (API_BASE_URL), klien API, sesi, push FCM, tema
└── features/<fitur>/ auth · jobs · camera · upload · notifications

supabase/migrations/   SQL files (jalankan di Supabase SQL Editor)
legacy/                versi Next.js lama — referensi saja
```

## Aplikasi mobile driver (Flutter)

Lihat `mobile/README.md`. Ringkas:

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE_URL=http://<ip-komputer-backend>:8000
```

Push notification memerlukan project Firebase: `google-services.json` di
`mobile/android/app/` dan `FIREBASE_CREDENTIALS_FILE` di `backend/.env`.
Tanpa itu aplikasi tetap berjalan, hanya tanpa push.

---

## PRD Reference

Lihat `PRD-Aplikasi-Manajemen-Armada.md` untuk spec lengkap (21 screens,
brand identity, security, deployment).
