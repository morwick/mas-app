import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/lonceng_notifikasi.dart';
import '../../core/formatters.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../../core/widgets_paging.dart';
import '../auth/auth_controller.dart';
import '../upload/upload_queue.dart';
import 'job_status.dart';
import 'models.dart';
import 'providers.dart';
import 'widgets/status_badge.dart';

/// Daftar job driver dengan filter (FR-MOBILE-03).
class JobsListScreen extends ConsumerStatefulWidget {
  const JobsListScreen({super.key});

  @override
  ConsumerState<JobsListScreen> createState() => _JobsListScreenState();
}

class _JobsListScreenState extends ConsumerState<JobsListScreen> {
  JobTab _filter = JobTab.aktif;
  bool _autoPicked = false;

  Future<void> _refresh() async {
    ref.invalidate(jobsPageProvider(_filter));
    refreshNotifikasiFromWidget(ref);
    await ref.read(jobsPageProvider(_filter).future);
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
    final async = ref.watch(jobsPageProvider(_filter));
    final unread = ref.watch(unreadCountProvider);
    final failedUploads = ref.watch(uploadQueueProvider).where((t) => t.state == UploadState.failed).length;

    // Saat pertama dimuat, arahkan ke tab yang paling perlu perhatian.
    // Tab dipilihkan dari `total` masing-masing, bukan dari seluruh job yang
    // diunduh: job yang perlu dikonfirmasi paling mendesak, kalau tidak ada dan
    // tak ada pula yang aktif, yang berguna tinggal riwayat.
    final perluKonfirmasi = ref.watch(jobsPageProvider(JobTab.konfirmasi)).valueOrNull;
    final aktif = ref.watch(jobsPageProvider(JobTab.aktif)).valueOrNull;
    if (!_autoPicked && perluKonfirmasi != null && aktif != null) {
      _autoPicked = true;
      final pilihan = perluKonfirmasi.total > 0
          ? JobTab.konfirmasi
          : (aktif.total == 0 ? JobTab.selesai : JobTab.aktif);
      if (pilihan != _filter) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _filter = pilihan);
        });
      }
    }

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
            // Bergoyang selama masih ada notifikasi belum dibaca.
            icon: LoncengNotifikasi(belumDibaca: unread),
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
            child: SegmentedButton<JobTab>(
              segments: [
                for (final f in JobTab.values)
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
              data: (daftar) => RefreshIndicator(
                onRefresh: _refresh,
                child: daftar.kosong
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
                    : DaftarBergulirBertahap<Job>(
                        daftar: daftar,
                        onMuatLagi: () =>
                            ref.read(jobsPageProvider(_filter).notifier).muatLagi(),
                        itemBuilder: (_, job) => _JobTile(job: job),
                      ),
              ),
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
