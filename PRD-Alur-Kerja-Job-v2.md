# Product Requirements Document (PRD)
## Alur Kerja Job v2 — Lock System, Uang Jalan, Dokumentasi Foto & Validasi
## PT. Mitra Angkutan Sejati

---

## 1. Informasi Dokumen

| Item | Keterangan |
|------|------------|
| Versi | 2.0 (draf) |
| Tanggal | 22 September 2026 |
| Status | Menunggu persetujuan pemilik produk |
| Melengkapi | `PRD-Aplikasi-Manajemen-Armada.md` v1 — bagian FR-JOB, FR-PHOTO, portal driver, uang jalan |
| Sumber | `Aturan Bisnis Inti (Business Rules).txt` + hasil diskusi dengan admin & pemilik produk |
| Tidak diubah | Modul **Penawaran (quotation)** — sudah final |

---

## 2. Ringkasan Eksekutif

Sistem MAS-APP saat ini sudah mengelola job pengiriman alat berat, namun alur
job belum mengikuti aturan operasional yang berlaku di lapangan: driver dapat
menutup job sendiri, tidak ada tahap validasi admin, tidak ada kunci uang jalan,
foto bukti muat/bongkar tidak terstruktur, dan driver memakai portal web tanpa
notifikasi.

Versi 2 menetapkan alur job **8 fase** dengan dua kunci wajib (**Lock System**
status driver dan **Sequence Lock** uang jalan), dokumentasi foto **per sisi
kendaraan** dengan pengecekan kualitas, pengajuan uang jalan oleh driver,
tahap **validasi admin** sebelum job dianggap selesai, dan **aplikasi mobile
Flutter** untuk driver dengan push notification.

---

## 3. Latar Belakang

### 3.1 Masalah pada alur saat ini
- Driver yang masih di jalan bisa terlanjur ditugaskan job lain karena sistem
  hanya mengecek bentrok jam, bukan status driver.
- Job dinyatakan selesai oleh driver sendiri; tidak ada pemeriksaan admin atas
  kelengkapan foto dan data sebelum diteruskan ke tagihan.
- Uang jalan dicatat terpisah dari kemajuan job; tidak ada bukti transfer dan
  tidak ada mekanisme yang memastikan driver menerima uang sebelum berangkat.
- Foto loading/unloading bebas jumlah dan tanpa identitas sisi, sehingga sulit
  dipakai sebagai bukti kondisi kendaraan.
- Portal driver berbasis web tidak bisa mengirim notifikasi dan tidak bisa
  mengontrol kamera (foto lama dari galeri bisa diunggah).

### 3.2 Tujuan
1. Alur job yang **terkunci berurutan** sesuai aturan operasional.
2. Bukti lapangan yang **lengkap, terstruktur, dan bisa divalidasi**.
3. Uang jalan yang **tercatat dari awal**, dicairkan berdasarkan pengajuan,
   dan terbukti transfernya.
4. Driver memakai **aplikasi mobile** yang menuntun langkah demi langkah.

---

## 4. Aturan Bisnis Inti (WAJIB)

| Kode | Aturan |
|------|--------|
| BR-01 **Lock System** | Driver memiliki status **Stand By** / **In Job**. Driver In Job tidak dapat dipilih untuk job lain. Status kembali Stand By **hanya** setelah admin menekan *Approve/Validasi* (Fase 7) — bukan saat driver menekan selesai. |
| BR-02 **Sequence Lock** | Tahap muat (*loading*) **selalu tertahan** sampai admin mengunggah bukti transfer uang jalan pertama. Selain itu, setiap pengajuan uang jalan yang belum dicairkan menahan kemajuan status job. |
| BR-03 **Master data** | Job wajib merujuk ke Master Customer. |
| BR-04 **Uang jalan sejak awal** | Nominal uang jalan (pagu) **wajib diisi** saat job dibuat. |
| BR-05 **Pengajuan bertahap** | Driver boleh mengajukan uang jalan kapan saja setelah *Terima Pekerjaan*, berkali-kali, **selama total yang sudah diterima < pagu**. Nominal pengajuan ≤ sisa pagu. |
| BR-06 **Foto wajib per slot** | Loading dan unloading masing-masing wajib 5 foto pada slot bernama: sisi depan, belakang, kanan, kiri kendaraan, dan surat timbang. Serah terima di pool wajib 1 foto. Status tidak dapat maju sebelum semua slot tahap tersebut terisi. |
| BR-07 **Validasi admin** | Job hanya berstatus *selesai* (dan masuk antrean tagihan) setelah admin memvalidasi seluruh input dan foto driver. |
| BR-08 **Catatan internal** | Catatan admin pada job tidak pernah tampil ke customer. |

