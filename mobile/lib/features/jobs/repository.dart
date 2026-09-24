import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import '../../core/paging.dart';
import 'job_status.dart';
import 'models.dart';

/// Akses endpoint `/api/driver/*` untuk job, uang jalan, dan notifikasi.
class DriverRepository {
  DriverRepository(this._api);

  final ApiClient _api;

  /// Satu halaman job untuk gulir bertahap. [status] memakai tab server:
  /// `konfirmasi`, `aktif`, `selesai` (juga `active`/`all` untuk portal web).
  Future<Halaman<Job>> jobsPage({
    required String status,
    required int page,
    required int pageSize,
  }) async {
    final data = await _api.get<Map<String, dynamic>>(
      '/driver/jobs/page',
      query: {'status': status, 'page': page, 'page_size': pageSize},
    );
    return Halaman.dariJson(data, Job.fromJson);
  }

  Future<Job> job(String id) async =>
      Job.fromJson(await _api.get<Map<String, dynamic>>('/driver/jobs/$id'));

  Future<void> accept(String id) => _api.post<dynamic>('/driver/jobs/$id/accept');

  Future<JobStatus> updateStatus(String id, JobStatus next, {String? notes}) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/driver/jobs/$id/status',
      body: {'status': next.value, if (notes != null && notes.isNotEmpty) 'notes': notes},
    );
    return JobStatus.parse(res['status'] as String);
  }

  Future<JobPhoto> uploadPhoto({
    required String jobId,
    required PhotoStage stage,
    required PhotoSlot slot,
    required String filePath,
    DateTime? takenAt,
    double? lat,
    double? lng,
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      'stage': stage.value,
      'slot': slot.value,
      if (takenAt != null) 'taken_at': takenAt.toUtc().toIso8601String(),
      if (lat != null) 'lat': lat.toString(),
      if (lng != null) 'lng': lng.toString(),
      'photo': await MultipartFile.fromFile(
        filePath,
        filename: '${stage.value}_${slot.value}.jpg',
        contentType: DioMediaType('image', 'jpeg'),
      ),
    });
    final res = await _api.upload<Map<String, dynamic>>(
      '/driver/jobs/$jobId/photos',
      form,
      onProgress: onProgress,
    );
    return JobPhoto.fromJson(res);
  }

  Future<JobUangJalan> uangJalan(String jobId) async =>
      JobUangJalan.fromJson(await _api.get<Map<String, dynamic>>('/driver/jobs/$jobId/uang-jalan'));

  Future<UangJalanRequest> ajukanUangJalan(String jobId, {required int nominal, String? catatan}) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/driver/jobs/$jobId/uang-jalan/ajukan',
      body: {'nominal': nominal, if (catatan != null && catatan.trim().isNotEmpty) 'catatan': catatan.trim()},
    );
    return UangJalanRequest.fromJson(res);
  }

  Future<List<DriverNotification>> notifications() async {
    final data = await _api.get<List<dynamic>>('/driver/notifications');
    return data.map((e) => DriverNotification.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<Halaman<DriverNotification>> notificationsPage({
    required int page,
    required int pageSize,
  }) async {
    final data = await _api.get<Map<String, dynamic>>(
      '/driver/notifications/page',
      query: {'page': page, 'page_size': pageSize},
    );
    return Halaman.dariJson(data, DriverNotification.fromJson);
  }

  Future<void> markRead(List<String> ids) =>
      _api.post<dynamic>('/driver/notifications/read', body: {'ids': ids});

  /// [driverToken] dipakai saat login, ketika sesi belum terpasang di state.
  Future<void> registerDevice(
    String fcmToken, {
    String platform = 'android',
    String? driverToken,
  }) =>
      _api.post<dynamic>(
        '/driver/devices',
        body: {'fcm_token': fcmToken, 'platform': platform},
        driverToken: driverToken,
      );
}
