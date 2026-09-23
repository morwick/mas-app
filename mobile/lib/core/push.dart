import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/auth_controller.dart';
import '../features/jobs/providers.dart';
import 'session.dart';

/// Push notification via FCM (FR-MOBILE-05).
///
/// Firebase bersifat opsional: bila `google-services.json` belum dipasang,
/// inisialisasi gagal dan aplikasi tetap berjalan tanpa push.
class PushService {
  PushService(this._ref, this._store);

  final Ref _ref;
  final SessionStore _store;

  bool _available = false;
  StreamSubscription<RemoteMessage>? _onMessage;
  StreamSubscription<RemoteMessage>? _onOpened;
  StreamSubscription<String>? _onToken;

  /// Dipanggil aplikasi saat notifikasi diketuk (untuk navigasi ke job).
  void Function(String? jobId)? onOpenJob;

  bool get available => _available;

  Future<void> init() async {
    try {
      await Firebase.initializeApp();
      _available = true;
    } catch (e) {
      debugPrint('Firebase tidak tersedia, push dinonaktifkan: $e');
      return;
    }

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();

    _onToken = messaging.onTokenRefresh.listen(_registerToken);
    _onMessage = FirebaseMessaging.onMessage.listen(_handleForeground);
    _onOpened = FirebaseMessaging.onMessageOpenedApp.listen(_handleOpened);

    final initial = await messaging.getInitialMessage();
    if (initial != null) _handleOpened(initial);

    // Daftarkan token bila sudah login; login berikutnya memanggil [syncToken].
    if (_ref.read(authProvider) != null) await syncToken();
  }

  /// Ambil token FCM perangkat dan daftarkan ke backend (idempoten).
  Future<void> syncToken() async {
    if (!_available) return;
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _registerToken(token);
    } catch (e) {
      debugPrint('Gagal mengambil token FCM: $e');
    }
  }

  Future<void> _registerToken(String token) async {
    if (_ref.read(authProvider) == null) return;
    try {
      await _ref.read(driverRepositoryProvider).registerDevice(token);
      await _store.setFcmToken(token);
    } catch (e) {
      debugPrint('Gagal mendaftarkan token FCM: $e');
    }
  }

  void _handleForeground(RemoteMessage message) {
    // Data berubah di server — segarkan daftar & notifikasi.
    _ref.invalidate(jobsProvider);
    _ref.invalidate(notificationsProvider);
    final jobId = message.data['job_id'] as String?;
    if (jobId != null) {
      _ref.invalidate(jobProvider(jobId));
      _ref.invalidate(jobUangJalanProvider(jobId));
    }
    _foregroundController.add(message);
  }

  void _handleOpened(RemoteMessage message) {
    onOpenJob?.call(message.data['job_id'] as String?);
  }

  final _foregroundController = StreamController<RemoteMessage>.broadcast();

  /// Pesan yang datang saat aplikasi terbuka, untuk ditampilkan sebagai snackbar.
  Stream<RemoteMessage> get foregroundMessages => _foregroundController.stream;

  void dispose() {
    _onMessage?.cancel();
    _onOpened?.cancel();
    _onToken?.cancel();
    _foregroundController.close();
  }
}

final pushServiceProvider = Provider<PushService>((ref) {
  final svc = PushService(ref, ref.watch(sessionStoreProvider));
  ref.onDispose(svc.dispose);
  return svc;
});