---

## 5. Peran Pengguna

Tidak ada role baru.

| Peran | Keterangan |
|-------|------------|
| **Admin** (superadmin & operator) | Membuat job, mencairkan uang jalan (bertindak sebagai kasir), memvalidasi job. Operator dibatasi jenis unit sesuai scope (RLS). |
| **Driver** | Memakai aplikasi mobile: terima job, ajukan uang jalan, unggah foto per tahap, selesaikan. Bukan user Supabase — sesi token + PIN. |
| **Customer** | Halaman pelacakan publik lewat share token (tidak berubah). |
| **Finance** | Belum dibuat peran sendiri; tagihan tetap dibuat oleh admin dari job yang sudah tervalidasi. |
| **Mandor** | Disebut di Fase 6 sebagai penerima dokumen fisik; tidak punya akun. |

---

## 6. Alur Kerja Job (8 Fase)

### 6.1 Diagram status

```
ditugaskan ──(driver terima)──▶ diterima
   │ [kunci: menunggu pencairan berbukti pertama; pengajuan belum cair menahan]
   ▼
loading (5 slot foto) ──▶ dalam_perjalanan ──▶ unloading (5 slot foto)
   ▼
serah_terima_pool (1 foto) ──(driver "Selesaikan")──▶ menunggu_validasi
   ▼ (admin Approve)
selesai  ── driver → Stand By, unit → standby, job masuk antrean tagihan

cancelled dapat terjadi dari status mana pun oleh admin.
```

Status `ditugaskan` menggantikan `menunggu_pickup`; `menunggu_validasi`,
`serah_terima_pool`, dan `diterima` adalah status baru.

### 6.2 Rincian fase

| Fase | Aktor | Langkah | Hasil di sistem |
|------|-------|---------|-----------------|
| **1. Assignment** | Admin (web) | Pilih customer (Master) & PIC lapangan (nama, HP); input alat, lokasi asal & tujuan; pilih **driver Stand By** dan **unit Stand By**; tanggal-jam pickup (wajib), estimasi sampai (opsional — bila kosong dihitung dari durasi rute); **uang jalan (pagu) wajib**; catatan internal (opsional); Submit | Job `ditugaskan`, driver → In Job, unit → bertugas |
| **2. Penerimaan** | Driver (mobile) | Menerima push notification; membuka detail; **swipe** untuk menerima | `accepted_at` terisi, status `diterima`; admin dapat notifikasi |
| **3. Uang jalan** | Driver → Admin | Driver menekan **Ajukan Uang Jalan**, isi nominal ≤ sisa pagu, konfirmasi alert; admin dapat notifikasi, transfer, lalu mengunggah **bukti transfer** (pencairan tercatat: nominal, kas, foto). Dapat berulang selama sisa pagu > 0 | Kunci tahap muat terbuka setelah pencairan berbukti pertama |
| **4. Loading** | Driver | Tiba di lokasi muat; isi 5 slot foto (depan, belakang, kanan, kiri, surat timbang); lanjutkan | Status `loading` → `dalam_perjalanan` |
| **5. Unloading** | Driver | Tiba di lokasi bongkar; isi 5 slot foto yang sama; lanjutkan | Status `unloading` → `serah_terima_pool` |
| **6. Serah terima pool** | Driver | Kembali ke pool; serahkan dokumen fisik ke Mandor; unggah **foto serah terima**; tekan **Selesaikan Orderan** | Status `menunggu_validasi`; **driver tetap In Job** |
| **7. Validasi** | Admin (web) | Memeriksa semua input & foto per slot (termasuk penanda kualitas rendah dan koordinat foto); klik **Approve / Validasi** atau kembalikan dengan catatan | `selesai`; driver → Stand By; unit → standby |
| **8. Invoicing** | Admin (Finance) | Job `selesai` muncul di daftar *job belum ditagih*; buat tagihan (modul yang ada) | — |

Teks alert pengajuan uang jalan (persis):

> Apakah anda yakin ingin mengajukan uang jalan? Anda baru bisa melanjutkan
> perjalanan setelah admin kasir mengupload bukti transfer uang jalan.

---

## 7. Functional Requirements

### 7.1 Status driver & Lock System (FR-LOCK)

