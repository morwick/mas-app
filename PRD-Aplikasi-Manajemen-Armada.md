# Product Requirements Document (PRD)
## Aplikasi Manajemen Armada & Customer Tracking
## PT. Mitra Angkutan Sejati

---

## 1. Informasi Dokumen

| | |
|---|---|
| **Perusahaan** | PT. Mitra Angkutan Sejati |
| **Produk** | Aplikasi Web Manajemen Armada Angkutan Alat Berat |
| **Versi** | 2.0 (Comprehensive) |
| **Tanggal** | 20 Mei 2026 |
| **Status** | Final Draft untuk pengembangan |
| **Industri** | Jasa Angkutan Alat Berat (Heavy Equipment Hauling) |
| **Brand Color** | Hijau #1C9600, Putih #FFFFFF |
| **Tech Stack** | Next.js + Supabase + Vercel |
| **Pendekatan** | Self-developed dengan bantuan AI coding tools |

---

## 2. Ringkasan Eksekutif

**PT. Mitra Angkutan Sejati** adalah penyedia jasa angkutan alat berat dengan armada lowbed, highbed, self loader, dan engkel. PRD ini mendefinisikan aplikasi web internal & customer-facing untuk mengelola status real-time setiap unit armada (Standby/Bertugas/Perbaikan), mencatat pengiriman (job), dan memberikan customer link tracking publik untuk memantau progres pengiriman alat berat mereka tanpa perlu login.

**Tujuan utama:**
1. Single source of truth status seluruh armada untuk operasional internal
2. Transparency tracking untuk customer (mengurangi pertanyaan tracking via WhatsApp)
3. Data historis & laporan utilisasi armada untuk analisa bisnis

**Stakeholder:**
- Admin/dispatcher kantor (internal, login required)
- Customer penyewa jasa (eksternal, view-only via share link)

---

## 3. Latar Belakang & Konteks Bisnis

### 3.1 Profil Bisnis
- Industri: jasa transportasi alat berat
- Customer: perusahaan konstruksi, kontraktor mining, perusahaan rental alat berat
- Skala armada: puluhan unit, dapat berkembang
- Jenis armada: lowbed, highbed, self loader, engkel (bisa ditambah jenis baru)
- GPS tracking eksisting: TrackSolid (Jimi IoT)

### 3.2 Pain Points Saat Ini
Operasional bergantung pada komunikasi manual (WhatsApp, telepon) untuk:
- Memantau status setiap unit
- Update progres pengiriman ke customer
- Mencari unit yang tersedia untuk job baru
- Membuat laporan utilisasi manual

Hal ini memakan waktu admin dan rentan miskomunikasi.

### 3.3 Peluang
Dengan aplikasi terpusat, admin dapat melihat status seluruh armada dalam satu layar, update sekali untuk semua pihak, dan memiliki data historis utilisasi untuk decision making.

---

## 4. Tujuan & Metrik Sukses

### 4.1 Tujuan Bisnis
- Mengurangi waktu admin untuk update status & menjawab pertanyaan tracking customer
- Meningkatkan kepercayaan customer melalui transparency
- Data terstruktur untuk evaluasi kinerja armada

### 4.2 Tujuan Produk (MVP)
- Single source of truth status armada
- Customer tracking yang mudah (no login)
- Laporan utilisasi & riwayat per customer

### 4.3 Indikator Sukses (KPI)
- 100% job baru tercatat di aplikasi dalam 1 bulan setelah deploy
- Minimal 70% customer menggunakan share link untuk tracking
- Laporan bulanan dihasilkan otomatis dari aplikasi
- Berkurangnya inbound tracking inquiry via WhatsApp ke admin

---

## 5. Persona Pengguna

### 5.1 Admin / Dispatcher
- **Profil:** Staff operasional perusahaan
- **Frekuensi:** Setiap hari, intensif (5-30 transaksi/hari)
- **Device:** Laptop di kantor + HP saat di luar
- **Tech-savvy:** Menengah (familiar dengan WhatsApp, Excel)
- **Pain points:** Bolak-balik update status via WhatsApp & telepon
- **Kebutuhan:**
  - Cepat update status unit & job
  - Tahu unit mana yang available
  - Generate share link untuk customer dengan mudah
  - Akses laporan untuk evaluasi

### 5.2 Customer
- **Profil:** PIC dari perusahaan customer, site coordinator, atau project manager
- **Frekuensi:** Per job (1-3 hari aktif)
- **Device:** HP (95%), kadang laptop
- **Tech-savvy:** Bervariasi (low to medium)
- **Pain points:** Tidak tahu progres pengiriman, harus tanya admin
- **Kebutuhan:**
  - Tahu status pengiriman tanpa harus tanya admin
  - Lihat ETA & lokasi real-time
  - Kontak driver kalau ada urusan di site

---

## 6. Lingkup Produk

### 6.1 In-Scope (MVP)

**Modul Admin (login required):**
- Login & logout
- CRUD master data: Unit, Driver, Customer, Jenis Unit
- Create & manage Job (pengiriman)
- Update status Unit & Job
- Upload foto loading & unloading
- Generate & manage customer share link
- Laporan utilisasi armada & riwayat per customer
- Riwayat perubahan status per unit (audit trail)

**Modul Customer (no login, akses via share link):**
- Lihat status job real-time
- Progress stepper (Menunggu Pickup → Loading → Dalam Perjalanan → Unloading → Selesai)
- Lihat lokasi GPS real-time (embed/link TrackSolid)
- Info unit (kode unit, jenis, no polisi)
- Detail pengiriman (alat yang diangkut, asal, tujuan, ETA)
- Info driver (nama, no HP) dengan tombol WhatsApp
- Foto loading & unloading (kalau sudah ada)

### 6.2 Out-of-Scope (Future Phase)
- Aplikasi mobile native (iOS/Android)
- Multiple admin roles dengan permission granular
- Modul invoicing/billing/quotation
- Modul untuk driver (input dari lapangan via app khusus)
- Notifikasi push/email otomatis ke customer
- Integrasi penuh TrackSolid via API
- Dashboard analytics advanced (BI tools)
- Multi-language
- Mobile app native
- API publik untuk integrasi dengan customer
- E-signature untuk dokumen
- GPS-based geofencing alerts

---

## 7. User Stories & Critical User Flows

### 7.1 User Stories Utama

**Sebagai admin:**
- US-01: Saya ingin login ke aplikasi supaya akses data terlindungi
- US-02: Saya ingin melihat semua unit dengan statusnya saat ini supaya bisa cepat assign job baru
- US-03: Saya ingin membuat job baru dengan mengisi form, supaya datanya tercatat & otomatis generate share link customer
- US-04: Saya ingin update status job (loading → perjalanan → selesai) supaya customer juga melihat update tersebut
- US-05: Saya ingin upload foto loading & unloading supaya ada dokumentasi bukti
- US-06: Saya ingin set status unit ke Perbaikan supaya tidak terpilih untuk job baru
- US-07: Saya ingin melihat laporan utilisasi armada bulanan supaya tahu unit mana yang produktif/idle
- US-08: Saya ingin melihat riwayat job per customer supaya bisa evaluasi kerjasama

**Sebagai customer:**
- US-09: Saya ingin buka share link & langsung lihat status pengiriman alat saya tanpa login
- US-10: Saya ingin tahu lokasi real-time unit yang membawa alat saya
- US-11: Saya ingin lihat foto loading/unloading sebagai bukti penanganan
- US-12: Saya ingin kontak driver langsung kalau perlu koordinasi di site

### 7.2 Critical User Flow: Create Job & Send Tracking Link

