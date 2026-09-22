# Setup MAS-APP

Panduan setup awal aplikasi Manajemen Armada PT. Mitra Angkutan Sejati.

## Prasyarat

- Node.js 18+ dan npm
- Akun Supabase ([daftar gratis](https://supabase.com))
- Akun Vercel untuk deploy (opsional di tahap ini)

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

Copy `.env.local.example` jadi `.env.local`:

```bash
cp .env.local.example .env.local
```

Isi dengan kredensial Supabase Anda (dari **Settings → API**):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` adalah secret. Jangan commit ke git, jangan
> expose ke client. File `.env.local` sudah di-gitignore.

> ⚠️ File `.env` sempat ter-commit ke repositori (commit `d875c71`, `d53a1b6`,
> dan `c8e9a2d`). Sekarang sudah di-untrack, tapi isinya tetap ada di riwayat
> git — jadi **service role key, password TrackSolid, dan API key
> OpenRouteService yang ada di sana harus dirotasi** di dashboard
> masing-masing. Menghapus file dari commit terakhir tidak menghapusnya dari
> riwayat.

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

```bash
npm install
npm run dev
```

Buka <http://localhost:3000/login> dan login dengan admin user yang Anda buat.

## 6. (Opsional) Email SMTP untuk Reset Password

Untuk MVP, Supabase pakai SMTP bawaan dengan rate limit ketat. Untuk
production, configure custom SMTP di **Authentication → Email Templates →
SMTP Settings**.

## 7. Deploy ke Vercel

1. Push project ke GitHub repo (private)
2. Import repo di Vercel
3. Di **Project Settings → Environment Variables**, isi env yang sama dengan `.env.local`
4. Deploy

Vercel auto-deploy setiap push ke branch `main`.

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

**Customer page kosong / 404**
→ Pastikan migration 03 (RLS) sudah jalan dan share_token valid.

---

## Struktur Folder

```
app/
├── (admin)/           Halaman dengan auth gating
├── (auth)/            Login & reset password
├── track/[token]/     Public customer tracking
└── not-found.tsx      404

components/
├── ui/                Design system base components
├── layout/            Sidebar, top bar, mobile header, FAB
├── dashboard/         Stat card, unit card
├── units/             Unit-specific components
├── drivers/, customers/, jobs/

lib/
├── supabase/          Client / server / middleware setup
├── types/             Database typings
├── queries/           Server-side reads
├── actions/           Server actions (mutations)
└── utils.ts           Formatters & helpers

supabase/migrations/   SQL files (jalankan di Supabase SQL Editor)
```

---

## PRD Reference

Lihat `PRD-Aplikasi-Manajemen-Armada.md` untuk spec lengkap (21 screens,
brand identity, security, deployment).
