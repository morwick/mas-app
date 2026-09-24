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

  /// Ambang ketajaman (variance of Laplacian) di sisi aplikasi — hanya
  /// peringatan (FR-PHOTO-04). Dikalibrasi ulang dengan foto lapangan.
  static const double blurThresholdDefault = 60;
  static const double blurThresholdSuratJalan = 120;

  /// Sisi pendek minimum foto (px).
  static const int minShortSidePx = 1280;

  /// Ukuran maksimum setelah kompresi sebelum unggah.
  static const int uploadMaxLongSidePx = 1920;
  static const int uploadJpegQuality = 85;
}
