import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
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
/// kamera saja → periksa kualitas → peringatan bila perlu → stempel waktu & kompres.
///
/// Lokasi GPS sementara TIDAK diambil (menunggu GPS membuat driver lama
/// menunggu di setiap foto) — foto hanya diberi cap tanggal & jam.
/// Mengembalikan null bila driver membatalkan atau memilih ambil ulang.
class PhotoCapture {
  PhotoCapture._();

  static final _picker = ImagePicker();

  static Future<CapturedPhoto?> capture(BuildContext context, {required PhotoSlot slot}) async {
    final shot = await _picker.pickImage(
      source: ImageSource.camera,
      preferredCameraDevice: CameraDevice.rear,
      maxWidth: 2560,
      maxHeight: 2560,
      imageQuality: 92,
    );
    if (shot == null) return null;
    final takenAt = DateTime.now();
    if (!context.mounted) return null;

    // Loading langsung tampil begitu kamera ditutup.
    final pesan = ValueNotifier<String>('Membaca foto…');
    _tampilkanProgres(context, pesan);
    ProcessPhotoOutput? output;
    try {
      final bytes = await shot.readAsBytes();
      pesan.value = 'Memeriksa & menyiapkan foto…';
      output = await compute(
        processPhoto,
        ProcessPhotoInput(
          bytes: bytes,
          document: slot.isDocument,
          // Cap foto: tanggal & jam pengambilan, lalu nama fotonya.
          stampLine1: formatStamp(takenAt),
          stampLine2: slot.label,
        ),
      );
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Foto gagal diproses: $e')));
      }
    } finally {
      if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    }
    if (output == null) return null;

    if (!context.mounted) return null;
    if (!output.report.isAcceptable) {
      final keep = await _confirmLowQuality(context, output.report);
      if (keep != true) return null;
    }

    if (!context.mounted) return null;
    pesan.value = 'Menyimpan foto…';
    _tampilkanProgres(context, pesan);
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/mas_${slot.value}_${takenAt.millisecondsSinceEpoch}.jpg');
      await file.writeAsBytes(output.jpeg, flush: true);
      return CapturedPhoto(
        file: file,
        takenAt: takenAt,
        report: output.report,
      );
    } finally {
      if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
    }
  }

  /// Dialog progres (tidak bisa ditutup) dengan pesan yang berganti per tahap.
  static void _tampilkanProgres(BuildContext context, ValueNotifier<String> pesan) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => PopScope(
        canPop: false,
        child: AlertDialog(
          content: Row(
            children: [
              const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.5)),
              const SizedBox(width: 16),
              Expanded(
                child: ValueListenableBuilder<String>(
                  valueListenable: pesan,
                  builder: (_, teks, _) => Text(teks),
                ),
              ),
            ],
          ),
        ),
      ),
    );
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

}
