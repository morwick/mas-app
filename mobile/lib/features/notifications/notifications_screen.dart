import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../core/widgets_paging.dart';
import '../jobs/models.dart';
import '../jobs/providers.dart';

/// Daftar notifikasi driver (FR-NOTIF-02): job baru, bukti transfer,
/// job dikembalikan, job divalidasi.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  /// Jenis notifikasi driver (lihat migrasi alur job v2): job_baru,
  /// bukti_transfer, job_dikembalikan, job_divalidasi, job_dibatalkan,
  /// uang_jalan_ditolak.
  IconData _icon(String kind) => switch (kind) {
        'bukti_transfer' || 'uang_jalan_ditolak' => Icons.account_balance_wallet_outlined,
        'job_dikembalikan' => Icons.assignment_return_outlined,
        'job_divalidasi' => Icons.verified_outlined,
        'job_dibatalkan' => Icons.cancel_outlined,
        _ => Icons.local_shipping_outlined,
      };

  Future<void> _open(BuildContext context, WidgetRef ref, DriverNotification n) async {
    if (n.isUnread) {
      try {
        await ref.read(driverRepositoryProvider).markRead([n.id]);
        refreshNotifikasiFromWidget(ref);
      } catch (_) {}
    }
    if (n.jobId != null && context.mounted) context.push('/jobs/${n.jobId}');
  }

  Future<void> _markAll(BuildContext context, WidgetRef ref, List<DriverNotification> items) async {
    final ids = items.where((n) => n.isUnread).map((n) => n.id).toList();
    if (ids.isEmpty) return;
    try {
      await ref.read(driverRepositoryProvider).markRead(ids);
      refreshNotifikasiFromWidget(ref);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gagal menandai dibaca')));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsPageProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifikasi'),
        actions: [
          // Hanya yang sudah termuat yang bisa ditandai — menandai baris yang
          // belum pernah diunduh berarti menebak.
          if ((async.valueOrNull?.items.any((n) => n.isUnread)) ?? false)
            TextButton(
              onPressed: () => _markAll(context, ref, async.valueOrNull?.items ?? const []),
              child: const Text('Tandai semua dibaca'),
            ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            ErrorView(message: e.toString(), onRetry: () => ref.invalidate(notificationsPageProvider)),
        data: (daftar) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(notificationsPageProvider);
            await ref.read(notificationsPageProvider.future);
          },
          child: daftar.kosong
              ? ListView(
                  children: const [
                    SizedBox(height: 80),
                    EmptyView(icon: Icons.notifications_none, title: 'Belum ada notifikasi'),
                  ],
                )
              : DaftarBergulirBertahap<DriverNotification>(
                  daftar: daftar,
                  onMuatLagi: () => ref.read(notificationsPageProvider.notifier).muatLagi(),
                  padding: EdgeInsets.zero,
                  separator: const Divider(height: 1),
                  itemBuilder: (_, n) {
                    return ListTile(
                      tileColor: n.isUnread ? MasColors.brandLight.withValues(alpha: 0.5) : Colors.white,
                      leading: CircleAvatar(
                        backgroundColor: n.isUnread ? MasColors.brand : MasColors.page,
                        foregroundColor: n.isUnread ? Colors.white : MasColors.muted,
                        child: Icon(_icon(n.kind), size: 20),
                      ),
                      title: Text(n.title, style: TextStyle(fontWeight: n.isUnread ? FontWeight.w700 : FontWeight.w500)),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(n.body),
                          const SizedBox(height: 2),
                          Text(formatRelative(n.createdAt), style: const TextStyle(fontSize: 11, color: MasColors.subtle)),
                        ],
                      ),
                      isThreeLine: true,
                      onTap: () => _open(context, ref, n),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
