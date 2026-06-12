# Template Alur Order Transport — Admin / PIC Trucking

Template kerja untuk **admin dan PIC PT. Mitra Angkutan Sejati** dalam memproses order angkutan dari customer. Empat tahap berurutan: terima order → tentukan rute → konfirmasi harga → input detail & assign kendaraan.

---

## Ringkasan Alur

```
┌───────────────────────┐     ┌───────────────────────┐     ┌───────────────────────┐     ┌────────────────────────────┐
│ 1. TERIMA ORDER       │ ──▶ │ 2. INPUT RUTE         │ ──▶ │ 3. KONFIRMASI HARGA   │ ──▶ │ 4. DETAIL CUSTOMER         │
│    dari customer      │     │    (lokasi A → B)     │     │    (admin / PIC)      │     │    + ASSIGN KENDARAAN      │
│                       │     │                       │     │                       │     │                            │
│ Aktor: Customer       │     │ Aktor: Customer +     │     │ Aktor: Admin / PIC    │     │ Aktor: Admin (data legal)  │
│ Kanal: WA / telepon / │     │        Admin          │     │ Output: harga sepakat │     │        + PIC (kendaraan)   │
│        email          │     │                       │     │                       │     │ Output: order siap jalan   │
└───────────────────────┘     └───────────────────────┘     └───────────────────────┘     └────────────────────────────┘
                                                                       │
                                                                  TIDAK SEPAKAT
                                                                       │
                                                                       ▼
                                                              ┌─────────────────┐
                                                              │ Order dibatal / │
                                                              │ negosiasi ulang │
                                                              └─────────────────┘
```

---

## STEP 1 — Terima Order dari Customer

**Tujuan:** mencatat permintaan awal customer sebelum masuk ke sistem.

**Aktor:** Admin yang menerima telepon / WA / email dari customer.

**Field yang dicatat (manual / draft order):**

| Field                         | Wajib | Catatan                                             |
|-------------------------------|-------|-----------------------------------------------------|
| Tanggal & jam order masuk     | ✅    | otomatis dari sistem                                |
| Nama customer (perorangan/PT) | ✅    | nama orang atau nama perusahaan                     |
| Nama PIC customer             | ✅    | siapa yang menghubungi                              |
| No HP / WA PIC                | ✅    | minimal 1 nomor aktif                               |
| Sumber order                  | ⬜    | WA / telepon / email / referral / repeat customer   |
| Jenis muatan                  | ✅    | alat berat / lainnya — deskripsi singkat            |
| Estimasi tonase / dimensi     | ⬜    | jika sudah diketahui                                |
| Rencana tanggal muat          | ✅    | target tanggal pickup                               |

**Hasil step 1:** *draft order* dengan status `BARU`. Belum perlu input data legalitas.

---

## STEP 2 — Input Rute (Lokasi A → Lokasi B)

**Tujuan:** menetapkan rute pengangkutan supaya bisa dihitung biaya.

**Aktor:** Admin (dibantu klarifikasi ke customer kalau perlu).

**Field rute:**

| Field                             | Wajib | Catatan                                            |
|-----------------------------------|-------|----------------------------------------------------|
| Lokasi muat (A) — alamat lengkap  | ✅    | provinsi, kota, kecamatan, alamat detail           |
| Lokasi muat (A) — titik koordinat | ⬜    | pin di map kalau alamat tidak jelas                |
| PIC di lokasi muat                | ⬜    | nama + no HP penerima di lokasi A                  |
| Lokasi bongkar (B) — alamat       | ✅    | provinsi, kota, kecamatan, alamat detail           |
| Lokasi bongkar (B) — koordinat    | ⬜    | pin di map                                         |
| PIC di lokasi bongkar             | ⬜    | nama + no HP penerima di lokasi B                  |
| Estimasi jarak (km)               | ⬜    | dari kalkulasi map / pengalaman                    |
| Estimasi durasi perjalanan        | ⬜    | jam / hari                                         |
| Catatan rute                      | ⬜    | jalan rusak, jembatan timbang, izin khusus, dll    |

**Hasil step 2:** rute jelas, draft order siap masuk perhitungan harga.

---

## STEP 3 — Konfirmasi Harga oleh Admin / PIC Trucking

**Tujuan:** menetapkan harga angkut yang disepakati kedua pihak.

**Aktor:** Admin / PIC perusahaan trucking (yang berwenang menentukan tarif).

**Komponen perhitungan harga:**

| Komponen                          | Catatan                                              |
|-----------------------------------|------------------------------------------------------|
| Tarif dasar rute                  | berdasarkan jarak / pengalaman rute serupa           |
| Biaya tol & retribusi             | jika dibebankan ke customer                          |
| Biaya kawal / pengawalan          | jika muatan butuh patwal / kawal                     |
| Biaya bongkar muat                | jika di-handle perusahaan                            |
| Biaya menginap driver             | rute jauh / multi-day                                |
| PPN (jika applicable)             | tergantung status PKP customer                       |
| **Total harga penawaran**         | total dari komponen di atas                          |

**Proses:**

