import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';

import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../jobs/job_status.dart';
import 'image_quality.dart';

/// Foto siap unggah: sudah distempel, dikompresi, dan disimpan sementara.
class CapturedPhoto {
  const CapturedPhoto({
    required this.file,
    required this.takenAt,
    required this.report,
    this.lat,
    this.lng,
  });

  final File file;
  final DateTime takenAt;
  final QualityReport report;
  final double? lat;
  final double? lng;
}

/// Alur ambil foto satu slot (FR-PHOTO-03..06):
/// kamera saja → GPS → periksa kualitas → peringatan bila perlu → stempel & kompres.
/// Mengembalikan null bila driver membatalkan atau memilih ambil ulang.
class PhotoCapture {
  PhotoCapture._();

  static final _picker = ImagePicker();

  static Future<CapturedPhoto?> capture(BuildContext context, {required PhotoSlot slot}) async {
    // Mulai cari lokasi lebih awal supaya siap saat kamera ditutup.
    final locationFuture = _currentPosition();

    final shot = await _picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.rear,
      maxWidth: 2560,
      maxHeight: 2560,
      imageQuality: 92,
    );
    if (shot == null) return null;
    final takenAt = DateTime.now();
    final pos = await locationFuture;

    final bytes = await shot.readAsBytes();
    if (!context.mounted) return null;
    final output = await _process(
      context,
      bytes: bytes,
      slot: slot,
      takenAt: takenAt,
      pos: pos,
    );
    if (output == null) return null;

    if (!context.mounted) return null;
    if (!output.report.isAcceptable) {
      final keep = await _confirmLowQuality(context, output.report);
      if (keep != true) return null;
    }

    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}/mas_${slot.value}_${takenAt.millisecondsSinceEpoch}.jpg');
    await file.writeAsBytes(output.jpeg, flush: true);

    return CapturedPhoto(
      file: file,
      takenAt: takenAt,
      report: output.report,
      lat: pos?.latitude,
      lng: pos?.longitude,
    );
  }

  static Future<ProcessPhotoOutput?> _process(
    BuildContext context, {
    required Uint8List bytes,
    required PhotoSlot slot,
    required DateTime takenAt,
    required Position? pos,
  }) async {
    // Dialog progres — pemrosesan berjalan di isolate terpisah.
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => const PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
              SizedBox(width: 16),
              Expanded(child: Text('Memeriksa & menyiapkan foto…')),
            ],
          ),
        ),
      ),
    );
    try {
      return await compute(
        processPhoto,
        ProcessPhotoInput(
          bytes: bytes,
          document: slot.isDocument,
          stampLine1: '${formatStamp(takenAt)}  •  ${slot.label}',
          stampLine2: 'GPS: ${formatCoord(pos?.latitude, pos?.longitude)}',
        ),
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Foto gagal diproses: $e')));
      }
      return null;
    } finally {
      if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    }
  }

  /// Peringatan kualitas — tidak memblokir (boleh dipaksa kirim, FR-PHOTO-04).
  static Future<bool?> _confirmLowQuality(BuildContext context, QualityReport report) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.blur_on, color: MasColors.warning, size: 36),
        title: Text(report.problems.first),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final p in report.problems.skip(1)) Text('• $p'),
            if (report.problems.length > 1) const SizedBox(height: 8),
            const Text(
              'Foto yang kurang jelas akan ditandai "kualitas rendah" dan bisa diminta ulang oleh admin.',
              style: TextStyle(color: MasColors.muted, fontSize: 13),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Tetap gunakan')),
          FilledButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Ambil ulang')),
        ],
      ),
    );
  }

  /// Posisi saat ini; null bila izin ditolak / GPS mati / lewat waktu.
  static Future<Position?> _currentPosition() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return null;
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) return null;
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 20)),
      );
    } catch (_) {
      try {
        return await Geolocator.getLastKnownPosition();
      } catch (_) {
        return null;
      }
    }
  }
}
