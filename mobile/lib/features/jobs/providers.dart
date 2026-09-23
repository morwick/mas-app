import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import 'models.dart';
import 'repository.dart';

final driverRepositoryProvider = Provider<DriverRepository>(
  (ref) => DriverRepository(ref.watch(apiClientProvider)),
);

final jobsProvider = FutureProvider.autoDispose<List<Job>>((ref) {
  ref.watch(authProvider); // muat ulang saat sesi berganti
  return ref.watch(driverRepositoryProvider).jobs();
});

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
void refreshJobData(Ref ref, String jobId) {
  ref.invalidate(jobProvider(jobId));
  ref.invalidate(jobUangJalanProvider(jobId));
  ref.invalidate(jobsProvider);
}

/// Versi untuk widget (`WidgetRef`).
void refreshJobDataFromWidget(WidgetRef ref, String jobId) {
  ref.invalidate(jobProvider(jobId));
  ref.invalidate(jobUangJalanProvider(jobId));
  ref.invalidate(jobsProvider);
}
