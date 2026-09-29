import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_update/in_app_update.dart';
import 'package:url_launcher/url_launcher.dart';

/// Hasil pengecekan versi di Play Store.
enum StatusPembaruan {
  /// Sudah versi terbaru, atau tidak bisa dicek (bukan dari Play Store,
  /// tanpa Google Play, iOS) — aplikasi berjalan normal.
  terbaru,

  /// Ada versi baru di Play Store — wajib dipasang sebelum aplikasi dipakai.
  wajib,

  /// Update sudah dimulai sebelumnya tapi belum selesai — lanjutkan.
  sedangDipasang,
}

/// Pengecekan & pemasangan versi baru. Dipisah supaya bisa diganti di test.
abstract class PemeriksaPembaruan {
  Future<StatusPembaruan> periksa();

  /// Buka layar update penuh dari Play Store. False bila dibatalkan / gagal.
  Future<bool> pasang();

  /// Cadangan bila layar update tidak bisa dibuka: halaman aplikasi di Play Store.
  Future<void> bukaToko();
}

final pemeriksaPembaruanProvider = Provider<PemeriksaPembaruan>((_) => PemeriksaPembaruanPlay());

/// Google Play In-App Updates (mode immediate). Hanya Android; aplikasi
/// yang tidak dipasang dari Play Store tidak pernah dikunci.
class PemeriksaPembaruanPlay implements PemeriksaPembaruan {
  static const _paketDefault = 'id.co.mas.mas_driver';
  String _paket = _paketDefault;
  bool _bisaImmediate = true;

  @override
  Future<StatusPembaruan> periksa() async {
    if (kIsWeb || !Platform.isAndroid) return StatusPembaruan.terbaru;
    try {
      final info = await InAppUpdate.checkForUpdate();
      _paket = info.packageName.isNotEmpty ? info.packageName : _paketDefault;
      _bisaImmediate = info.immediateUpdateAllowed;
      return switch (info.updateAvailability) {
        UpdateAvailability.updateAvailable => StatusPembaruan.wajib,
        UpdateAvailability.developerTriggeredUpdateInProgress => StatusPembaruan.sedangDipasang,
        _ => StatusPembaruan.terbaru,
      };
    } catch (e) {
      // Mis. APK debug / dipasang manual: Play tidak mengenal aplikasi ini.
      debugPrint('Cek pembaruan dilewati: $e');
      return StatusPembaruan.terbaru;
    }
  }

  @override
  Future<bool> pasang() async {
    if (!_bisaImmediate) return false;
    try {
      return await InAppUpdate.performImmediateUpdate() == AppUpdateResult.success;
    } catch (e) {
      debugPrint('Update gagal dimulai: $e');
      return false;
    }
  }

  @override
  Future<void> bukaToko() async {
    final market = Uri.parse('market://details?id=$_paket');
    if (await canLaunchUrl(market) && await launchUrl(market, mode: LaunchMode.externalApplication)) return;
    await launchUrl(
      Uri.parse('https://play.google.com/store/apps/details?id=$_paket'),
      mode: LaunchMode.externalApplication,
    );
  }
}