| ID | Requirement |
|----|-------------|
| FR-LOCK-01 | Driver memiliki status turunan `stand_by` / `in_job`: In Job bila memiliki job dengan status selain `selesai`/`cancelled`. |
| FR-LOCK-02 | Form job (web) hanya menampilkan driver `stand_by` dan unit `standby`; backend & database menolak penugasan driver In Job (bukan hanya peringatan). |
| FR-LOCK-03 | Pemeriksaan bentrok jadwal yang ada tetap berjalan sebagai lapis kedua. |
| FR-LOCK-04 | Status driver kembali `stand_by` hanya oleh transisi `menunggu_validasi → selesai` (Approve) atau pembatalan job oleh admin. |
| FR-LOCK-05 | Daftar driver & detail driver menampilkan status dan job aktifnya. |

### 7.2 Uang jalan (FR-UJ)

| ID | Requirement |
|----|-------------|
| FR-UJ-01 | Form tambah job memiliki kolom **Uang jalan** (rupiah, wajib, > 0), tersimpan sebagai pagu job. |
| FR-UJ-02 | Aplikasi driver menampilkan tombol **Ajukan Uang Jalan** sejak status `diterima`, beserta sisa pagu. Tombol nonaktif bila sisa pagu = 0 atau ada pengajuan yang belum dicairkan. |
| FR-UJ-03 | Pengajuan berisi nominal (wajib, ≤ sisa pagu) dan catatan opsional; sebelum dikirim tampil alert konfirmasi (teks di §6.2). |
| FR-UJ-04 | Backend menolak pengajuan yang melebihi sisa pagu atau saat job belum `diterima`. |
| FR-UJ-05 | Admin menerima notifikasi pengajuan (lonceng + push web bila tersedia) dan melihat daftar pengajuan menunggu di halaman Uang Jalan dan detail job. |
| FR-UJ-06 | Pencairan oleh admin wajib menyertakan: nominal, sumber dana (kas), dan **foto bukti transfer**; satu pencairan memenuhi satu pengajuan (nominal dapat berbeda dari yang diajukan, dicatat). |
| FR-UJ-07 | **Sequence Lock**: transisi ke `loading` ditolak database bila belum ada pencairan berbukti; transisi status apa pun ditolak bila ada pengajuan berstatus `diajukan`. Pesan ke driver: "Menunggu admin mengunggah bukti transfer uang jalan." |
| FR-UJ-08 | Penambahan pagu setelah job berjalan tetap lewat modul uang jalan yang ada (jejak `penambahan_pagu`). |

### 7.3 Dokumentasi foto (FR-PHOTO)

| ID | Requirement |
|----|-------------|
| FR-PHOTO-01 | Foto job memiliki `stage` (`loading`, `unloading`, `serah_terima`) dan `slot` (`depan`, `belakang`, `kanan`, `kiri`, `surat_timbang`, `serah_terima`). Satu foto per (job, stage, slot); unggah ulang mengganti foto lama. |
| FR-PHOTO-02 | Aplikasi driver menampilkan slot bernama dengan judul: *Foto sisi depan kendaraan*, *Foto sisi belakang kendaraan*, *Foto sisi kanan kendaraan*, *Foto sisi kiri kendaraan*, *Foto surat timbang*; tahap serah terima: *Foto serah terima dokumen*. |
| FR-PHOTO-03 | Foto hanya dapat diambil dari **kamera** (bukan galeri). |
| FR-PHOTO-04 | Setelah pengambilan, aplikasi menghitung ketajaman (*variance of Laplacian*), kecerahan, dan resolusi minimum (sisi pendek ≥ 1280 px). Bila di bawah ambang, tampil peringatan **"Foto tampak buram, disarankan ambil ulang"** dengan pilihan *Ambil ulang* / *Tetap gunakan*. |
| FR-PHOTO-05 | Backend menghitung ulang skor ketajaman (OpenCV), menyimpannya, dan menandai `kualitas_rendah` bila di bawah ambang. Ambang dapat dikonfigurasi per slot (surat timbang lebih ketat) dan dikalibrasi dengan foto lapangan. Unggahan **tidak ditolak** karena kualitas. |
| FR-PHOTO-06 | Aplikasi menstempel tanggal-jam dan koordinat GPS pada gambar, dan mengirim `taken_at`, `lat`, `lng` ke backend untuk disimpan. |
| FR-PHOTO-07 | Transisi `loading → dalam_perjalanan` dan `unloading → serah_terima_pool` ditolak database bila ada slot tahap tersebut yang kosong; `serah_terima_pool → menunggu_validasi` ditolak bila foto serah terima kosong. |
| FR-PHOTO-08 | Halaman validasi admin menampilkan foto per slot dengan judul, penanda kualitas rendah, waktu pengambilan, dan jarak ke lokasi asal/tujuan job. |
| FR-PHOTO-09 | Fitur e-POD (nama penerima + tanda tangan digital) **dihapus** dari alur; data lama tetap tersimpan untuk arsip. |

