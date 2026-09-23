import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../../core/formatters.dart';
import '../../../core/theme.dart';
import '../../upload/upload_queue.dart';
import '../job_status.dart';
import '../models.dart';

/// Kartu satu slot foto bernama (FR-PHOTO-02): pratinjau, status unggah,
/// penanda kualitas rendah, dan tombol ambil/ganti.
class PhotoSlotCard extends StatelessWidget {
  const PhotoSlotCard({
    super.key,
    required this.slot,
    required this.photo,
    required this.task,
    required this.enabled,
    required this.onCapture,
    this.onRetry,
    this.onRemoveTask,
  });

  final PhotoSlot slot;
  final JobPhoto? photo;
  final UploadTask? task;
  final bool enabled;
  final VoidCallback onCapture;
  final VoidCallback? onRetry;
  final VoidCallback? onRemoveTask;

  @override
  Widget build(BuildContext context) {
    final filled = photo != null;
    final uploading = task != null && task!.isPending;
    final failed = task != null && task!.state == UploadState.failed;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _Thumb(photo: photo, task: task),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(slot.label, style: const TextStyle(fontWeight: FontWeight.w700)),
                      ),
                      if (filled && !uploading && !failed)
                        const Icon(Icons.check_circle, color: MasColors.brand, size: 20)
                      else if (!filled && !uploading && !failed)
                        const Icon(Icons.radio_button_unchecked, color: MasColors.subtle, size: 20),
                    ],
                  ),
                  const SizedBox(height: 4),
                  if (uploading) ...[
                    LinearProgressIndicator(
                      value: task!.state == UploadState.uploading && task!.progress > 0 ? task!.progress : null,
                      minHeight: 4,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      task!.state == UploadState.uploading
                          ? 'Mengunggah… ${(task!.progress * 100).round()}%'
                          : 'Menunggu antrean unggah',
                      style: const TextStyle(fontSize: 12, color: MasColors.muted),
                    ),
                  ] else if (failed) ...[
                    Text(
                      task!.error ?? 'Gagal mengunggah',
                      style: const TextStyle(fontSize: 12, color: MasColors.danger),
                    ),
                    Row(
                      children: [
                        TextButton(onPressed: onRetry, child: const Text('Coba lagi')),
                        TextButton(onPressed: onRemoveTask, child: const Text('Hapus')),
                      ],
                    ),
                  ] else if (filled) ...[
                    Text(
                      'Diambil ${formatDateTime(photo!.takenAt ?? photo!.uploadedAt)}',
                      style: const TextStyle(fontSize: 12, color: MasColors.muted),
                    ),
                    if (photo!.kualitasRendah)
                      const Padding(
                        padding: EdgeInsets.only(top: 4),
                        child: _Tag('Kualitas rendah — sebaiknya ambil ulang', MasColors.warning, MasColors.warningBg),
                      ),
                  ] else
                    const Text('Belum ada foto', style: TextStyle(fontSize: 12, color: MasColors.subtle)),
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 36,
                    child: OutlinedButton.icon(
                      onPressed: enabled && !uploading ? onCapture : null,
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 12)),
                      icon: const Icon(Icons.photo_camera_outlined, size: 18),
                      label: Text(filled ? 'Ambil ulang' : 'Ambil foto', style: const TextStyle(fontSize: 13)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.photo, required this.task});

  final JobPhoto? photo;
  final UploadTask? task;

  @override
  Widget build(BuildContext context) {
    Widget child;
    if (task != null && task!.state != UploadState.done && File(task!.filePath).existsSync()) {
      child = Image.file(File(task!.filePath), fit: BoxFit.cover);
    } else if (photo != null) {
      child = CachedNetworkImage(
        imageUrl: photo!.fileUrl,
        fit: BoxFit.cover,
        placeholder: (_, _) => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        errorWidget: (_, _, _) => const Icon(Icons.broken_image_outlined, color: MasColors.subtle),
      );
    } else {
      child = const Icon(Icons.image_outlined, color: MasColors.subtle, size: 30);
    }
    return GestureDetector(
      onTap: photo == null ? null : () => _openPreview(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Container(
          width: 84,
          height: 84,
          color: MasColors.page,
          child: child,
        ),
      ),
    );
  }

  void _openPreview(BuildContext context) {
    showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        child: InteractiveViewer(
          child: CachedNetworkImage(imageUrl: photo!.fileUrl, fit: BoxFit.contain),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text, this.fg, this.bg);
  final String text;
  final Color fg;
  final Color bg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
        child: Text(text, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w600)),
      );
}
