import 'dart:io';

import 'package:dio/dio.dart';

import 'config.dart';

/// Error dari backend dengan pesan siap tampil (`{"detail": "..."}`).
class ApiException implements Exception {
  ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

/// Klien HTTP ke backend FastAPI. Token sesi driver dikirim sebagai header
/// `X-Driver-Token`; 401 dilaporkan ke [onUnauthorized] supaya sesi dibersihkan.
class ApiClient {
  ApiClient({
    this._tokenProvider,
    this._onUnauthorized,
  }) {
    _dio = Dio(BaseOptions(
      baseUrl: '${AppConfig.apiBaseUrl}/api',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 60),
      sendTimeout: const Duration(minutes: 2),
      headers: {'Accept': 'application/json'},
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        // Pemanggil boleh menyetel token sendiri (lihat [driverToken]) — dipakai
        // saat sesi belum terpasang di state, jadi jangan ditimpa di sini.
        if (options.headers[_driverTokenHeader] == null) {
          final token = _tokenProvider?.call();
          if (token != null && token.isNotEmpty) {
            options.headers[_driverTokenHeader] = token;
          }
        }
        handler.next(options);
      },
    ));
  }

  static const _driverTokenHeader = 'X-Driver-Token';

  late final Dio _dio;
  final String? Function()? _tokenProvider;
  final void Function()? _onUnauthorized;

  Future<T> _run<T>(Future<Response<dynamic>> Function() call) async {
    try {
      final res = await call();
      return res.data as T;
    } on DioException catch (e) {
      final status = e.response?.statusCode ?? 0;
      if (status == 401) _onUnauthorized?.call();
      throw ApiException(status, _messageFrom(e));
    } on SocketException {
      throw ApiException(0, 'Tidak bisa terhubung ke server. Periksa koneksi internet.');
    }
  }

  static String _messageFrom(DioException e) {
    final data = e.response?.data;
    if (data is Map && data['detail'] != null) {
      final detail = data['detail'];
      if (detail is String) return detail;
      if (detail is List && detail.isNotEmpty) {
        final first = detail.first;
        if (first is Map && first['msg'] != null) {
          return (first['msg'] as String).replaceFirst(RegExp(r'^Value error, '), '');
        }
      }
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'Koneksi lambat, coba lagi.';
      case DioExceptionType.connectionError:
        return 'Tidak bisa terhubung ke server. Periksa koneksi internet.';
      default:
        return e.response?.statusCode != null
            ? 'Permintaan gagal (${e.response!.statusCode})'
            : 'Terjadi kesalahan jaringan';
    }
  }

  Future<T> get<T>(String path, {Map<String, dynamic>? query}) =>
      _run<T>(() => _dio.get(path, queryParameters: query));

  /// [driverToken] memaksa header sesi untuk satu permintaan. Dibutuhkan saat
  /// login: perangkat harus didaftarkan sebelum sesi ditulis ke state, jadi
  /// penyedia token biasa masih mengembalikan null.
  Future<T> post<T>(
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    String? driverToken,
  }) =>
      _run<T>(() => _dio.post(
            path,
            data: body,
            queryParameters: query,
            options: driverToken == null
                ? null
                : Options(headers: {_driverTokenHeader: driverToken}),
          ));

  Future<T> upload<T>(
    String path,
    FormData form, {
    void Function(int sent, int total)? onProgress,
  }) =>
      _run<T>(() => _dio.post(path, data: form, onSendProgress: onProgress));
}