### 7.4 Validasi admin (FR-VAL)

| ID | Requirement |
|----|-------------|
| FR-VAL-01 | Daftar job memiliki filter/tab **Menunggu validasi**; dashboard menampilkan jumlahnya. |
| FR-VAL-02 | Halaman validasi menampilkan ringkasan job, riwayat status, uang jalan (pagu, pengajuan, pencairan + bukti), dan semua foto per tahap/slot. |
| FR-VAL-03 | Tombol **Approve / Validasi** mengubah status ke `selesai`, mencatat `validated_by` dan `validated_at`, dan membebaskan driver & unit. |
| FR-VAL-04 | Tombol **Kembalikan ke driver** mengubah status ke tahap yang perlu diperbaiki (mis. `serah_terima_pool`) dengan catatan; driver menerima push notification. |
| FR-VAL-05 | Super administrator dan operator (dalam scope jenis unitnya) dapat memvalidasi. |
| FR-VAL-06 | Job yang sudah `selesai` sebelum rilis v2 dianggap tervalidasi. |

### 7.5 Aplikasi mobile driver (FR-MOBILE)

| ID | Requirement |
|----|-------------|
| FR-MOBILE-01 | Aplikasi **Flutter** (Android prioritas pertama; iOS menyusul) di folder `mobile/` repo ini. |
| FR-MOBILE-02 | Login nomor HP + PIN 6 digit (memakai `POST /api/driver/login`); sesi tersimpan di perangkat. |
| FR-MOBILE-03 | Daftar job dengan filter *Perlu dikonfirmasi / Aktif / Selesai*; detail job dengan langkah aktif yang ditonjolkan. |
| FR-MOBILE-04 | **Swipe untuk menerima** job. |
| FR-MOBILE-05 | Push notification (Firebase Cloud Messaging) untuk: job baru, bukti transfer diunggah, job dikembalikan admin. Perangkat mendaftarkan token FCM ke backend. |
| FR-MOBILE-06 | Tampilan per tahap memandu driver: slot foto, tombol lanjut aktif hanya bila syarat terpenuhi, pesan kunci yang jelas. |
| FR-MOBILE-07 | Unggahan foto tahan koneksi buruk: antrean lokal, coba ulang otomatis, indikator progres. |
| FR-MOBILE-08 | Portal web driver yang ada dipertahankan sebagai cadangan selama transisi, mengikuti alur status yang sama. |

### 7.6 Notifikasi (FR-NOTIF)

| ID | Requirement |
|----|-------------|
| FR-NOTIF-01 | Admin: driver menerima job; pengajuan uang jalan baru; job menunggu validasi. Tampil di lonceng web (dan push web bila diaktifkan). |
| FR-NOTIF-02 | Driver: job baru ditugaskan; bukti transfer diunggah (kunci terbuka); job dikembalikan; job divalidasi. Push FCM + tampil di aplikasi. |
| FR-NOTIF-03 | Notifikasi berbasis **kejadian** disimpan di tabel notifikasi (bukan dihitung ulang), dengan status dibaca per pengguna. Notifikasi berbasis keadaan yang ada (servis, dokumen, piutang) tetap seperti sekarang. |

### 7.7 Assignment job — perubahan form (FR-JOB)

| ID | Requirement |
|----|-------------|
| FR-JOB-01 | Kolom baru wajib: **Uang jalan** (rupiah). |
| FR-JOB-02 | Pilihan driver hanya yang Stand By; pilihan unit hanya yang standby (sudah ada). |
| FR-JOB-03 | Bila estimasi sampai kosong dan rute tersedia, sistem mengisi ETA = ETD + durasi rute (OpenRouteService) dan menandainya "estimasi sistem". |
| FR-JOB-04 | Kolom `catatan` tidak dikirim ke endpoint pelacakan publik. |

---

## 8. Perubahan Model Data (ringkas)

