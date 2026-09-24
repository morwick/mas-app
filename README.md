# MAS-APP — Manajemen Armada PT. Mitra Angkutan Sejati

Aplikasi manajemen armada, job pengiriman, pelacakan GPS, penawaran, uang
jalan, tagihan/piutang, dan portal driver.

```
mas-app/
├── backend/    REST API — Python 3.11+ / FastAPI, di atas Supabase (Postgres + Auth + Storage)
├── frontend/   SPA — React 18 / TypeScript / Vite / TanStack Query / Tailwind
├── mobile/     Aplikasi driver — Flutter (Android), push notification FCM
├── supabase/   Migrasi SQL (skema, RLS, fungsi) — dijalankan di Supabase SQL Editor
├── legacy/     Versi lama (Next.js) — referensi saja, tidak dijalankan
├── SETUP.md    Panduan setup lengkap
└── PRD-Alur-Kerja-Job-v2.md  Aturan alur job v2 (Lock System, uang jalan, foto, validasi)
```

## Arsitektur singkat

```
Browser (React SPA) ──HTTP/JSON──▶ FastAPI (/api/*) ──PostgREST/Storage/Auth──▶ Supabase
                                       │
                                       ├─▶ TrackSolid (lokasi & mileage GPS)
                                       └─▶ OpenRouteService (rute job)
```

- **Autentikasi** tetap Supabase Auth. Frontend login lewat `POST /api/auth/login`,
  menyimpan JWT, dan mengirimnya sebagai `Authorization: Bearer`. Backend
  meneruskan JWT yang sama ke Supabase sehingga **RLS tetap menjadi penjaga
  akses** — bukan kode aplikasi.
- **Aplikasi driver (Flutter) & portal web driver** memakai token sesi sendiri
  (`X-Driver-Token`), diverifikasi fungsi `driver_me()` di database.
- **Halaman pelacakan pelanggan** memakai `x-share-token` tanpa login.
- Semua logika bisnis (bentrok jadwal, penomoran surat, sinkronisasi mileage,
  notifikasi, dsb.) ada di backend Python. Frontend hanya menampilkan dan
  memvalidasi input.

## Menjalankan (ringkas)

Prasyarat: Python 3.11+, Node.js 18+, project Supabase yang sudah dimigrasi
(lihat `SETUP.md`).

```powershell
# 1. Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
copy .env.example .env      # lalu isi kredensial Supabase, TrackSolid, ORS
uvicorn app.main:app --reload --port 8000
#   → http://localhost:8000/docs (OpenAPI)

# 2. Frontend (terminal lain)
cd frontend
npm install
npm run dev
#   → http://localhost:5173  (Vite mem-proxy /api ke backend)
```

## Perintah pengembangan

| Backend (`backend/`)              | Frontend (`frontend/`)        | Mobile (`mobile/`)            |
|-----------------------------------|-------------------------------|-------------------------------|
| `pytest` — tes unit & smoke API   | `npm test` — tes render       | `flutter test`                |
| `ruff check app` / `ruff format`  | `npm run typecheck`           | `flutter analyze`             |
| `mypy app`                        | `npm run build` → `dist/`     | `flutter build apk --release` |

## Struktur kode

**backend/app/**

```
core/          config, auth (JWT Supabase), sesi driver, klien Supabase, error → HTTP, storage
domain/        fungsi murni: bentrok jadwal, status servis, ringkasan uang jalan
integrations/  TrackSolid, OpenRouteService, polyline & ETA
modules/       satu folder per fitur: router.py (HTTP) · service.py (logika) · schemas.py (Pydantic)
main.py        pembuatan aplikasi, CORS, registrasi router
```

**frontend/src/**

```
app/           router, provider, layout, guard
lib/           klien API (+refresh token), sesi, util format, ETA/polyline
types/         tipe domain (sama persis dengan skema respons backend)
components/    ui/ (tombol, input, modal…) dan layout/ (sidebar, topbar…)
features/      satu folder per fitur: api.ts · queries.ts (hook) · components/ · pages/
```
