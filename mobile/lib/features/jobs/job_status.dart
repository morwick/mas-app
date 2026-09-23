import 'package:flutter/material.dart';

import '../../core/theme.dart';

/// Metadata status job v2 (PRD §6) dan slot foto (BR-06) — satu sumber
/// kebenaran untuk label, warna, urutan tahap, dan slot wajib.
enum JobStatus {
  menungguPickup('menunggu_pickup'), // nilai lama, diperlakukan sebagai ditugaskan
  ditugaskan('ditugaskan'),
  diterima('diterima'),
  loading('loading'),
  dalamPerjalanan('dalam_perjalanan'),
  unloading('unloading'),
  serahTerimaPool('serah_terima_pool'),
  menungguValidasi('menunggu_validasi'),
  selesai('selesai'),
  cancelled('cancelled');

  const JobStatus(this.value);
  final String value;

  static JobStatus parse(String raw) => JobStatus.values.firstWhere(
        (s) => s.value == raw,
        orElse: () => JobStatus.ditugaskan,
      );

  /// Status lama `menunggu_pickup` dinormalkan ke `ditugaskan`.
  JobStatus get normalized => this == JobStatus.menungguPickup ? JobStatus.ditugaskan : this;

  bool get isClosed => this == JobStatus.selesai || this == JobStatus.cancelled;
  bool get isActive => !isClosed;

  String get label => switch (normalized) {
        JobStatus.ditugaskan => 'Ditugaskan',
        JobStatus.diterima => 'Diterima',
        JobStatus.loading => 'Loading',
        JobStatus.dalamPerjalanan => 'Dalam perjalanan',
        JobStatus.unloading => 'Unloading',
        JobStatus.serahTerimaPool => 'Serah terima pool',
        JobStatus.menungguValidasi => 'Menunggu validasi',
        JobStatus.selesai => 'Selesai',
        JobStatus.cancelled => 'Dibatalkan',
        JobStatus.menungguPickup => 'Ditugaskan',
      };

  Color get color => switch (normalized) {
        JobStatus.ditugaskan => MasColors.warning,
        JobStatus.diterima => MasColors.info,
        JobStatus.loading || JobStatus.unloading => MasColors.info,
        JobStatus.dalamPerjalanan => MasColors.brandDark,
        JobStatus.serahTerimaPool => MasColors.info,
        JobStatus.menungguValidasi => MasColors.warning,
        JobStatus.selesai => MasColors.brand,
        JobStatus.cancelled => MasColors.danger,
        JobStatus.menungguPickup => MasColors.warning,
      };

  Color get background => switch (normalized) {
        JobStatus.ditugaskan || JobStatus.menungguValidasi => MasColors.warningBg,
        JobStatus.selesai || JobStatus.dalamPerjalanan => MasColors.brandLight,
        JobStatus.cancelled => MasColors.dangerBg,
        _ => MasColors.infoBg,
      };

  /// Status berikutnya yang boleh diminta driver (FR-MOBILE-06).
  JobStatus? get nextDriverStatus => switch (normalized) {
        JobStatus.diterima => JobStatus.loading,
        JobStatus.loading => JobStatus.dalamPerjalanan,
        JobStatus.dalamPerjalanan => JobStatus.unloading,
        JobStatus.unloading => JobStatus.serahTerimaPool,
        JobStatus.serahTerimaPool => JobStatus.menungguValidasi,
        _ => null,
      };

  /// Teks tombol lanjut per status.
  String? get advanceLabel => switch (normalized) {
        JobStatus.diterima => 'Tiba di lokasi muat — Mulai Loading',
        JobStatus.loading => 'Muat selesai — Berangkat',
        JobStatus.dalamPerjalanan => 'Tiba di tujuan — Mulai Bongkar',
        JobStatus.unloading => 'Bongkar selesai — Kembali ke Pool',
        JobStatus.serahTerimaPool => 'Selesaikan Orderan',
        _ => null,
      };

  /// Tahap foto yang sedang dibuka pada status ini (foto hanya boleh diambil
  /// saat status sudah masuk tahapnya).
  PhotoStage? get openPhotoStage => switch (normalized) {
        JobStatus.loading => PhotoStage.loading,
        JobStatus.unloading => PhotoStage.unloading,
        JobStatus.serahTerimaPool => PhotoStage.serahTerima,
        _ => null,
      };
}

/// Urutan langkah yang ditampilkan di stepper driver.
const driverSteps = <JobStatus>[
  JobStatus.ditugaskan,
  JobStatus.diterima,
  JobStatus.loading,
  JobStatus.dalamPerjalanan,
  JobStatus.unloading,
  JobStatus.serahTerimaPool,
  JobStatus.menungguValidasi,
  JobStatus.selesai,
];

enum PhotoStage {
  loading('loading', 'Loading (muat)'),
  unloading('unloading', 'Unloading (bongkar)'),
  serahTerima('serah_terima', 'Serah terima di pool');

  const PhotoStage(this.value, this.label);
  final String value;
  final String label;

  static PhotoStage? tryParse(String? raw) {
    for (final s in PhotoStage.values) {
      if (s.value == raw) return s;
    }
    return null;
  }

  /// Slot yang wajib terisi (BR-06).
  List<PhotoSlot> get requiredSlots => switch (this) {
        PhotoStage.loading || PhotoStage.unloading => const [
            PhotoSlot.depan,
            PhotoSlot.belakang,
            PhotoSlot.kanan,
            PhotoSlot.kiri,
            PhotoSlot.suratTimbang,
          ],
        PhotoStage.serahTerima => const [PhotoSlot.serahTerima],
      };
}

enum PhotoSlot {
  depan('depan', 'Foto sisi depan kendaraan'),
  belakang('belakang', 'Foto sisi belakang kendaraan'),
  kanan('kanan', 'Foto sisi kanan kendaraan'),
  kiri('kiri', 'Foto sisi kiri kendaraan'),
  suratTimbang('surat_timbang', 'Foto surat timbang'),
  serahTerima('serah_terima', 'Foto serah terima dokumen');

  const PhotoSlot(this.value, this.label);
  final String value;
  final String label;

  static PhotoSlot? tryParse(String? raw) {
    for (final s in PhotoSlot.values) {
      if (s.value == raw) return s;
    }
    return null;
  }

  /// Surat timbang harus lebih tajam karena berisi teks (FR-PHOTO-05).
  bool get isDocument => this == PhotoSlot.suratTimbang;
}

/// Teks kunci yang ditampilkan ke driver (FR-UJ-07).
const lockMessageUangJalan = 'Menunggu admin mengunggah bukti transfer uang jalan.';

/// Teks alert pengajuan uang jalan (PRD §6.2 — persis).
const ajukanUangJalanAlert =
    'Apakah anda yakin ingin mengajukan uang jalan? Anda baru bisa melanjutkan perjalanan '
    'setelah admin kasir mengupload bukti transfer uang jalan.';
