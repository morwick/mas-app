import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../auth/auth_controller.dart';
import '../upload/upload_queue.dart';
import 'job_status.dart';
import 'models.dart';
import 'providers.dart';
import 'widgets/status_badge.dart';

enum _Filter {
  konfirmasi('Perlu dikonfirmasi'),
  aktif('Aktif'),
  selesai('Selesai');

  const _Filter(this.label);
  final String label;

  bool matches(Job j) => switch (this) {
        _Filter.konfirmasi => j.status == JobStatus.ditugaskan,
        _Filter.aktif => j.status.isActive && j.status != JobStatus.ditugaskan,
        _Filter.selesai => j.status.isClosed,
      };
}

/// Daftar job driver dengan filter (FR-MOBILE-03).
class JobsListScreen extends ConsumerStatefulWidget {
  const JobsListScreen({super.key});

  @override
  ConsumerState<JobsListScreen> createState() => _JobsListScreenState();
}

class _JobsListScreenState extends ConsumerState<JobsListScreen> {
  _Filter _filter = _Filter.aktif;
  bool _autoPicked = false;

  Future<void> _refresh() async {
    ref.invalidate(jobsProvider);
    ref.invalidate(notificationsProvider);
    await ref.read(jobsProvider.future);
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Keluar?'),
        content: const Text('Anda perlu login ulang untuk membuka aplikasi.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Keluar')),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(authProvider);
    final async = ref.watch(jobsProvider);
    final unread = ref.watch(unreadCountProvider);
    final failedUploads = ref.watch(uploadQueueProvider).where((t) => t.state == UploadState.failed).length;

    // Saat pertama dimuat, arahkan ke tab yang paling perlu perhatian.
    ref.listen(jobsProvider, (_, next) {
      final jobs = next.valueOrNull;
      if (jobs == null || _autoPicked) return;
      _autoPicked = true;
      if (jobs.any(_Filter.konfirmasi.matches)) {
        setState(() => _filter = _Filter.konfirmasi);
      } else if (!jobs.any(_Filter.aktif.matches) && jobs.isNotEmpty) {
        setState(() => _filter = _Filter.selesai);
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Job Saya', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            if (session != null)
              Text(session.nama, style: const TextStyle(fontSize: 12, color: MasColors.muted, fontWeight: FontWeight.w400)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Notifikasi',
            onPressed: () => context.push('/notifications'),
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text('$unread'),
              child: const Icon(Icons.notifications_outlined),
            ),
          ),
          IconButton(tooltip: 'Keluar', onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: Column(
        children: [
          if (failedUploads > 0)
            MaterialBanner(
              backgroundColor: MasColors.warningBg,
              content: Text('$failedUploads foto belum terkirim.', style: const TextStyle(color: MasColors.warning)),
              leading: const Icon(Icons.cloud_upload_outlined, color: MasColors.warning),
              actions: [
                TextButton(
                  onPressed: () => ref.read(uploadQueueProvider.notifier).retryAll(),
                  child: const Text('Kirim ulang'),
                ),
              ],
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: SegmentedButton<_Filter>(
              segments: [
                for (final f in _Filter.values)
                  ButtonSegment(
                    value: f,
                    label: Text(f.label, style: const TextStyle(fontSize: 12)),
                  ),
              ],
              selected: {_filter},
              showSelectedIcon: false,
              onSelectionChanged: (s) => setState(() => _filter = s.first),
            ),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorView(message: e.toString(), onRetry: _refresh),
              data: (jobs) {
                final list = jobs.where(_filter.matches).toList();
                return RefreshIndicator(
                  onRefresh: _refresh,
                  child: list.isEmpty
                      ? ListView(
                          children: const [
                            SizedBox(height: 80),
                            EmptyView(
                              icon: Icons.local_shipping_outlined,
                              title: 'Tidak ada job',
                              subtitle: 'Tarik ke bawah untuk memuat ulang.',
                            ),
                          ],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                          itemCount: list.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 10),
                          itemBuilder: (_, i) => _JobTile(job: list[i]),
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _JobTile extends StatelessWidget {
  const _JobTile({required this.job});
  final Job job;

  @override
  Widget build(BuildContext context) {
    final needsAction = job.status == JobStatus.ditugaskan;
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: needsAction ? MasColors.brand : Colors.black.withValues(alpha: 0.10),
          width: needsAction ? 1.5 : 0.5,
        ),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/jobs/${job.id}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(job.jobNumber, style: const TextStyle(fontSize: 12, color: MasColors.muted, fontWeight: FontWeight.w600)),
                  ),
                  StatusBadge(job.status, small: true),
                ],
              ),
              const SizedBox(height: 6),
              Text(job.customerNama, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              Text(job.alatDiangkut, style: const TextStyle(fontSize: 13, color: MasColors.muted)),
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.route, size: 16, color: MasColors.brand),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text('${job.asal} → ${job.tujuan}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  const Icon(Icons.schedule, size: 16, color: MasColors.subtle),
                  const SizedBox(width: 6),
                  Text(formatDateTime(job.etd), style: const TextStyle(fontSize: 13, color: MasColors.muted)),
                  const Spacer(),
                  if (needsAction)
                    const Text('Geser untuk terima ›', style: TextStyle(fontSize: 12, color: MasColors.brand, fontWeight: FontWeight.w700)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
