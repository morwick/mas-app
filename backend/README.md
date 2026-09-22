# MAS-APP Backend (FastAPI)

REST API untuk aplikasi manajemen armada. Berjalan di atas Supabase (Postgres
+ Auth + Storage) dan meneruskan JWT pengguna ke Supabase sehingga RLS di
database tetap menjadi penjaga akses.

## Menjalankan

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
copy .env.example .env      # isi kredensial
uvicorn app.main:app --reload --port 8000
```

OpenAPI: <http://localhost:8000/docs>

## Kualitas kode

```powershell
pytest              # tes unit domain + smoke test API (tanpa Supabase)
ruff check app      # lint
ruff format app     # format
mypy app            # type-check
```

## Peta endpoint (semua di bawah `/api`)

| Prefix              | Isi                                                      | Auth            |
|---------------------|----------------------------------------------------------|-----------------|
| `/auth`             | login, refresh, logout, reset password, profil           | Bearer / publik |
| `/users`            | role & scope pengguna                                    | owner           |
| `/jenis-unit`       | master jenis unit                                        | Bearer (tulis: owner) |
| `/units`            | unit, riwayat status, job/insiden/servis per unit        | Bearer          |
| `/drivers`          | driver, PIN portal                                       | Bearer          |
| `/customers`        | customer                                                 | Bearer          |
| `/jobs`             | job, status, pembatalan, foto, cek bentrok, jadwal       | Bearer          |
| `/incidents`        | insiden & foto                                           | Bearer          |
| `/maintenance`      | servis, kalibrasi, sinkronisasi mileage TrackSolid       | Bearer          |
| `/tracking`         | lokasi armada real-time                                  | Bearer          |
| `/track/{token}`    | pelacakan pelanggan                                      | publik (share token) |
| `/quotations`       | penawaran                                                | Bearer          |
| `/uang-jalan`, `/sumber-dana` | uang jalan                                     | Bearer          |
| `/invoices`, `/piutang` | tagihan, pembayaran, piutang                         | Bearer / owner  |
| `/reports`          | utilisasi, laba per job                                  | owner           |
| `/notifications`    | isi lonceng                                              | Bearer          |
| `/dashboard`, `/layout/counts` | data agregat                                  | Bearer          |
| `/driver/*`         | portal driver                                            | `X-Driver-Token` |
| `/cron/*`           | backfill mileage                                         | `Bearer <CRON_SECRET>` |

## Tata letak

```
app/
├── main.py            create_app(): CORS, handler error, registrasi router
├── core/
│   ├── config.py      Settings (pydantic-settings, .env)
│   ├── supabase.py    pabrik klien per identitas (user / anon+share / driver / admin)
│   ├── auth.py        verifikasi JWT admin, CurrentUser, dependency user_client/owner_client
│   ├── driver_auth.py sesi portal driver
│   ├── errors.py      AppError → JSON {detail}, pemetaan error PostgREST/Auth/Storage
│   ├── storage.py     validasi & unggah foto
│   ├── pg.py          bantuan membaca hasil PostgREST (first/num/rows/single)
│   └── timeutil.py    WIB, ISO, bulan romawi
├── domain/            fungsi murni (tanpa I/O) — mudah diuji
├── integrations/      TrackSolid, OpenRouteService, polyline, ETA
└── modules/<fitur>/
    ├── schemas.py     model Pydantic (request/response)
    ├── service.py     logika bisnis, memakai klien Supabase yang disuntikkan
    └── router.py      endpoint FastAPI — tipis, hanya memetakan HTTP ↔ service
```

Aturan main:

- Router tidak berisi logika; service tidak tahu HTTP.
- Error bisnis dilempar sebagai `AppError` turunan (`ValidationError`,
  `NotFoundError`, `ConflictError`, …) dengan pesan siap tampil.
- Klien service-role (`factory.admin()`) hanya untuk cron dan penulisan
  snapshot mileage — pembacaan data pengguna selalu lewat klien RLS.
