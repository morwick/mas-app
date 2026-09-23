import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/api_client.dart';
import '../auth/auth_controller.dart';
import '../camera/photo_capture.dart';
import '../jobs/job_status.dart';
import '../jobs/providers.dart';

enum UploadState { queued, uploading, failed, done }

/// Satu foto yang menunggu/sedang diunggah (FR-MOBILE-07).
class UploadTask {
  const UploadTask({
    required this.id,
    required this.jobId,
    required this.stage,
    required this.slot,
    required this.filePath,
    required this.takenAt,
    this.lat,
    this.lng,
    this.state = UploadState.queued,
    this.progress = 0,
    this.attempts = 0,
    this.error,
  });

  final String id;
  final String jobId;
  final PhotoStage stage;
  final PhotoSlot slot;
  final String filePath;
  final DateTime takenAt;
  final double? lat;
  final double? lng;
  final UploadState state;
  final double progress;
  final int attempts;
  final String? error;

  bool get isPending => state == UploadState.queued || state == UploadState.uploading;

  UploadTask copyWith({UploadState? state, double? progress, int? attempts, String? error}) => UploadTask(
        id: id,
        jobId: jobId,
        stage: stage,
        slot: slot,
        filePath: filePath,
        takenAt: takenAt,
        lat: lat,
        lng: lng,
        state: state ?? this.state,
        progress: progress ?? this.progress,
        attempts: attempts ?? this.attempts,
        error: error,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'job_id': jobId,
        'stage': stage.value,
        'slot': slot.value,
        'file': filePath,
        'taken_at': takenAt.toIso8601String(),
        'lat': lat,
        'lng': lng,
        'attempts': attempts,
      };

  static UploadTask? fromJson(Map<String, dynamic> j) {
    final stage = PhotoStage.tryParse(j['stage'] as String?);
    final slot = PhotoSlot.tryParse(j['slot'] as String?);
    if (stage == null || slot == null) return null;
    return UploadTask(
      id: j['id'] as String,
      jobId: j['job_id'] as String,
      stage: stage,
      slot: slot,
      filePath: j['file'] as String,
      takenAt: DateTime.parse(j['taken_at'] as String),
      lat: (j['lat'] as num?)?.toDouble(),
      lng: (j['lng'] as num?)?.toDouble(),
      attempts: (j['attempts'] as int?) ?? 0,
      state: UploadState.failed,
      error: 'Belum terkirim',
    );
  }
}

/// Antrean unggah: satu per satu, coba ulang otomatis dengan jeda bertambah,
/// dan tugas yang belum selesai disimpan supaya bertahan saat aplikasi ditutup.
class UploadQueue extends Notifier<List<UploadTask>> {
  static const _prefsKey = 'mas_upload_queue';
  static const _maxAutoAttempts = 5;

  bool _running = false;
  Timer? _retryTimer;