```
1. Admin login → masuk Dashboard
2. Klik "Job Baru" → terbuka Form Job Baru
3. Admin pilih Customer (atau tambah baru)
4. Admin isi PIC, alat diangkut, asal, tujuan
5. Admin pilih Unit (dropdown filter status Standby)
6. Admin pilih Driver
7. Admin isi ETD & ETA
8. Admin buka TrackSolid di tab lain → copy share link → paste ke form
9. Admin klik "Simpan Job"
10. Sistem: generate Job ID, share token; ubah status unit ke Bertugas
11. Sistem tampilkan Halaman Konfirmasi dengan:
    - Job ID
    - Tombol "Copy Share Link"
    - Tombol "Copy Link untuk WhatsApp" (dengan teks template)
    - QR code untuk share offline
12. Admin copy link → kirim ke customer via WhatsApp
13. Customer buka link → lihat tracking page
```

### 7.3 Critical User Flow: Update Status Job

```
1. Admin di Dashboard → klik unit yang lagi Bertugas (atau cari di Daftar Job)
2. Buka Detail Job
3. Klik tombol "Update Status" → muncul opsi sesuai status saat ini
4. Pilih status berikutnya (misal: dari "Loading" → "Dalam Perjalanan")
5. Sistem: log perubahan; customer langsung lihat update di tracking page
6. Saat status "Loading" → admin bisa upload foto loading
7. Saat status "Unloading" → admin bisa upload foto unloading
8. Saat status "Selesai":
   - Status unit otomatis kembali ke Standby
   - Share link tetap aktif 24 jam untuk customer
   - Setelah 24 jam, link expired (tampil halaman expired)
```

---

## 8. Functional Requirements

### 8.1 Autentikasi (FR-AUTH)
| ID | Requirement |
|---|---|
| FR-AUTH-01 | Login admin dengan email & password |
| FR-AUTH-02 | Halaman tracking customer TIDAK memerlukan login - akses via share link unik |
| FR-AUTH-03 | Session admin expired setelah 8 jam idle |
| FR-AUTH-04 | Admin dapat reset password via email |
| FR-AUTH-05 | Admin dapat update profile (nama, password baru) |
| FR-AUTH-06 | Maximum 3 admin user untuk MVP (bisa ditambah belakangan) |
| FR-AUTH-07 | Setelah login berhasil, redirect ke /dashboard |
| FR-AUTH-08 | Logout menghapus session dan redirect ke /login |

### 8.2 Manajemen Unit (FR-UNIT)
| ID | Requirement |
|---|---|
| FR-UNIT-01 | Admin dapat menambah unit dengan field: kode unit, jenis, no polisi, tahun, catatan |
| FR-UNIT-02 | Kode unit harus unik di seluruh sistem (validasi saat input) |
| FR-UNIT-03 | Admin dapat edit & nonaktifkan unit (soft delete via is_active=false) |
| FR-UNIT-04 | Jenis unit dapat ditambah/diubah dinamis (master data terpisah) |
| FR-UNIT-05 | Status unit: Standby / Bertugas / Perbaikan |
| FR-UNIT-06 | Saat unit di-assign ke job aktif, status otomatis berubah Bertugas |
| FR-UNIT-07 | Saat job selesai, status unit otomatis kembali Standby (kecuali admin override ke Perbaikan) |
| FR-UNIT-08 | Admin dapat ubah status manual (misal Standby → Perbaikan) dengan input alasan |
| FR-UNIT-09 | Setiap perubahan status unit auto-log ke unit_status_history |
| FR-UNIT-10 | Daftar unit dapat di-filter by status & jenis, di-search by kode unit/no polisi |

### 8.3 Manajemen Driver (FR-DRIVER)
| ID | Requirement |
|---|---|
| FR-DRIVER-01 | Admin dapat menambah driver: nama, no HP, alamat (opsional), no SIM (opsional), catatan |
| FR-DRIVER-02 | Admin dapat edit & nonaktifkan driver |
| FR-DRIVER-03 | Driver dapat di-assign ke job |
| FR-DRIVER-04 | Daftar driver dapat di-search & filter by status aktif |

### 8.4 Manajemen Customer (FR-CUST)
| ID | Requirement |
|---|---|
| FR-CUST-01 | Admin dapat menambah customer: nama perusahaan, alamat, catatan |
| FR-CUST-02 | Admin dapat edit & nonaktifkan customer |
| FR-CUST-03 | Dari Form Job Baru, admin dapat tambah customer baru inline tanpa pindah halaman |

### 8.5 Manajemen Job / Pengiriman (FR-JOB)

#### Field Input Job Baru (FR-JOB-01)

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| Customer | dropdown | ✓ | Pilih dari master, atau "+ Tambah baru" inline |
| PIC di lapangan | text | - | Per-job, bisa berbeda dari customer master |
| No HP PIC | text | - | Format: 08xxxxxxxxxx atau +628xxxxxxxxxx |
| Alat yang diangkut | text | ✓ | Contoh: "Excavator Komatsu PC200" |
| Lokasi asal | textarea | ✓ | Alamat lengkap titik pickup |
| Lokasi tujuan | textarea | ✓ | Alamat lengkap titik drop |
| Unit | dropdown | ✓ | Otomatis filter hanya unit status Standby |
| Driver | dropdown | ✓ | Dari driver aktif |
| Tanggal & jam pickup (ETD) | datetime | ✓ | - |
| Estimasi sampai (ETA) | datetime | - | - |
| TrackSolid share link | URL | - | Bisa diisi belakangan |
| Catatan | textarea | - | Internal note |

#### Behavior & Business Rules

| ID | Requirement |
|---|---|
| FR-JOB-02 | Sistem otomatis generate Job ID format `JOB-YYYY-NNN` (NNN = sequential per tahun) |
| FR-JOB-03 | Sistem otomatis generate share_token (32 karakter random, base64-safe) |
| FR-JOB-04 | Status job: Menunggu Pickup → Loading → Dalam Perjalanan → Unloading → Selesai → (Cancelled) |
| FR-JOB-05 | Setiap perubahan status auto-log timestamp & user yang melakukan |
| FR-JOB-06 | Admin dapat edit detail job kapan saja |
| FR-JOB-07 | Admin dapat cancel job dengan alasan (status → Cancelled, unit kembali Standby) |
| FR-JOB-08 | Saat unit di-assign, status unit otomatis Bertugas (database trigger) |
| FR-JOB-09 | Halaman konfirmasi setelah simpan job: Job ID, tombol Copy Share Link, tombol Copy WhatsApp (dengan template message), QR code |
| FR-JOB-10 | Validasi inline: field wajib harus diisi sebelum tombol "Simpan Job" aktif |
| FR-JOB-11 | Helper text TrackSolid: instruksi cara dapat share link |
| FR-JOB-12 | Daftar job dapat di-filter: Status (active/done/cancelled), Customer, Tanggal range |
| FR-JOB-13 | Daftar job default urutan: terbaru di atas, dengan job aktif (non-selesai) prioritas |

### 8.6 Halaman Tracking Customer (FR-TRACK)
| ID | Requirement |
|---|---|
| FR-TRACK-01 | Akses publik via share link `/track/{token}` tanpa login |
| FR-TRACK-02 | Tampilkan: nomor job, status, progress stepper 5 tahap |
| FR-TRACK-03 | Tampilkan kode unit, jenis, no polisi |
| FR-TRACK-04 | Tampilkan alat diangkut, asal, tujuan, ETA |
| FR-TRACK-05 | Tampilkan info driver (nama, no HP) dengan WhatsApp click-to-chat |
| FR-TRACK-06 | Embed peta lokasi via iframe TrackSolid; jika diblokir, fallback tombol link-out |
| FR-TRACK-07 | Tampilkan foto loading & unloading (klik untuk lightbox full size) |
| FR-TRACK-08 | Share link auto-expire 24 jam setelah job Selesai → halaman expired |
| FR-TRACK-09 | Fully responsive mobile-first |
| FR-TRACK-10 | Halaman tracking tidak boleh expose data sensitif (no API key, no internal note) |
| FR-TRACK-11 | Polling/realtime: refresh status setiap 30 detik (atau Supabase realtime subscribe) |