| Objek | Perubahan |
|-------|-----------|
| `job_status` | Tambah `ditugaskan`, `diterima`, `serah_terima_pool`, `menunggu_validasi`; `menunggu_pickup` dimigrasikan ke `ditugaskan`. |
| `jobs` | Tambah `validated_by`, `validated_at`, `eta_is_estimated`; `uang_jalan_pagu` wajib > 0 untuk job baru. |
| `drivers` | Status In Job **diturunkan** dari job aktif (view/fungsi), tidak disimpan ganda. |
| `job_photos` | Tambah `stage`, `slot`, `sharpness_score`, `kualitas_rendah`, `taken_at`, `lat`, `lng`; unik (job_id, stage, slot). Data lama: `type` dipetakan ke `stage`, `slot` = null (arsip). |
| `uang_jalan_requests` (baru) | `job_id`, `nominal`, `catatan`, `status` (`diajukan`/`dicairkan`/`ditolak`), `requested_at`, `uang_jalan_id` (pencairan pemenuh). |
| `uang_jalan` | Tambah `bukti_transfer_path` (wajib untuk `pencairan` baru), `request_id`. |
| `driver_devices` (baru) | `driver_id`, `fcm_token`, `platform`, `last_seen_at`. |
| `notifications` (baru) | `recipient_type` (admin/driver), `recipient_id`, `kind`, `title`, `body`, `href`, `read_at`, `created_at`. |
| Fungsi/RPC | `driver_update_job_status` menegakkan Sequence Lock & kelengkapan slot; `driver_request_uang_jalan`; `admin_validate_job`; `admin_return_job`; `sync_unit_status_with_job` mengikuti status baru; `driver_submit_pod` dinonaktifkan. |
| Storage | Bucket baru/prefix untuk bukti transfer (akses admin saja). |

---

## 9. Non-Functional Requirements

- **Penegakan di database**: semua kunci (BR-01, BR-02, BR-06) ditegakkan oleh fungsi/constraint Postgres, bukan hanya UI.
- **Keamanan**: bukti transfer hanya dapat dibaca admin; foto driver hanya oleh admin dan driver pemilik job; endpoint publik tidak mengirim catatan internal dan uang jalan.
- **Offline-tolerant** untuk aplikasi driver (antrean unggah).
- **Ukuran foto**: dikompresi di perangkat ke ≤ 1,5 MB / sisi panjang 1920 px sebelum unggah; stempel diterapkan sebelum kompresi.
- **Bahasa**: seluruh teks antarmuka Bahasa Indonesia.

---

## 10. Di Luar Lingkup v2

- Role Finance terpisah dan pembuatan Faktur Pajak di dalam sistem.
- Akun untuk Mandor.
- Aplikasi iOS (menyusul setelah Android stabil).
- OCR surat timbang.
- Perubahan apa pun pada modul Penawaran.

---

## 11. Pertanyaan Terbuka

1. Firebase project untuk FCM — dibuat oleh siapa dan dengan akun mana.
2. Foto surat timbang: satu foto cukup, atau perlu beberapa halaman.
3. Apakah admin boleh mencairkan uang jalan **tanpa** pengajuan dari driver (mis. transfer di muka).
4. Batas waktu: apakah pengajuan yang tidak dicairkan dalam N jam perlu pengingat ke admin.

---

## 12. Kriteria Penerimaan (uji ujung-ke-ujung)

1. Membuat job tanpa uang jalan → ditolak. Dengan uang jalan → driver & unit berubah In Job/bertugas; driver itu hilang dari pilihan job berikutnya.
2. Driver menerima job → admin dapat notifikasi; mencoba lanjut ke muat → ditolak "menunggu bukti transfer".
3. Driver mengajukan uang jalan > sisa pagu → ditolak; ≤ sisa → tercatat, admin dapat notifikasi; admin mencairkan tanpa foto bukti → ditolak; dengan foto → driver dapat push, kunci terbuka.
4. Driver melengkapi 4 dari 5 slot loading → tombol lanjut nonaktif dan RPC menolak; slot ke-5 terisi → lanjut.
5. Foto buram → peringatan tampil; *Tetap gunakan* → terunggah dengan penanda kualitas rendah yang terlihat admin.
6. Driver menekan Selesaikan → status `menunggu_validasi`, driver masih In Job, job **belum** muncul di job belum ditagih.
7. Admin Approve → `selesai`, driver Stand By, unit standby, job muncul di job belum ditagih.
8. Halaman pelacakan publik tidak memuat `catatan` maupun nilai uang jalan.