  @override
  List<UploadTask> build() {
    ref.onDispose(() => _retryTimer?.cancel());
    _restore();
    return const [];
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefsKey);
    if (raw == null) return;
    try {
      final list = (jsonDecode(raw) as List)
          .map((e) => UploadTask.fromJson(e as Map<String, dynamic>))
          .whereType<UploadTask>()
          .where((t) => File(t.filePath).existsSync())
          .map((t) => t.copyWith(state: UploadState.queued, error: null))
          .toList();
      if (list.isNotEmpty) {
        state = [...state, ...list];
        _pump();
      }
    } catch (e) {
      debugPrint('Antrean unggah tidak bisa dipulihkan: $e');
    }
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    final pending = state.where((t) => t.state != UploadState.done).map((t) => t.toJson()).toList();
    if (pending.isEmpty) {
      await prefs.remove(_prefsKey);
    } else {
      await prefs.setString(_prefsKey, jsonEncode(pending));
    }
  }

  /// Tambahkan foto ke antrean. Foto lain pada slot yang sama digantikan.
  void enqueue({
    required String jobId,
    required PhotoStage stage,
    required PhotoSlot slot,
    required CapturedPhoto photo,
  }) {
    final task = UploadTask(
      id: '${jobId}_${stage.value}_${slot.value}_${DateTime.now().millisecondsSinceEpoch}',
      jobId: jobId,
      stage: stage,
      slot: slot,
      filePath: photo.file.path,
      takenAt: photo.takenAt,
      lat: photo.lat,
      lng: photo.lng,
    );
    state = [
      ...state.where((t) => !(t.jobId == jobId && t.stage == stage && t.slot == slot)),
      task,
    ];
    _persist();
    _pump();
  }

  /// Coba ulang tugas yang gagal (tombol manual).
  void retry(String id) {
    _update(id, (t) => t.copyWith(state: UploadState.queued, attempts: 0, error: null));
    _pump();
  }

  void retryAll() {
    state = [
      for (final t in state)
        if (t.state == UploadState.failed) t.copyWith(state: UploadState.queued, attempts: 0, error: null) else t,
    ];
    _pump();
  }

  void remove(String id) {
    final task = state.where((t) => t.id == id).firstOrNull;
    state = state.where((t) => t.id != id).toList();
    if (task != null) _deleteFile(task.filePath);
    _persist();
  }

  UploadTask? taskFor(String jobId, PhotoStage stage, PhotoSlot slot) {
    for (final t in state.reversed) {
      if (t.jobId == jobId && t.stage == stage && t.slot == slot && t.state != UploadState.done) return t;
    }
    return null;
  }

  void _update(String id, UploadTask Function(UploadTask) fn) {
    state = [for (final t in state) t.id == id ? fn(t) : t];
  }

  Future<void> _pump() async {
    if (_running) return;
    _running = true;
    try {
      while (true) {
        final next = state.where((t) => t.state == UploadState.queued).firstOrNull;
        if (next == null) break;
        if (ref.read(authProvider) == null) break;
        await _upload(next);
      }
    } finally {
      _running = false;
    }
  }

  Future<void> _upload(UploadTask task) async {
    _update(task.id, (t) => t.copyWith(state: UploadState.uploading, progress: 0, error: null));
    try {
      await ref.read(driverRepositoryProvider).uploadPhoto(
            jobId: task.jobId,
            stage: task.stage,
            slot: task.slot,
            filePath: task.filePath,
            takenAt: task.takenAt,
            lat: task.lat,
            lng: task.lng,
            onProgress: (sent, total) {
              if (total > 0) _update(task.id, (t) => t.copyWith(progress: sent / total));
            },
          );
      _update(task.id, (t) => t.copyWith(state: UploadState.done, progress: 1));
      _deleteFile(task.filePath);
      refreshJobData(ref, task.jobId);
      // Bersihkan tugas selesai setelah beberapa saat supaya indikator sempat terlihat.
      Future<void>.delayed(const Duration(seconds: 3), () {
        state = state.where((t) => t.id != task.id).toList();
      });
    } on ApiException catch (e) {
      final attempts = task.attempts + 1;
      // Kesalahan dari server (4xx) tidak akan berubah bila diulang → berhenti.
      final permanent = e.statusCode >= 400 && e.statusCode < 500;
      _update(task.id, (t) => t.copyWith(state: UploadState.failed, attempts: attempts, error: e.message));
      if (!permanent && attempts < _maxAutoAttempts) _scheduleRetry(task.id, attempts);
    } catch (e) {
      final attempts = task.attempts + 1;
      _update(task.id, (t) => t.copyWith(state: UploadState.failed, attempts: attempts, error: 'Gagal mengunggah'));
      if (attempts < _maxAutoAttempts) _scheduleRetry(task.id, attempts);
    }
    await _persist();
  }

  void _scheduleRetry(String id, int attempts) {
    final delay = Duration(seconds: 5 * (1 << (attempts - 1))); // 5, 10, 20, 40…
    _retryTimer?.cancel();
    _retryTimer = Timer(delay, () {
      if (state.any((t) => t.id == id && t.state == UploadState.failed)) {
        _update(id, (t) => t.copyWith(state: UploadState.queued, error: null));
        _pump();
      }
    });
  }

  void _deleteFile(String path) {
    try {
      final f = File(path);
      if (f.existsSync()) f.deleteSync();
    } catch (_) {}
  }
}

final uploadQueueProvider = NotifierProvider<UploadQueue, List<UploadTask>>(UploadQueue.new);