### 8.7 Integrasi TrackSolid (FR-GPS)
| ID | Requirement |
|---|---|
| FR-GPS-01 | Job punya field `tracksolid_share_link` di-input manual oleh admin |
| FR-GPS-02 | Customer page coba embed iframe; jika diblokir (X-Frame-Options), fallback link-out |
| FR-GPS-03 | [Future] Integrasi API langsung ke TrackSolid Open Platform |

### 8.8 Dokumentasi Foto (FR-PHOTO)
| ID | Requirement |
|---|---|
| FR-PHOTO-01 | Admin upload foto loading (max 5 foto per job) |
| FR-PHOTO-02 | Admin upload foto unloading (max 5 foto per job) |
| FR-PHOTO-03 | Foto disimpan di Supabase Storage bucket `job-photos` |
| FR-PHOTO-04 | Resize client-side max 1920px lebar, kualitas JPEG 85% sebelum upload |
| FR-PHOTO-05 | Customer lihat thumbnail; tap untuk lightbox full-size |
| FR-PHOTO-06 | Admin dapat hapus foto yang salah upload |
| FR-PHOTO-07 | Foto otomatis terhapus dari storage saat job dihapus (cascade) |

### 8.9 Laporan (FR-REPORT)
| ID | Requirement |
|---|---|
| FR-REPORT-01 | Laporan Utilisasi Armada per periode: hari Bertugas, hari Standby, hari Perbaikan, % utilisasi per unit |
| FR-REPORT-02 | Filter periode: bulan ini, bulan lalu, custom range |
| FR-REPORT-03 | Laporan Riwayat per Customer: daftar job, tanggal, alat, unit, driver, status akhir |
| FR-REPORT-04 | Export laporan ke Excel/CSV |
| FR-REPORT-05 | Tampilan laporan punya visualisasi chart sederhana (bar chart utilisasi) |

### 8.10 Riwayat & Audit Log (FR-LOG)
| ID | Requirement |
|---|---|
| FR-LOG-01 | Setiap perubahan status unit & job otomatis tercatat (auto-log via DB trigger) |
| FR-LOG-02 | Admin dapat lihat riwayat per unit (timeline status) |
| FR-LOG-03 | Admin dapat lihat timeline perubahan status per job |
| FR-LOG-04 | Audit log menyimpan: timestamp, user_id, status_old, status_new, reason (jika ada) |

---

## 9. Non-Functional Requirements

### 9.1 Performance
- Initial page load < 3 detik di koneksi 4G normal
- Update status job propagasi ke customer dalam < 10 detik (atau lebih cepat via realtime)
- Page transition < 500ms (client-side routing)
- Image upload progress indicator

### 9.2 Responsiveness
Mobile-first, breakpoints:
- Mobile: 320px - 767px (prioritas utama)
- Tablet: 768px - 1023px
- Desktop: 1024px+

### 9.3 Browser Support
- Chrome, Safari, Firefox, Edge versi 2 tahun terakhir
- iOS Safari & Android Chrome versi 2 tahun terakhir
- No IE support

### 9.4 Security
- HTTPS only (enforced via Vercel)
- Password admin di-hash via Supabase Auth (bcrypt)
- Share token: 32-char random base64-url-safe
- Rate limiting endpoint publik
- RLS policies di database untuk semua tabel
- Tidak ada data sensitif di client-side bundle

### 9.5 Bahasa
Bahasa Indonesia (default & satu-satunya untuk MVP)

### 9.6 Hosting & Availability
- Target uptime: 99% (best effort)
- Vercel + Supabase keduanya punya CDN/HA bawaan

### 9.7 Compliance
- Tidak ada compliance khusus (bukan industri healthcare/finance)
- Standar best-practice keamanan web (OWASP awareness)

---

## 10. UI/UX Specifications

### 10.1 Brand Identity

**Logo:** "MAS" (singkatan dari Mitra Angkutan Sejati) - sementara text-based, nanti diganti logo file kalau sudah ada.

**Warna Brand:**
| Token | Hex | Penggunaan |
|---|---|---|
| `brand-primary` | #1C9600 | Logo, tombol utama, status aktif/positif, accent |
| `brand-primary-light` | #E8F7E0 | Background badge, hover state, info banner |
| `brand-primary-dark` | #145B00 | Text pada background hijau muda |
| `bg-default` | #FFFFFF | Background utama |
| `bg-page` | #F5F5F0 | Background di luar card (page-level) |
| `bg-card` | #FFFFFF | Background card/surface |

**Warna Status (Semantik):**
| Status | Background | Text |
|---|---|---|
| Standby | #F1EFE8 (light gray) | #5F5E5A (gray) |
| Bertugas | #E8F7E0 (light green) | #145B00 (dark green) |
| Perbaikan | #FAEEDA (light amber) | #854F0B (dark amber) |
| Cancelled | #FCEBEB (light red) | #791F1F (dark red) |

**Tipografi:**
- Font family: System default (Inter via Tailwind, fallback ke -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)
- Heading H1: 22px / weight 500
- Heading H2: 18px / weight 500
- Heading H3: 16px / weight 500
- Body: 14-16px / weight 400
- Caption: 11-12px / weight 400
- Line-height body: 1.5-1.7

**Style Conventions:**
- Sentence case (no Title Case, no ALL CAPS untuk text)
- ALL CAPS hanya untuk section header kecil (letter-spacing 0.3-0.5px)
- Flat design - tidak ada gradient, shadow berlebihan, blur

### 10.2 Design System (Tokens)

**Spacing Scale:**
| Token | Pixel | Penggunaan |
|---|---|---|
| `space-1` | 4px | Inline icon-text gap |
| `space-2` | 8px | Small gap, between bullets |
| `space-3` | 12px | Default card gap |
| `space-4` | 16px | Section padding |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Page-level spacing |

**Border Radius:**
| Token | Pixel | Penggunaan |
|---|---|---|
| `radius-sm` | 4px | Small badges |
| `radius-md` | 8px | Buttons, inputs, badges |
| `radius-lg` | 12px | Cards |
| `radius-full` | 9999px | Pill badges, avatars |

**Borders:**
- Default: `0.5px solid rgba(0,0,0,0.15)` (subtle)
- Hover: `0.5px solid rgba(0,0,0,0.3)`
- Focus: `2px solid #1C9600`

**Shadow (digunakan sangat minimal):**
- None untuk MVP (flat design)
- Focus ring: `0 0 0 3px rgba(28, 150, 0, 0.2)`

### 10.3 Component Library

**Buttons:**
| Variant | Background | Text | Border | Penggunaan |
|---|---|---|---|---|
| Primary | #1C9600 | white | none | Aksi utama (Simpan, Login, Submit) |
| Secondary | transparent | text-primary | 0.5px solid border-secondary | Aksi sekunder (Batal, Edit) |
| Danger | #E24B4A | white | none | Hapus, Cancel job |
| Ghost | transparent | brand-primary | none | Link-like buttons |

Button states: default, hover (slight bg darken), active (scale 0.98), disabled (opacity 0.5).
Button sizes: small (h-32px, text-12px), default (h-40px, text-14px), large (h-48px, text-16px).

**Inputs:**
- Height: 40px default
- Padding: 8px 12px
- Border: 0.5px solid (default), 2px solid brand (focus)
- Border-radius: 8px
- Font-size: 14px
- Disabled: opacity 0.5, background #F5F5F0
- Error state: border merah, text error di bawah

