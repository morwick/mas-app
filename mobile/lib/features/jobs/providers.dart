import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/paging.dart';
import '../auth/auth_controller.dart';
import 'models.dart';
import 'repository.dart';

final driverRepositoryProvider = Provider<DriverRepository>(
  (ref) => DriverRepository(ref.watch(apiClientProvider)),
);

final jobProvider = FutureProvider.autoDispose.family<Job, String>((ref, id) {
  return ref.watch(driverRepositoryProvider).job(id);
});

final jobUangJalanProvider = FutureProvider.autoDispose.family<JobUangJalan, String>((ref, jobId) {
  return ref.watch(driverRepositoryProvider).uangJalan(jobId);
});

final notificationsProvider = FutureProvider.autoDispose<List<DriverNotification>>((ref) {
  ref.watch(authProvider);
  return ref.watch(driverRepositoryProvider).notifications();
});

final unreadCountProvider = Provider.autoDispose<int>((ref) {
  return ref.watch(notificationsProvider).valueOrNull?.where((n) => n.isUnread).length ?? 0;
});

/// Segarkan semua data job setelah aksi (terima, lanjut status, foto, ajukan).
///
/// Ketiga tab ikut disegarkan karena perubahan status memindahkan job dari satu
/// tab ke tab lain — menyegarkan yang sedang tampil saja meninggalkan job hantu
/// di tab sebelahnya.
void refreshJobData(Ref ref, String jobId) {
  ref.invalidate(jobProvider(jobId));
  ref.invalidate(jobUangJalanProvider(jobId));
  for (final tab in JobTab.values) {
    ref.invalidate(jobsPageProvider(tab));
  }
}

/// Lonceng dan daftar notifikasi membaca data yang sama lewat dua endpoint
/// (hitungan belum dibaca vs halaman), jadi keduanya disegarkan bersama.
void refreshNotifikasi(Ref ref) {
  ref.invalidate(notificationsProvider);
  ref.invalidate(notificationsPageProvider);
}

void refreshNotifikasiFromWidget(WidgetRef ref) {
  ref.invalidate(notificationsProvider);
  ref.invalidate(notificationsPageProvider);
}

/// Versi untuk widget (`WidgetRef`).
void refreshJobDataFromWidget(WidgetRef ref, String jobId) {
  ref.invalidate(jobProvider(jobId));
  ref.invalidate(jobUangJalanProvider(jobId));
  for (final tab in JobTab.values) {
    ref.invalidate(jobsPageProvider(tab));
  }
}

// ── Gulir bertahap ──────────────────────────────────────────────────────────

/// Tab daftar job. `value` adalah nilai `status` yang dikirim ke server —
/// penyaringannya dikerjakan di sana supaya tidak perlu mengunduh semua job
/// hanya untuk menampilkan satu tab.
enum JobTab {
  konfirmasi('konfirmasi', 'Perlu dikonfirmasi'),
  aktif('aktif', 'Aktif'),
  selesai('selesai', 'Selesai');

  const JobTab(this.value, this.label);
  final String value;
  final String label;
}

/// Sengaja kecil: layar HP muat sekitar 4–5 kartu, jadi satu halaman sudah
/// mengisi layar lebih dari cukup sambil tetap ringan di jaringan lapangan.
const int ukuranHalaman = 20;

class JobsPageNotifier extends AutoDisposeFamilyAsyncNotifier<DaftarBertahap<Job>, JobTab> {
  @override
  Future<DaftarBertahap<Job>> build(JobTab arg) async {
    ref.watch(authProvider); // muat ulang saat sesi berganti
    final halaman = await ref
        .watch(driverRepositoryProvider)
        .jobsPage(status: arg.value, page: 1, pageSize: ukuranHalaman);
    return gabungHalaman(const DaftarBertahap<Job>(), halaman, idOf: (j) => j.id, halaman: 1);
  }

  /// Ambil halaman berikutnya. Aman dipanggil berkali-kali saat menggulir —
  /// permintaan yang sedang jalan dan daftar yang sudah habis diabaikan.
  Future<void> muatLagi() async {
    final kini = state.valueOrNull;
    if (kini == null || kini.memuatLagi || !kini.adaLagi) return;
    state = AsyncData(kini.salin(memuatLagi: true));
    final berikutnya = kini.halaman + 1;
    try {
      final halaman = await ref
          .read(driverRepositoryProvider)
          .jobsPage(status: arg.value, page: berikutnya, pageSize: ukuranHalaman);
      state = AsyncData(gabungHalaman(kini, halaman, idOf: (j) => j.id, halaman: berikutnya));
    } catch (_) {
      // Gagal memuat tambahan tidak boleh membuang daftar yang sudah tampil;
      // driver tinggal menggulir lagi untuk mencoba ulang.
      state = AsyncData(kini.salin(memuatLagi: false));
    }
  }
}

final jobsPageProvider =
    AsyncNotifierProvider.autoDispose.family<JobsPageNotifier, DaftarBertahap<Job>, JobTab>(
  JobsPageNotifier.new,
);

class NotificationsPageNotifier extends AutoDisposeAsyncNotifier<DaftarBertahap<DriverNotification>> {
  @override
  Future<DaftarBertahap<DriverNotification>> build() async {
    ref.watch(authProvider);
    final halaman =
        await ref.watch(driverRepositoryProvider).notificationsPage(page: 1, pageSize: ukuranHalaman);
    return gabungHalaman(
      const DaftarBertahap<DriverNotification>(),
      halaman,
      idOf: (n) => n.id,
      halaman: 1,
    );
  }

  Future<void> muatLagi() async {
    final kini = state.valueOrNull;
    if (kini == null || kini.memuatLagi || !kini.adaLagi) return;
    state = AsyncData(kini.salin(memuatLagi: true));
    final berikutnya = kini.halaman + 1;
    try {
      final halaman = await ref
          .read(driverRepositoryProvider)
          .notificationsPage(page: berikutnya, pageSize: ukuranHalaman);
      state = AsyncData(gabungHalaman(kini, halaman, idOf: (n) => n.id, halaman: berikutnya));
    } catch (_) {
      state = AsyncData(kini.salin(memuatLagi: false));
    }
  }
}

final notificationsPageProvider =
    AsyncNotifierProvider.autoDispose<NotificationsPageNotifier, DaftarBertahap<DriverNotification>>(
  NotificationsPageNotifier.new,
);
