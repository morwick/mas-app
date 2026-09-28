/// Konfigurasi build-time.
///
/// Base URL backend diberikan lewat `--dart-define=API_BASE_URL=https://...`
/// saat build/run. Default menunjuk ke emulator Android → localhost host.
class AppConfig {
  AppConfig._();

  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  /// Deteksi buram (FR-PHOTO-04) — hanya peringatan, driver tetap boleh kirim.
  /// Diukur sebagai lebar tepi (px) pada salinan selebar [blurAnalysisWidth];
  /// foto dianggap buram bila lebar tepinya ≥ ambang. Kalibrasi awal dengan foto
  /// truk/dokumen + goyangan buatan: goyangan sedang–berat terdeteksi semua,
  /// ±6% foto tajam ikut ditandai. Surat jalan sedikit lebih ketat karena
  /// tulisannya harus terbaca.
  static const int blurAnalysisWidth = 1024;
  static const double blurEdgeWidthDefault = 6.5;
  static const double blurEdgeWidthSuratJalan = 6.0;

  /// Sisi pendek minimum foto (px).
  static const int minShortSidePx = 1280;

  /// Ukuran maksimum setelah kompresi sebelum unggah.
  static const int uploadMaxLongSidePx = 1920;
  static const int uploadJpegQuality = 85;
}
