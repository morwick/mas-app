# MAS Driver — aplikasi mobile driver (Flutter)

Aplikasi Android untuk driver PT. Mitra Angkutan Sejati, mengikuti
`PRD-Alur-Kerja-Job-v2.md` (FR-MOBILE, FR-PHOTO, FR-UJ, FR-NOTIF).

## Fitur

| Fitur | Implementasi |
|-------|--------------|
| Login HP + PIN 6 digit | `features/auth` → `POST /api/driver/login`, sesi tersimpan di perangkat |
| Daftar job: *Perlu dikonfirmasi / Aktif / Selesai* | `features/jobs/jobs_list_screen.dart` |
| **Swipe untuk menerima** job | `features/jobs/widgets/swipe_to_accept.dart` |
| Uang jalan: pagu, sisa, **Ajukan Uang Jalan** (nominal ≤ sisa pagu) + alert konfirmasi | `features/jobs/widgets/uang_jalan_card.dart` |
| Slot foto bernama per tahap (depan/belakang/kanan/kiri/surat timbang; serah terima) | `features/jobs/widgets/photo_slot_card.dart` |
| Kamera saja (bukan galeri), cek buram/gelap/resolusi, peringatan *Ambil ulang / Tetap gunakan* | `features/camera/photo_capture.dart`, `image_quality.dart` |
| Stempel tanggal-jam + GPS pada gambar, kirim `taken_at/lat/lng` | `image_quality.dart` (`stampImage`) |
| Antrean unggah tahan koneksi buruk (retry otomatis, progres, bertahan saat app ditutup) | `features/upload/upload_queue.dart` |
| Tombol lanjut dengan alasan kunci (uang jalan / foto belum lengkap) | `job_detail_screen.dart` (`_AdvanceButton`) |
| Push notification FCM + daftar notifikasi | `core/push.dart`, `features/notifications` |

Semua kunci (BR-01, BR-02, BR-06) tetap ditegakkan backend/database; aplikasi
hanya menampilkan alasannya lebih awal.

## Menjalankan

Prasyarat: Flutter 3.35+ (Dart 3.9+), Android SDK, backend berjalan.

```bash
cd mobile
flutter pub get

# Emulator Android (10.0.2.2 = localhost host)
flutter run

# HP fisik di jaringan yang sama dengan komputer backend
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:8000

# Build rilis (ganti URL dengan backend produksi)
flutter build apk --release --dart-define=API_BASE_URL=https://api.contoh.com
```

`API_BASE_URL` tanpa akhiran `/api` — klien menambahkannya sendiri.

## Push notification (opsional)

Tanpa Firebase aplikasi tetap berjalan (push dinonaktifkan otomatis).

1. Buat project di Firebase Console → tambah app Android dengan package
   `id.co.mas.mas_driver`.
2. Unduh `google-services.json` → simpan ke `mobile/android/app/` (file ini
   di-`.gitignore`; plugin `google-services` diterapkan otomatis bila ada).
3. Di Firebase → *Project settings → Service accounts* → *Generate new private
   key*, simpan JSON di server backend dan isi `FIREBASE_CREDENTIALS_FILE` di
   `backend/.env`.
4. Build ulang aplikasi. Token perangkat didaftarkan ke `POST /api/driver/devices`
   saat login.

## Struktur

```
lib/
  main.dart, app.dart          # bootstrap, router (go_router), tema
  core/                        # config, api_client (Dio), session, push, formatters, theme, widgets
  features/
    auth/                      # login screen + controller (Riverpod)
    jobs/                      # models, status metadata, repository, providers, screens, widgets
    camera/                    # ambil foto, cek kualitas, stempel (isolate)
    upload/                    # antrean unggah foto
    notifications/             # daftar notifikasi
test/                          # image_quality_test, models_test
```

## Uji

```bash
flutter analyze
flutter test
```

Ambang buram (`AppConfig.blurThresholdDefault` / `blurThresholdSuratTimbang`)
sebaiknya dikalibrasi dengan foto lapangan; backend memakai ambang yang sama
(`BLUR_THRESHOLD_*` di `.env`).
