import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import 'job_status.dart';
import 'models.dart';

/// Akses endpoint `/api/driver/*` untuk job, uang jalan, dan notifikasi.
class DriverRepository {
  DriverRepository(this._api);

  final ApiClient _api;

  Future<List<Job>> jobs({bool activeOnly = false}) async {
    final data = await _api.get<List<dynamic>>(
      '/driver/jobs',
      query: {'status': activeOnly ? 'active' : 'all'},
    );
    return data.map((e) => Job.fromJson(e as Map<String, dynamic>)).toList();
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

  Future<void> markRead(List<String> ids) =>
      _api.post<dynamic>('/driver/notifications/read', body: {'ids': ids});

  Future<void> registerDevice(String fcmToken, {String platform = 'android'}) =>
      _api.post<dynamic>('/driver/devices', body: {'fcm_token': fcmToken, 'platform': platform});
}