**Badges (Status):**
- Padding: 4px 10px
- Border-radius: 12px (pill)
- Font-size: 10-11px
- Font-weight: 500
- Letter-spacing: 0.3px

**Cards:**
- Background: #FFFFFF
- Border: 0.5px solid rgba(0,0,0,0.15)
- Border-radius: 12px
- Padding: 14-16px

**Modals:**
- Overlay: rgba(0,0,0,0.45)
- Container: white, border-radius 12px, max-width 500px
- Padding: 24px

**Toasts:**
- Position: top-center (mobile), top-right (desktop)
- Auto-dismiss: 3 detik
- Variants: success (hijau), error (merah), info (biru), warning (amber)

**Icons:**
- Icon library: Tabler Icons (outline)
- Default size: 16-20px inline, 24px decorative
- Color: inherit parent text color

### 10.4 Layout & Responsive

**Mobile Layout (< 768px):**
- Top header (sticky): logo + judul halaman + bell/menu
- Main content area: scrollable
- Bottom nav (sticky): 5 menu utama (Dashboard, Unit, Job, Driver, Laporan)
- FAB (Floating Action Button) untuk aksi utama (misal: Job Baru)

**Desktop Layout (>= 1024px):**
- Sidebar kiri (sticky, 240px width): logo + menu vertikal
- Top bar (sticky, 56px height): breadcrumb + user menu
- Main content area: max-width 1200px, padding 32px
- No bottom nav (sudah ada sidebar)

**Tablet (768px - 1023px):**
- Collapsible sidebar (default collapsed jadi ikon-only)
- Atau full layout dengan sidebar lebih sempit

### 10.5 Navigation Structure

**Main Navigation (Admin):**
1. Dashboard (default page setelah login)
2. Unit (master data unit + history)
3. Job (daftar aktif + selesai)
4. Driver (master data driver)
5. Customer (master data customer)
6. Laporan (utilisasi + riwayat)
7. Pengaturan (profile, jenis unit, logout)

**Secondary Navigation:**
- Breadcrumb di top bar (desktop)
- Back button di top header (mobile)

### 10.6 Screen Inventory & Specifications

Total screens MVP: **21 halaman**

#### S-01: Login Admin (`/login`)
- **Tujuan:** Authenticate admin
- **User:** Admin
- **Components:**
  - Logo MAS (besar, centered)
  - Card form (max 400px)
    - Input email
    - Input password (with show/hide toggle)
    - Link "Lupa password?"
    - Tombol "Masuk" (primary, full-width)
- **States:**
  - Default
  - Loading (saat submit)
  - Error (email/password salah)
- **Interaksi:**
  - Submit on Enter
  - Validasi format email
  - Redirect ke /dashboard saat sukses

#### S-02: Reset Password (`/reset-password`)
- **Tujuan:** Admin reset password lewat email
- **Components:** Form email → kirim link reset → form password baru

#### S-03: Admin Dashboard (`/dashboard`) ✓ Mockup tersedia
- **Tujuan:** Overview status armada hari ini, aksi cepat
- **User:** Admin
- **Komponen utama:**
  - Header (logo MAS, user info, bell)
  - 3 stat cards: Standby / Bertugas / Perbaikan (count)
  - Filter chips: Semua, Standby, Bertugas, Perbaikan
  - List unit cards (terurut by urgency: bertugas → standby lama → perbaikan)
  - Action buttons: Job Baru (primary), Semua Job (secondary)
  - Bottom nav
- **Interaksi:**
  - Tap stat card → filter ke status itu
  - Tap unit card → buka detail unit
  - Tap "Job Baru" → buka Form Job Baru

#### S-04: Daftar Unit (`/units`)
- **Tujuan:** Master data unit, lihat semua unit termasuk yang non-aktif
- **Komponen:**
  - Search bar (cari kode/no polisi)
  - Filter dropdown: Jenis, Status
  - Tombol "+ Tambah Unit" (primary)
  - List unit dengan info lengkap (kode, jenis, no polisi, status, tahun)
  - Pagination atau infinite scroll
- **Interaksi:**
  - Tap unit → detail unit

#### S-05: Detail Unit (`/units/[id]`)
- **Tujuan:** Lihat detail unit + timeline status history
- **Komponen:**
  - Card info unit (kode, jenis, no polisi, tahun, catatan)
  - Status badge sekarang
  - Tombol "Edit" & "Ubah Status"
  - Tab/section: 
    - Tab 1: Job aktif (kalau lagi bertugas)
    - Tab 2: Riwayat job
    - Tab 3: Riwayat perubahan status (timeline)
  - Tombol "Nonaktifkan unit" (danger, jika is_active)

#### S-06: Form Tambah/Edit Unit (`/units/new`, `/units/[id]/edit`)
- **Komponen form:**
  - Kode unit (required, unique)
  - Jenis unit (dropdown, dengan opsi + tambah jenis baru)
  - No polisi (required)
  - Tahun (opsional, integer)
  - Status awal (default Standby, hanya untuk new)
  - Catatan (opsional)
  - Tombol Batal & Simpan

#### S-07: Modal Ubah Status Unit
- Triggered dari Detail Unit
- Pilihan status (radio): Standby / Bertugas / Perbaikan
- Field alasan (textarea, opsional)
- Tombol Batal & Konfirmasi

#### S-08: Daftar Driver (`/drivers`)
- Similar dengan Daftar Unit, lebih sederhana
- Search, filter aktif/nonaktif, tombol tambah

#### S-09: Form Tambah/Edit Driver (`/drivers/new`, `/drivers/[id]/edit`)
- Field: Nama (required), No HP (required), No SIM, Alamat, Catatan

#### S-10: Daftar Customer (`/customers`)
- Search, filter aktif/nonaktif, tombol tambah

#### S-11: Form Tambah/Edit Customer (`/customers/new`, `/customers/[id]/edit`)
- Field: Nama perusahaan (required), Alamat, Catatan

#### S-12: Daftar Job (`/jobs`)
- **Komponen:**
  - Tab: Aktif / Selesai / Cancelled
  - Search by job number / customer / alat
  - Filter: tanggal range, customer
  - Tombol "+ Job Baru" (primary)
  - List job cards dengan info utama (job number, customer, alat, status, ETA, unit, driver)
- **Empty state:** "Belum ada job. Buat job pertama Anda."

#### S-13: Form Job Baru (`/jobs/new`) ✓ Mockup tersedia
Sesuai mockup yang sudah dibuat. Field detail lihat FR-JOB-01.

#### S-14: Halaman Konfirmasi Setelah Simpan Job (`/jobs/[id]/confirmation`)
- **Tujuan:** Confirm job tersimpan, kasih admin share link siap copy
- **Komponen:**
  - Icon success besar
  - Heading: "Job berhasil dibuat"
  - Job ID dengan tombol copy
  - Card share link:
    - URL share link (text dengan tombol Copy)
    - Tombol "Copy + Template WhatsApp" (otomatis copy dengan format pesan template Indonesia)
    - QR code (untuk share offline)
  - Tombol "Lihat Detail Job" & "Buat Job Baru Lagi"
- **Template WhatsApp default:**
  ```
  Halo Pak/Bu [PIC],

  Berikut link tracking pengiriman [alat] dari PT. Mitra Angkutan Sejati:
  [URL]

  Anda bisa cek status & lokasi real-time melalui link tersebut. Driver: [nama driver] ([no HP]).

  Terima kasih.
  ```

#### S-15: Detail Job (`/jobs/[id]`)
- **Komponen:**
  - Card info job (number, customer, PIC)
  - Status badge besar + tombol "Update Status"
  - Progress stepper (sama seperti customer page)
  - Detail pengiriman (alat, asal, tujuan, ETD, ETA)
  - Card unit & driver
  - TrackSolid link (read-only, dengan tombol Edit untuk paste link baru)
  - Section foto loading & unloading (dengan tombol upload)
  - Share link untuk customer (tombol Copy + Lihat sebagai customer)
  - Audit log timeline (collapsible)
  - Tombol "Edit Job", "Cancel Job" (danger)

