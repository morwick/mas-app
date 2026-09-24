import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/session.dart';

/// Disediakan lewat override di `main.dart` setelah SharedPreferences siap.
final sessionStoreProvider = Provider<SessionStore>((ref) {
  throw UnimplementedError('sessionStoreProvider harus di-override di main()');
});

/// Sesi driver saat ini (null = belum login). Dibaca dari penyimpanan saat
/// aplikasi mulai; 401 dari server otomatis mengosongkannya.
class AuthController extends Notifier<DriverSession?> {
  @override
  DriverSession? build() => ref.watch(sessionStoreProvider).read();

  SessionStore get _store => ref.read(sessionStoreProvider);

  /// [beforeCommit] dijalankan setelah server menerima PIN tetapi sebelum sesi
  /// ditulis. Bila ia melempar, login ikut gagal dan tidak ada yang tersimpan —
  /// dipakai agar driver tidak pernah masuk tanpa perangkatnya terdaftar untuk
  /// push. Urutannya sengaja begini supaya kegagalan tidak perlu dibatalkan
  /// setelah layar job sempat terbuka.
  Future<void> login({
    required String noHp,
    required String pin,
    Future<void> Function(DriverSession session)? beforeCommit,
  }) async {
    final api = ref.read(apiClientProvider);
    final res = await api.post<Map<String, dynamic>>(
      '/driver/login',
      body: {'no_hp': noHp.trim(), 'pin': pin},
    );
    final session = DriverSession.fromJson(res);
    if (beforeCommit != null) await beforeCommit(session);
    await _store.write(session);
    state = session;
  }

  /// Logout: cabut sesi di server (termasuk token FCM perangkat ini) lalu
  /// bersihkan penyimpanan lokal. Kegagalan jaringan tidak menghalangi logout.
  Future<void> logout() async {
    final api = ref.read(apiClientProvider);
    final fcm = _store.fcmToken;
    try {
      await api.post<dynamic>('/driver/logout', query: {'fcm_token': ?fcm});
    } catch (_) {
      // Sesi lokal tetap dihapus.
    }
    await _store.clear();
    state = null;
  }

  /// Dipanggil klien HTTP saat server menjawab 401.
  Future<void> expire() async {
    if (state == null) return;
    await _store.clear();
    state = null;
  }
}

final authProvider = NotifierProvider<AuthController, DriverSession?>(AuthController.new);

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    tokenProvider: () => ref.read(authProvider)?.token,
    onUnauthorized: () => ref.read(authProvider.notifier).expire(),
  );
});
