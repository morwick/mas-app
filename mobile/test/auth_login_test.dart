import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/api_client.dart';
import 'package:mas_driver/core/session.dart';
import 'package:mas_driver/features/auth/auth_controller.dart';
import 'package:mas_driver/features/jobs/repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Menangkap permintaan tanpa menyentuh jaringan. Anggota privat [ApiClient]
/// tidak ikut terbawa ke pustaka lain, jadi `implements` cukup di sini.
class FakeApi implements ApiClient {
  final List<({String path, Object? body, String? driverToken})> permintaan = [];
  Object? Function(String path)? balasan;

  @override
  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    String? driverToken,
  }) async {
    permintaan.add((path: path, body: body, driverToken: driverToken));
    return (balasan?.call(path) ?? <String, dynamic>{}) as T;
  }

  @override
  Future<T> get<T>(String path, {Map<String, dynamic>? query}) async =>
      throw UnimplementedError();

  @override
  Future<T> upload<T>(String path, FormData form,
          {void Function(int sent, int total)? onProgress}) async =>
      throw UnimplementedError();
}

const _sesiDariServer = {
  'token': 'sesi-abc123',
  'driver_id': 'driver-1',
  'nama': 'Budi',
  'no_hp': '081234567890',
};

Future<(ProviderContainer, FakeApi, SessionStore)> siapkan() async {
  SharedPreferences.setMockInitialValues({});
  final store = await SessionStore.create();
  final api = FakeApi()..balasan = (_) => _sesiDariServer;
  final container = ProviderContainer(overrides: [
    sessionStoreProvider.overrideWithValue(store),
    apiClientProvider.overrideWithValue(api),
  ]);
  addTearDown(container.dispose);
  return (container, api, store);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AuthController.login', () {
    test('sesi tersimpan saat pendaftaran perangkat lolos', () async {
      final (container, _, store) = await siapkan();
      await container.read(authProvider.notifier).login(
            noHp: '081234567890',
            pin: '123456',
            beforeCommit: (_) async {},
          );
      expect(container.read(authProvider)?.token, 'sesi-abc123');
      expect(store.read()?.driverId, 'driver-1');
    });

    test('pendaftaran gagal membatalkan login seluruhnya', () async {
      final (container, _, store) = await siapkan();
      await expectLater(
        container.read(authProvider.notifier).login(
              noHp: '081234567890',
              pin: '123456',
              beforeCommit: (_) => throw Exception('perangkat ditolak'),
            ),
        throwsException,
      );
      // Inti jaminannya: tidak ada login separuh jadi yang lolos ke layar job.
      expect(container.read(authProvider), isNull);
      expect(store.read(), isNull);
    });

    test('pendaftaran berjalan sebelum sesi ditulis', () async {
      final (container, _, store) = await siapkan();
      var sesiSaatDaftar = store.read();
      await container.read(authProvider.notifier).login(
            noHp: '081234567890',
            pin: '123456',
            beforeCommit: (_) async => sesiSaatDaftar = store.read(),
          );
      expect(sesiSaatDaftar, isNull, reason: 'urutannya terbalik');
      expect(store.read(), isNotNull);
    });

    test('token sesi diteruskan ke pendaftaran perangkat', () async {
      final (container, _, _) = await siapkan();
      DriverSession? diterima;
      await container.read(authProvider.notifier).login(
            noHp: '081234567890',
            pin: '123456',
            beforeCommit: (s) async => diterima = s,
          );
      // Dipakai registerForLogin sebagai header X-Driver-Token.
      expect(diterima?.token, 'sesi-abc123');
    });
  });

  test('registerDevice mengirim token sesi eksplisit', () async {
    final api = FakeApi();
    await DriverRepository(api).registerDevice('token-fcm', driverToken: 'sesi-abc123');
    final req = api.permintaan.single;
    expect(req.path, '/driver/devices');
    expect(req.driverToken, 'sesi-abc123');
    expect(req.body, {'fcm_token': 'token-fcm', 'platform': 'android'});
  });
}
