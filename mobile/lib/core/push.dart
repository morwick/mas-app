import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import '../features/auth/auth_controller.dart';
import '../features/jobs/models.dart';
import '../features/jobs/providers.dart';
import 'session.dart';

/// Notifikasi in-app yang ikut dianggap dibaca ketika sebuah push diketuk.
///
/// Push tidak membawa id baris notifikasi: barisnya dibuat trigger database,
/// terpisah dari pengiriman FCM. Yang selalu ada di `data` adalah job dan jenis
/// kejadiannya, jadi itu yang dipakai mencocokkan.
///
/// Tanpa [jobId] tidak ada yang bisa dicocokkan. [kind] kosong berarti seluruh
/// notifikasi job itu yang belum dibaca.
List<String> notifikasiCocokDenganPush(
  List<DriverNotification> semua, {
  required String? jobId,
  required String? kind,
}) {
  if (jobId == null || jobId.isEmpty) return const [];
  return semua
      .where((n) => n.isUnread && n.jobId == jobId && (kind == null || kind.isEmpty || n.kind == kind))
      .map((n) => n.id)
      .toList();
}

/// Perangkat gagal didaftarkan untuk push. [message] sudah berbahasa manusia
/// dan langsung ditampilkan di layar login.
class PushRegistrationException implements Exception {
  const PushRegistrationException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Dipanggil isolate terpisah saat pesan tiba dengan aplikasi di background
/// atau tertutup. Harus fungsi top-level dan ditandai `vm:entry-point` supaya
/// tidak dibuang tree-shaker pada build release.
///
/// Tidak ada yang perlu dikerjakan di sini: notifikasi tray digambar SDK dari
/// blok `notification`, dan data disegarkan saat app dibuka kembali. Handler
/// tetap didaftarkan agar pesan data-only tidak dijatuhkan diam-diam.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  debugPrint('Push diterima di background: ${message.messageId}');
}

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

  /// Dipakai [syncToken] supaya login yang datang lebih cepat dari inisialisasi
  /// Firebase tidak melewatkan pendaftaran token.
  Future<void>? _ready;

  Future<void> init() => _ready ??= _init();

  Future<void> _init() async {
    try {
      await Firebase.initializeApp();
      _available = true;
    } catch (e) {
      debugPrint('Firebase tidak tersedia, push dinonaktifkan: $e');
      return;
    }

    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);

    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();

    _onToken = messaging.onTokenRefresh.listen(_registerToken);
    _onMessage = FirebaseMessaging.onMessage.listen(_handleForeground);
    _onOpened = FirebaseMessaging.onMessageOpenedApp.listen(_handleOpened);

    final initial = await messaging.getInitialMessage();
    if (initial != null) _handleOpened(initial);

    // Daftarkan token bila sudah login; login berikutnya memanggil [syncToken].
    if (_ref.read(authProvider) != null) await _syncToken();
  }

  /// Daftarkan perangkat sebagai bagian dari login; melempar
  /// [PushRegistrationException] bila gagal sehingga login ikut dibatalkan.
  ///
  /// Driver yang masuk tanpa perangkat terdaftar tidak akan pernah menerima job
  /// baru dan tidak ada tanda apa pun bahwa itu terjadi — lebih baik login
  /// ditolak dengan alasan yang jelas daripada diam-diam setengah jalan.
  ///
  /// [session] dipakai langsung karena sesi memang belum tertulis ke state.
  Future<void> registerForLogin(DriverSession session) async {
    await _ready;
    if (!_available) {
      throw const PushRegistrationException(
        'Notifikasi tidak aktif di perangkat ini. Pastikan Google Play Services '
        'terpasang dan diperbarui, lalu coba lagi.',
      );
    }

    final String? token;
    try {
      token = await FirebaseMessaging.instance.getToken();
    } catch (e) {
      debugPrint('Gagal mengambil token FCM: $e');
      throw const PushRegistrationException(
        'Perangkat gagal mendaftar ke layanan notifikasi. Periksa koneksi '
        'internet, lalu coba lagi.',
      );
    }
    if (token == null || token.isEmpty) {
      throw const PushRegistrationException(
        'Perangkat belum mendapat token notifikasi. Periksa koneksi internet, '
        'lalu coba lagi.',
      );
    }

    try {
      await _ref
          .read(driverRepositoryProvider)
          .registerDevice(token, driverToken: session.token);
    } on ApiException catch (e) {
      throw PushRegistrationException('Perangkat gagal didaftarkan: ${e.message}');
    } catch (e) {
      debugPrint('Gagal mendaftarkan token FCM: $e');
      throw const PushRegistrationException(
        'Perangkat gagal didaftarkan ke server. Periksa koneksi internet, lalu '
        'coba lagi.',
      );
    }
    await _store.setFcmToken(token);
  }

  /// Ambil token FCM perangkat dan daftarkan ke backend (idempoten).
  ///
  /// Menunggu [init] selesai lebih dulu: `main()` memanggilnya tanpa `await`
  /// agar layar pertama tidak tertahan, jadi login bisa saja tiba saat Firebase
  /// belum siap — tanpa penantian ini token perangkat itu tidak akan pernah
  /// tersimpan sampai aplikasi dijalankan ulang.
  Future<void> syncToken() async {
    await _ready;
    return _syncToken();
  }

  Future<void> _syncToken() async {
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
    for (final tab in JobTab.values) {
      _ref.invalidate(jobsPageProvider(tab));
    }
    refreshNotifikasi(_ref);
    final jobId = message.data['job_id'] as String?;
    if (jobId != null) {
      _ref.invalidate(jobProvider(jobId));
      _ref.invalidate(jobUangJalanProvider(jobId));
    }
    _foregroundController.add(message);
  }

  void _handleOpened(RemoteMessage message) => bukaDariPush(message.data);

  /// Sama seperti mengetuk notifikasi di tray: tandai dibaca lalu buka job.
  /// Dipakai juga oleh banner notifikasi saat aplikasi sedang terbuka.
  void bukaDariPush(Map<String, dynamic> data) {
    final jobId = data['job_id'] as String?;
    unawaited(_tandaiPushDibaca(jobId, data['kind'] as String?));
    onOpenJob?.call(jobId);
  }

  /// Push yang diketuk berarti driver sudah membacanya. Tanpa ini notifikasi
  /// tray hilang tetapi angka di lonceng aplikasi tidak berkurang — driver
  /// melihat hitungan yang tidak pernah turun.
  ///
  /// Sengaja tidak ditunggu pemanggilnya: navigasi ke detail job tidak boleh
  /// tertahan menunggu jaringan. Gagalnya pun tidak mengganggu apa pun —
  /// notifikasi tetap bisa ditandai dari layar Notifikasi.
  Future<void> _tandaiPushDibaca(String? jobId, String? kind) async {
    if (_ref.read(authProvider) == null) return;
    try {
      final repo = _ref.read(driverRepositoryProvider);
      final ids = notifikasiCocokDenganPush(await repo.notifications(), jobId: jobId, kind: kind);
      if (ids.isNotEmpty) await repo.markRead(ids);
    } catch (e) {
      debugPrint('Gagal menandai notifikasi dibaca: $e');
    }
    refreshNotifikasi(_ref);
  }

  final _foregroundController = StreamController<RemoteMessage>.broadcast();

  /// Pesan yang datang saat aplikasi terbuka, untuk ditampilkan sebagai banner melayang.
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