#### S-16: Modal Update Status Job
- Pilihan status berikutnya (sesuai workflow)
- Field opsional: alasan, catatan
- Tombol Batal & Konfirmasi

#### S-17: Modal Upload Foto
- Triggered dari Detail Job (saat status Loading/Unloading)
- Drag-drop area
- Preview foto sebelum upload
- Progress bar saat uploading
- Resize otomatis client-side sebelum upload
- Maximal 5 foto per type
- Tombol Hapus per foto

#### S-18: Laporan Utilisasi Armada (`/reports/utilisasi`)
- **Komponen:**
  - Filter periode (bulan ini / bulan lalu / custom)
  - Tombol Export Excel
  - Tabel utilisasi per unit:
    - Kode unit | Jenis | Hari Bertugas | Hari Standby | Hari Perbaikan | % Utilisasi
  - Bar chart visualisasi % utilisasi per unit
  - Summary card: rata-rata utilisasi armada periode tersebut

#### S-19: Laporan Riwayat Customer (`/reports/customers`)
- **Komponen:**
  - Filter customer (dropdown) atau "Semua customer"
  - Filter periode
  - Tombol Export Excel
  - Tabel job per customer:
    - Tanggal | Customer | Alat | Unit | Driver | Asal-Tujuan | Status

#### S-20: Customer Tracking Page (`/track/[token]`) ✓ Mockup tersedia
Sesuai mockup. Lihat FR-TRACK-* untuk detail.

#### S-21: Halaman Link Expired (`/track/[token]/expired`)
- **Komponen:**
  - Icon clock-off
  - Heading: "Link tracking sudah berakhir"
  - Pesan: "Pengiriman ini telah selesai. Untuk info lebih lanjut, hubungi PT. Mitra Angkutan Sejati."
  - Contact info (telepon, WhatsApp)

#### S-22: Halaman 404 / Not Found
- Standard 404 page dengan tombol kembali ke dashboard

### 10.7 Interaction Patterns

**Form Validation:**
- Real-time validation saat user blur field (kehilangan focus)
- Submit button disabled sampai semua required field valid
- Error message muncul di bawah field dengan icon merah
- Toast notification di submit success/error

**Confirmation Dialogs:**
Wajib untuk aksi destructive:
- Hapus unit/driver/customer/job
- Cancel job
- Logout (opsional)

Pattern:
- Modal dengan icon warning
- Title: "Yakin ingin [aksi]?"
- Body: konsekuensi aksi
- Buttons: Batal (secondary) & Ya, [aksi] (danger)

**Auto-save:**
- Tidak ada auto-save di MVP (semua eksplisit via tombol Simpan)
- Future: bisa pertimbangkan auto-save draft untuk form panjang

**Pagination:**
- Daftar > 50 item gunakan pagination (load 20 per page)
- Atau infinite scroll dengan "Load more"

**Search:**
- Debounce 300ms
- Search across multiple fields (kode unit + no polisi for units)
- Indicator loading saat searching

**Sorting:**
- Default sort sesuai konteks (terbaru di atas untuk job, alfabet untuk master data)
- Header tabel clickable untuk sort

### 10.8 States (Loading / Empty / Error)

**Loading State:**
- Page-level: skeleton screen (placeholder shapes)
- Inline: spinner kecil
- Button: tombol disabled + spinner di dalam

**Empty State:**
Untuk list yang kosong, tampilkan:
- Icon ilustratif
- Heading singkat ("Belum ada job")
- Penjelasan singkat
- Call-to-action button (kalau relevan)

Contoh: "Belum ada job. Buat job pertama untuk mulai melacak pengiriman."

**Error State:**
- Toast notification untuk error operasional (gagal save, gagal load)
- Inline error untuk validation
- Page-level error untuk fatal (database connection, etc) dengan tombol "Coba lagi"

**Offline State:**
- Banner "Anda offline. Beberapa fitur mungkin tidak berfungsi."
- Tetap memungkinkan view data yang sudah ter-cache (kalau pakai service worker, tapi tidak prioritas MVP)

---

## 11. Backend Architecture

### 11.1 Tech Stack Detail

**Frontend:**
- Next.js 14+ (App Router)
- React 18+
- TypeScript 5+
- Tailwind CSS 3+
- shadcn/ui (komponen pre-built berdasarkan Radix UI)
- @supabase/supabase-js (client SDK)
- @supabase/ssr (server-side rendering helper)
- @tanstack/react-query (server state management)
- react-hook-form + zod (form & validation)
- lucide-react atau tabler-icons-react (icons)
- date-fns (date formatting)

**Backend:**
- Supabase Cloud
  - PostgreSQL 15+
  - Supabase Auth (email/password)
  - Supabase Storage
  - Row Level Security (RLS)
  - Database Functions (PL/pgSQL)
  - Realtime (untuk live status update)

**Hosting & Deployment:**
- Vercel (Next.js)
  - Auto-deploy dari GitHub main branch
  - Preview deployment per PR
  - Environment variables di Vercel dashboard
- Supabase Cloud (database & backend)
  - Region: closest to Indonesia (Singapore atau Tokyo)
- Domain: custom (.com atau .id)

**Tooling:**
- Git + GitHub (version control)
- Supabase CLI (database migrations)
- Vercel CLI (deployment)
- VS Code + extensions
- Claude Code (AI-assisted development)

### 11.2 Database Schema (Detailed)

#### Table: `profiles`
Extension dari `auth.users` untuk admin profile.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nama TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- future: super_admin, admin, viewer
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### Table: `jenis_unit`
Master jenis unit (lowbed, highbed, dll).

```sql
CREATE TABLE jenis_unit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed data
INSERT INTO jenis_unit (nama) VALUES
  ('Lowbed'),
  ('Highbed'),
  ('Self Loader'),
  ('Engkel');
```

#### Table: `units`

```sql
CREATE TYPE unit_status AS ENUM ('standby', 'bertugas', 'perbaikan');

CREATE TABLE units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_unit TEXT NOT NULL UNIQUE,
  jenis_unit_id UUID NOT NULL REFERENCES jenis_unit(id),
  no_polisi TEXT NOT NULL,
  tahun INTEGER,
  status unit_status NOT NULL DEFAULT 'standby',
  catatan TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_units_status ON units(status) WHERE is_active = true;
CREATE INDEX idx_units_jenis ON units(jenis_unit_id);
CREATE INDEX idx_units_kode ON units(kode_unit);
```

#### Table: `unit_status_history`

```sql
CREATE TABLE unit_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  status_old unit_status,
  status_new unit_status NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT
);

CREATE INDEX idx_unit_history_unit ON unit_status_history(unit_id, changed_at DESC);
```

#### Table: `drivers`

```sql
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  no_hp TEXT NOT NULL,
  no_sim TEXT,
  alamat TEXT,
  catatan TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drivers_active ON drivers(is_active);
```

#### Table: `customers`

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_perusahaan TEXT NOT NULL,
  alamat TEXT,
  catatan TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_active ON customers(is_active);