1. Admin hitung penawaran berdasarkan komponen di atas.
2. Sampaikan ke customer (WA / email penawaran).
3. Negosiasi → catat **harga sepakat** (boleh berbeda dari penawaran awal).
4. Customer setuju → lanjut Step 4. Tidak setuju → order ditandai `DIBATAL` atau diarsip untuk follow-up.

**Hasil step 3:** harga sepakat tercatat, status order `DEAL`.

---

## STEP 4 — Input Detail Customer + Assign Kendaraan

**Tujuan:** finalisasi data administrasi & operasional sebelum order naik jadi *job* aktif.

Step ini punya **dua bagian**: data customer (admin) + data kendaraan (PIC operasional).

### 4A. Data Customer & Legalitas — diisi Admin

| Field                            | Wajib | Catatan                                            |
|----------------------------------|-------|----------------------------------------------------|
| Nama perusahaan customer         | ✅    | nama sesuai akta / sesuai NPWP                     |
| Alamat perusahaan                | ✅    | sesuai NPWP / domisili                             |
| Nama PIC customer                | ✅    | yang berwenang teken / kontak utama                |
| Jabatan PIC                      | ⬜    | direktur / manager logistik / staff procurement    |
| No HP / WA PIC                   | ✅    |                                                    |
| Email PIC                        | ⬜    |                                                    |
| **Data legalitas perusahaan:**   |       |                                                    |
| – NPWP (nomor)                   | ✅    | format 15-16 digit                                 |
| – Scan / foto NPWP               | ⬜    | upload file (pdf / jpg)                            |
| – NIB                            | ⬜    | jika tersedia                                      |
| – Status PKP                     | ⬜    | PKP / non-PKP (untuk perlakuan PPN)                |
| – Akta perusahaan                | ⬜    | upload jika diminta                                |
| **Harga sepakat (dari Step 3)**  | ✅    | otomatis ke-carry dari step sebelumnya             |
| Termin pembayaran                | ⬜    | cash / TOP 14 / TOP 30 / lainnya                   |
| Catatan invoice / billing        | ⬜    | nama untuk invoice kalau beda dari nama PT         |

### 4B. Assign Kendaraan — diisi PIC Operasional

| Field                                | Wajib | Catatan                                                  |
|--------------------------------------|-------|----------------------------------------------------------|
| Jenis kendaraan yang dipakai         | ✅    | lowbed / highbed / self loader / engkel — pilih sesuai muatan |
| TNKB unit yang di-assign             | ✅    | pilih dari daftar unit `standby` yang cocok jenisnya     |
| Nama & no HP driver                  | ✅    | dari master driver                                       |
| Tanggal & jam berangkat (rencana)    | ✅    |                                                          |
| Catatan operasional                  | ⬜    | izin masuk lokasi, jadwal khusus, dll                    |

**Validasi sebelum simpan:**

- ✅ Jenis kendaraan sesuai dengan muatan (mis. muatan alat berat berat → bukan engkel).
- ✅ TNKB yang dipilih statusnya `standby` (tidak sedang di-assign job lain di tanggal yang sama).
- ✅ Driver tidak sedang assigned ke job lain di tanggal yang sama.
- ✅ Semua field wajib (✅) terisi.
- ✅ Minimal NPWP customer terisi (scan boleh menyusul).

**Hasil step 4:** order naik jadi **Job aktif**, surat jalan bisa dicetak, tracking diaktifkan.

---

## Wireframe Form (Sketsa)

Saran layout kalau alur ini di-implement jadi screen di app (multi-step):

```
┌──────────────────────────────────────────────────────────────────────┐
│  Order Baru                                                          │
│  ● Step 1: Order ─── ● Step 2: Rute ─── ● Step 3: Harga ─── ● Step 4 │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [ konten step aktif — field-field dari tabel di atas ]              │
│                                                                      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  [ ← Kembali ]                                  [ Lanjut → ]         │
└──────────────────────────────────────────────────────────────────────┘
```

Di **Step 4** layout dipecah dua kolom: kiri = data customer + legalitas (admin), kanan = jenis kendaraan + TNKB (PIC ops).

---

## Status Order — Ringkasan Transisi

| Status       | Dipicu saat                                  |
|--------------|----------------------------------------------|
| `BARU`       | Step 1 selesai (draft order tersimpan)       |
| `RUTE_OK`    | Step 2 selesai                                |
| `PENAWARAN`  | Step 3: penawaran dikirim, menunggu customer |
| `DEAL`       | Step 3: harga sepakat                        |
| `DIBATAL`    | Customer tidak sepakat / cancel              |
| `JOB_AKTIF`  | Step 4 selesai → order naik ke modul Job     |

---

## Catatan Implementasi

- Step 1–3 bisa pakai form sederhana karena fokusnya pencatatan & negosiasi.
- Step 4 adalah yang paling kritis (data legal + assignment kendaraan) — perlu validasi ketat dan upload file untuk NPWP / scan dokumen.
- Master data yang dibutuhkan: **Customer** (dengan legalitas), **Unit** (dengan TNKB & jenis), **Driver**.
- Kalau customer sudah ada di master, Step 4A sebaiknya auto-fill dari pilih nama customer existing — tidak perlu input ulang NPWP.