```

#### Table: `jobs`

```sql
CREATE TYPE job_status AS ENUM (
  'menunggu_pickup',
  'loading',
  'dalam_perjalanan',
  'unloading',
  'selesai',
  'cancelled'
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number TEXT NOT NULL UNIQUE,
  share_token TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  pic_nama TEXT,
  pic_no_hp TEXT,
  alat_diangkut TEXT NOT NULL,
  asal TEXT NOT NULL,
  tujuan TEXT NOT NULL,
  unit_id UUID NOT NULL REFERENCES units(id),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  etd TIMESTAMPTZ NOT NULL,
  eta TIMESTAMPTZ,
  tracksolid_share_link TEXT,
  status job_status NOT NULL DEFAULT 'menunggu_pickup',
  catatan TEXT,
  cancelled_reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_customer ON jobs(customer_id, created_at DESC);
CREATE INDEX idx_jobs_unit ON jobs(unit_id);
CREATE INDEX idx_jobs_share_token ON jobs(share_token);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
```

#### Table: `job_status_history`

```sql
CREATE TABLE job_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status_old job_status,
  status_new job_status NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_job_history_job ON job_status_history(job_id, changed_at DESC);
```

#### Table: `job_photos`

```sql
CREATE TYPE photo_type AS ENUM ('loading', 'unloading');

CREATE TABLE job_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type photo_type NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_job_photos_job ON job_photos(job_id, type);
```

### 11.3 Row Level Security (RLS) Policies

Semua tabel di-enable RLS. Berikut policy-nya:

#### Policy untuk `profiles`
```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Admin bisa baca profile-nya sendiri
CREATE POLICY "users_read_own_profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Admin bisa update profile-nya sendiri
CREATE POLICY "users_update_own_profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

#### Policy untuk `units`, `drivers`, `customers`, `jenis_unit`
Pattern sama: hanya admin (authenticated user dengan profile aktif) yang bisa CRUD.

```sql
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_units"
  ON units FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_active = true
    )
  );
```

(Apply pattern serupa untuk drivers, customers, jenis_unit.)

#### Policy untuk `jobs` - DUA layer
1. Admin bisa CRUD semua jobs
2. Public bisa SELECT job by share_token

```sql
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Admin akses penuh
CREATE POLICY "admin_all_jobs"
  ON jobs FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_active = true
    )
  );

-- Public bisa baca job by share_token (dengan filter expire)
CREATE POLICY "public_read_by_token"
  ON jobs FOR SELECT
  USING (
    auth.uid() IS NULL AND -- akses tanpa login
    share_token IS NOT NULL AND
    (
      status != 'selesai' OR
      completed_at > (now() - interval '24 hours')
    ) AND
    status != 'cancelled'
  );
```

#### Policy untuk `job_status_history`, `unit_status_history`
Read-only untuk admin, insert via trigger (system).

```sql
ALTER TABLE job_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_job_history"
  ON job_status_history FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_active = true)
  );
```

#### Policy untuk `job_photos`
- Admin bisa CRUD
- Public bisa SELECT foto via job_id yang terkait dengan share_token aktif

```sql
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_photos"
  ON job_photos FOR ALL
  USING (
    auth.uid() IS NOT NULL AND
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_active = true)
  );

CREATE POLICY "public_read_photos_via_token"
  ON job_photos FOR SELECT
  USING (
    auth.uid() IS NULL AND
    EXISTS (
      SELECT 1 FROM jobs
      WHERE jobs.id = job_photos.job_id
        AND jobs.share_token IS NOT NULL
        AND (jobs.status != 'selesai' OR jobs.completed_at > (now() - interval '24 hours'))
        AND jobs.status != 'cancelled'
    )
  );
```

### 11.4 Database Functions & Triggers

#### Function: Generate Job Number

```sql
CREATE OR REPLACE FUNCTION gen_job_number()
RETURNS TEXT AS $$
DECLARE
  v_year TEXT;
  v_seq INTEGER;
  v_number TEXT;
BEGIN
  v_year := to_char(now(), 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SPLIT_PART(job_number, '-', 3) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM jobs
  WHERE job_number LIKE 'JOB-' || v_year || '-%';
  
  v_number := 'JOB-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;
```

#### Function: Generate Share Token

```sql
CREATE OR REPLACE FUNCTION gen_share_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(24), 'base64');
END;
$$ LANGUAGE plpgsql;
```

#### Trigger: Auto-generate job_number & share_token on insert

```sql
CREATE OR REPLACE FUNCTION set_job_defaults()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.job_number IS NULL THEN
    NEW.job_number := gen_job_number();
  END IF;
  IF NEW.share_token IS NULL THEN
    NEW.share_token := gen_share_token();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_job_defaults
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_job_defaults();
```

#### Trigger: Log job status changes

```sql
CREATE OR REPLACE FUNCTION log_job_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO job_status_history (job_id, status_old, status_new, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
    
    -- Set completed_at if status = selesai
    IF NEW.status = 'selesai' AND OLD.status != 'selesai' THEN
      NEW.completed_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_job_status
  BEFORE UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION log_job_status_change();
```

#### Trigger: Auto-update unit status when job assigned/completed

```sql
CREATE OR REPLACE FUNCTION sync_unit_status_with_job()
RETURNS TRIGGER AS $$
BEGIN
  -- Job baru dibuat → unit jadi bertugas
  IF TG_OP = 'INSERT' AND NEW.status IN ('menunggu_pickup', 'loading', 'dalam_perjalanan', 'unloading') THEN
    UPDATE units SET status = 'bertugas', updated_at = now() WHERE id = NEW.unit_id;
  END IF;
  
  -- Job selesai atau cancelled → unit kembali standby
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status AND NEW.status IN ('selesai', 'cancelled') THEN
    UPDATE units SET status = 'standby', updated_at = now() WHERE id = NEW.unit_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_unit_status
  AFTER INSERT OR UPDATE ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION sync_unit_status_with_job();
```

#### Trigger: Log unit status changes

```sql
CREATE OR REPLACE FUNCTION log_unit_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO unit_status_history (unit_id, status_old, status_new, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_unit_status
  AFTER UPDATE OF status ON units
  FOR EACH ROW
  EXECUTE FUNCTION log_unit_status_change();
```

#### RPC Function: Get unit utilization report

```sql
CREATE OR REPLACE FUNCTION get_unit_utilization(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  unit_id UUID,
  kode_unit TEXT,
  jenis TEXT,
  hari_bertugas INTEGER,
  hari_standby INTEGER,
  hari_perbaikan INTEGER,
  persentase_utilisasi NUMERIC
)
LANGUAGE SQL
AS $$
  -- Implementation: hitung durasi per status dari unit_status_history
  -- (simplified, full implementation pakai date interval calculation)
  SELECT 
    u.id,
    u.kode_unit,
    j.nama,
    0::INTEGER as hari_bertugas, -- placeholder, implement actual calculation
    0::INTEGER as hari_standby,
    0::INTEGER as hari_perbaikan,
    0::NUMERIC as persentase_utilisasi
  FROM units u
  JOIN jenis_unit j ON j.id = u.jenis_unit_id
  WHERE u.is_active = true;
$$;
```

### 11.5 API Endpoints

Supabase otomatis generate REST API dari setiap tabel. URL pattern:
```
https://<project>.supabase.co/rest/v1/<table>
```

#### Authentication
- `POST /auth/v1/token?grant_type=password` - Login
- `POST /auth/v1/logout` - Logout
- `POST /auth/v1/recover` - Reset password

#### Units
- `GET /rest/v1/units?select=*&is_active=eq.true` - List active units
- `GET /rest/v1/units?id=eq.<id>` - Get one unit
- `POST /rest/v1/units` - Create unit
- `PATCH /rest/v1/units?id=eq.<id>` - Update unit
- `DELETE /rest/v1/units?id=eq.<id>` - Hard delete (rarely used, prefer is_active=false)

#### Jobs
- `GET /rest/v1/jobs?select=*,units(*),drivers(*),customers(*)&status=in.(menunggu_pickup,loading,dalam_perjalanan,unloading)` - Active jobs
- `GET /rest/v1/jobs?share_token=eq.<token>&select=*,units(*),drivers(*),customers(*),job_photos(*)` - Public tracking (RLS-protected)
- `POST /rest/v1/jobs` - Create job (triggers handle defaults & side effects)
- `PATCH /rest/v1/jobs?id=eq.<id>` - Update job (including status change)

#### Custom RPC
- `POST /rest/v1/rpc/get_unit_utilization` - Body: `{ "p_start_date": "...", "p_end_date": "..." }`

#### Storage
- `POST /storage/v1/object/job-photos/<job_id>/<type>/<filename>` - Upload foto
- `GET /storage/v1/object/public/job-photos/<path>` - Public URL (atau signed URL)

### 11.6 Authentication Flow

```
1. Admin buka /login
2. Enter email + password
3. Frontend → POST /auth/v1/token?grant_type=password
4. Supabase verify → return access_token (JWT) + refresh_token
5. Frontend simpan di httpOnly cookie (via @supabase/ssr)
6. Subsequent requests include token automatically
7. RLS policies check JWT untuk authorize

Saat session expire:
- Refresh token digunakan otomatis untuk get new access token
- Jika refresh token expired juga → redirect ke /login
```

### 11.7 File Storage Strategy

**Bucket:** `job-photos`
- Visibility: Private (akses via RLS policy)
- Folder structure: `{job_id}/{type}/{timestamp}-{random}.jpg`

**Contoh path:** `job-photos/a1b2c3d4-e5f6/loading/1716200000-x7y8z9.jpg`

**Upload flow:**
1. Client pilih file dari input
2. Client resize ke max 1920px, kualitas 85% (pakai library `browser-image-compression`)
3. Upload ke Supabase Storage via `supabase.storage.from('job-photos').upload(...)`
4. Setelah upload sukses, insert row ke `job_photos` table dengan file_path

**Access flow:**
- Admin: signed URL (1 jam validity)
- Customer (public): public URL atau signed URL via RLS

### 11.8 Security Considerations

| Aspek | Implementasi |
|---|---|
| Transport | HTTPS only (Vercel auto-SSL) |
| Password storage | Supabase Auth bcrypt |
| Session | JWT, httpOnly cookie, refresh token rotation |
| Share token | 32-char base64, cryptographically random |
| SQL injection | Supabase client menggunakan parameterized queries |
| XSS | React auto-escape, no `dangerouslySetInnerHTML` kecuali sanitized |
| CSRF | Supabase token in cookie + SameSite=Lax |
| Rate limiting | Vercel edge (built-in) + Supabase tier limits |
| Secrets | Environment variables di Vercel & Supabase, tidak di repo |
| File upload | MIME type validation, max size (5MB), virus scan (future) |

### 11.9 Performance Considerations

**Database:**
- Index pada kolom yang sering di-query (status, foreign keys, created_at)
- Avoid N+1 queries (gunakan join/select dengan relations)
- Connection pooling via Supabase

**Frontend:**
- Next.js App Router dengan Server Components untuk initial render
- React Query untuk caching client-side
- Image optimization via Next/Image
- Bundle size monitoring (Vercel Analytics)
- Lazy load components yang tidak immediate visible

**Realtime:**
- Subscribe hanya saat halaman aktif (unsubscribe on unmount)
- Untuk customer tracking: subscribe pada single job_id (filter)

---

## 12. Integrasi Pihak Ketiga

### 12.1 TrackSolid (Jimi IoT)
- **Status MVP:** Paste manual share link dari dashboard TrackSolid
- **Cara dapat share link:** Buka TrackSolid → pilih device → klik "Share Location" → copy link
- **Implementasi customer page:**
  - Coba embed via `<iframe src={tracksolid_share_link} />`
  - Jika `X-Frame-Options` di-block, tampilkan tombol "Lihat Lokasi Real-time" yang buka tab baru
- **Future:** Integrasi API langsung
  - Dokumentasi: https://tracksolidprodocs.jimicloud.com/
  - Perlu request appKey & appSecret ke Jimi IoT

### 12.2 WhatsApp
- Click-to-chat link: `https://wa.me/{nohp}?text={encoded_message}`
- No formal API
- Template message di Halaman Konfirmasi Job:
  ```
  Halo Pak/Bu {pic_nama},
  
  Berikut link tracking pengiriman {alat} dari PT. Mitra Angkutan Sejati:
  {share_url}
  
  Driver: {driver_nama} ({driver_no_hp})
  
  Terima kasih.
  ```

### 12.3 Email (Reset Password)
- Supabase Auth SMTP bawaan (untuk MVP)
- Untuk production: configure custom SMTP di Supabase dashboard (SendGrid, AWS SES, dll)

---

## 13. Routing & URL Structure

```
/                              → redirect ke /dashboard atau /login
/login                         → halaman login admin
/reset-password                → request reset password
/reset-password/[token]        → form password baru

/dashboard                     → admin dashboard (default landing)

/units                         → daftar unit
/units/new                     → form tambah unit
/units/[id]                    → detail unit + history
/units/[id]/edit               → form edit unit

/drivers                       → daftar driver
/drivers/new                   → form tambah driver
/drivers/[id]                  → detail driver
/drivers/[id]/edit             → form edit driver

/customers                     → daftar customer
/customers/new                 → form tambah customer
/customers/[id]                → detail customer (+ riwayat job)
/customers/[id]/edit           → form edit customer

/jobs                          → daftar job (tab: aktif/selesai/cancelled)
/jobs/new                      → form job baru
/jobs/[id]                     → detail job
/jobs/[id]/edit                → form edit job
/jobs/[id]/confirmation        → halaman konfirmasi setelah simpan

/reports                       → index laporan
/reports/utilisasi             → laporan utilisasi armada
/reports/customers             → laporan riwayat customer

/settings                      → pengaturan
/settings/profile              → profile admin
/settings/jenis-unit           → master data jenis unit

/track/[token]                 → customer tracking page (public)
/track/[token]/expired         → halaman link expired
```

---

## 14. State Management (Frontend)

| Jenis State | Tools | Penggunaan |
|---|---|---|
| Server State | TanStack Query (React Query) | Data dari Supabase (units, jobs, dll) |
| Auth State | Supabase Auth + React Context | User session, role |
| UI State | React useState/useReducer | Modal open/close, form input, dropdown |
| Form State | React Hook Form + Zod | Form validation & submission |
| URL State | Next.js searchParams | Filter, search, pagination |

**Query patterns:**
```typescript
// Example: list active units
const { data: units, isLoading } = useQuery({
  queryKey: ['units', { status: 'standby' }],
  queryFn: () => supabase
    .from('units')
    .select('*, jenis_unit(*)')
    .eq('status', 'standby')
    .eq('is_active', true)
});
```

**Mutation pattern:**
```typescript
const mutation = useMutation({
  mutationFn: (newJob) => supabase.from('jobs').insert(newJob),
  onSuccess: () => {
    queryClient.invalidateQueries(['jobs']);
    queryClient.invalidateQueries(['units']);
    toast.success('Job berhasil dibuat');
    router.push(`/jobs/${data.id}/confirmation`);
  }
});
```

---

## 15. Deployment & DevOps

### 15.1 Setup Awal
1. Buat repo GitHub baru (private)
2. Setup Next.js project: `npx create-next-app@latest`
3. Buat Supabase project di supabase.com
4. Setup environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=... (server-side only, jangan exposed)
   ```
5. Connect repo ke Vercel
6. Tambahkan env vars di Vercel dashboard

### 15.2 Database Migrations
- Pakai Supabase CLI atau Supabase dashboard SQL editor
- Simpan migration files di `/supabase/migrations/`
- Naming: `YYYYMMDDHHMMSS_description.sql`

### 15.3 Deployment Workflow
```
1. Develop di branch feature
2. Push ke GitHub → Vercel auto-create Preview Deployment
3. Test di preview URL
4. Merge ke main → auto-deploy ke production
```

### 15.4 Backup
- Supabase auto-backup harian (di paid tier)
- Untuk free tier: manual export berkala via Supabase dashboard
- Setup reminder bulanan untuk export backup

### 15.5 Monitoring
- Vercel Analytics (free) untuk traffic & performance
- Supabase Dashboard untuk database health
- Setup alert email saat ada error 500 (Vercel)

---

## 16. Performance Targets

| Metrik | Target | Tools Pengukuran |
|---|---|---|
| First Contentful Paint | < 1.5s | Lighthouse, Vercel Analytics |
| Time to Interactive | < 3s | Lighthouse |
| Total Page Size (initial) | < 500KB | Bundle analyzer |
| API response (p95) | < 300ms | Supabase logs |
| Image upload time | < 5s (5MB file) | User-perceived |
| Status update → customer sees | < 10s | Manual testing |

---

## 17. Testing Strategy

### 17.1 MVP Scope
- **Tidak ada unit test atau integration test otomatis** untuk MVP - fokus shipping
- Manual testing oleh admin sebelum launch
- User Acceptance Testing (UAT) dengan 1-2 job real di production

### 17.2 Manual Test Checklist
Sebelum launch, test scenario berikut:
- [ ] Login admin
- [ ] Tambah unit baru, lihat di daftar
- [ ] Tambah driver, customer
- [ ] Buat job baru dengan semua field
- [ ] Copy share link, buka di incognito → tracking page tampil correct
- [ ] Update status job → verifikasi customer page update
- [ ] Upload foto loading & unloading → verifikasi muncul di customer page
- [ ] Selesaikan job → cek unit kembali Standby
- [ ] Test 24 jam setelah selesai → cek share link expired
- [ ] Cancel job → unit kembali Standby
- [ ] Test responsive mobile (Chrome DevTools)
- [ ] Test laporan utilisasi (input data dummy → cek perhitungan)

### 17.3 Post-Launch
- Monitor error logs Vercel
- Kumpulkan feedback admin & customer
- Iterasi cepat untuk bug fixing

---

## 18. Roadmap & Phasing

| Phase | Scope | Estimasi (full-time) |
|---|---|---|
| **Phase 0 — Setup** | Setup Supabase, Next.js, Vercel, database schema, RLS policies, auth | 1 minggu |
| **Phase 1 — Master Data** | CRUD Unit, Driver, Customer, Jenis Unit; Daftar & detail page | 1.5 minggu |
| **Phase 2 — Job Management** | Form Job Baru, Detail Job, Update Status, Halaman Konfirmasi | 2 minggu |
| **Phase 3 — Customer Tracking** | Public tracking page, embed TrackSolid, expired link handling | 1 minggu |
| **Phase 4 — Foto & Polish** | Upload foto, lightbox, progress stepper, mobile polish | 1 minggu |
| **Phase 5 — Laporan** | Laporan utilisasi, riwayat customer, export Excel | 1 minggu |
| **Phase 6 — UAT & Launch** | Bug fixing, manual testing, training admin, soft launch | 1 minggu |

**Total estimasi:** 8.5 minggu full-time. Part-time bisa 3-5 bulan.

**Saran pendekatan:**
- Fokus dulu **Phase 0-3** untuk dapat MVP-functional minimum
- Phase 4-5 menyusul setelah Anda lihat aplikasinya jalan
- Iterate berdasarkan feedback admin actual

---

## 19. Risiko & Mitigasi

| Risiko | Dampak | Probabilitas | Mitigasi |
|---|---|---|---|
| TrackSolid iframe diblokir X-Frame-Options | Sedang | Tinggi | Fallback ke tombol link-out |
| Learning curve developer (self-built) | Tinggi | Tinggi | Pakai Claude Code intensif, mulai MVP minimal |
| Adopsi user lambat | Sedang | Sedang | Training admin, jalankan paralel WhatsApp untuk transisi |
| Data growth lebih cepat dari free tier | Rendah | Rendah | Monitor usage Supabase dashboard, upgrade saat dibutuhkan |
| Share link bocor ke pihak tidak berkepentingan | Rendah | Rendah | Token panjang & random, auto-expire setelah job selesai |
| Foto memenuhi storage cepat | Sedang | Sedang | Auto-resize sebelum upload, batasi 5 foto per type |
| Supabase downtime | Tinggi | Rendah | SLA Supabase 99.9%, monitor, ada plan migrasi ke self-hosted di masa depan |
| Lost data (delete tidak sengaja) | Tinggi | Rendah | Soft delete (is_active=false), backup harian |
| Bug di production | Sedang | Sedang | Preview deploy per PR, manual test sebelum merge |

---

## 20. Open Questions

1. Desain logo final (warna brand sudah ditetapkan: hijau #1C9600 + putih)
2. Domain name (.com atau .id, perlu cek availability)
3. Konfirmasi: 24 jam auto-expire share link cukup, atau perlu lebih lama?
4. Format laporan Excel: template kustom atau standar?
5. Apakah perlu fitur "export semua job ke Excel" untuk arsip akhir bulan?
6. Konfirmasi: jumlah foto maksimal per type (default 5)
7. Apakah customer perlu lihat history perubahan status, atau cukup status terkini?
8. Apakah perlu reminder/notif via WA Business API ke admin saat ada job lewat ETA?
9. Bahasa default share link: Indonesia, atau bilingual ID/EN untuk customer asing?

---

## 21. Appendix

### A. Glossary

| Term | Definisi |
|---|---|
| Unit | Kendaraan/armada angkutan (truk, trailer) |
| Job | Satu pengiriman dari titik A ke titik B |
| Kode unit | Identifier internal unit (contoh: SL29, TH67) |
| Self loader | Truk dengan alat angkat sendiri |
| Lowbed | Trailer dengan bed rendah untuk alat berat besar |
| Highbed | Trailer dengan bed tinggi untuk alat berat sedang |
| Engkel | Truk single axle |
| ETD | Estimated Time of Departure |
| ETA | Estimated Time of Arrival |
| PIC | Person in Charge (kontak person di site customer) |
| TrackSolid | Platform GPS tracking dari Jimi IoT |
| Share link | URL unik untuk customer akses tracking tanpa login |
| Share token | String random unik di share link |
| RLS | Row Level Security (fitur PostgreSQL/Supabase untuk policy data) |
| RPC | Remote Procedure Call (function di database yang dipanggil via API) |
| JWT | JSON Web Token (format token autentikasi) |
| CRUD | Create, Read, Update, Delete |

### B. Mockup References
Tersedia di chat history pengembangan:
- Customer Tracking Page (dengan brand colors)
- Admin Dashboard (mobile view, brand colors)
- Form Job Baru (mobile view, brand colors)

### C. Referensi Teknologi
- Next.js: https://nextjs.org/docs
- Supabase: https://supabase.com/docs
- Tailwind CSS: https://tailwindcss.com/docs
- shadcn/ui: https://ui.shadcn.com
- TrackSolid API: https://tracksolidprodocs.jimicloud.com/
- React Query: https://tanstack.com/query

### D. Revision History

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0 | 20 Mei 2026 | Initial draft berdasarkan diskusi requirement |
| 1.1 | 20 Mei 2026 | Brand identity, detail form input job, pemisahan PIC ke jobs |
| 2.0 | 20 Mei 2026 | Comprehensive expansion: UI/UX detail lengkap (21 screens, design system, components, states), Backend architecture lengkap (DB schema dengan SQL, RLS policies, triggers, RPC functions, API endpoints, file storage, auth flow, security), routing structure, state management, deployment, testing strategy |

---

*Dokumen ini hidup (living document) - akan diperbarui seiring berkembangnya produk dan iterasi berdasarkan feedback user.*
