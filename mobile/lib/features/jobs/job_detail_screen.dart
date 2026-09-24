import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/maps.dart';

import '../../core/api_client.dart';
import '../../core/formatters.dart';
import '../../core/widgets.dart';
import '../../core/theme.dart';
import '../camera/photo_capture.dart';
import '../upload/upload_queue.dart';
import 'job_status.dart';
import 'models.dart';
import 'providers.dart';
import 'widgets/photo_slot_card.dart';
import 'widgets/status_badge.dart';
import 'widgets/swipe_to_accept.dart';
import 'widgets/uang_jalan_card.dart';

/// Detail job dengan langkah aktif yang ditonjolkan (FR-MOBILE-03/06).
/// Apakah kartu detail job ditampilkan terbuka.
///
/// [pilihanDriver] null berarti ikut otomatis: begitu ada tahap foto yang
/// terbuka (muat/bongkar), detail dilipat supaya daftar foto yang harus diambil
/// langsung terlihat tanpa menggulir. Sekali driver melipat atau membukanya
/// sendiri, pilihannya yang menang sampai layar ditinggalkan.
bool detailJobTerbuka({required bool? pilihanDriver, required PhotoStage? tahapFoto}) =>
    pilihanDriver ?? tahapFoto == null;

class JobDetailScreen extends ConsumerStatefulWidget {
  const JobDetailScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends ConsumerState<JobDetailScreen> {
  bool _busy = false;

  Future<void> _refresh() async {
    refreshJobDataFromWidget(ref, widget.jobId);
    await ref.read(jobProvider(widget.jobId).future);
  }

  void _toast(String msg, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg), backgroundColor: error ? MasColors.danger : null));
  }

  Future<void> _run(Future<void> Function() action, {String? success}) async {
    setState(() => _busy = true);
    try {
      await action();
      refreshJobDataFromWidget(ref, widget.jobId);
      if (success != null) _toast(success);
    } on ApiException catch (e) {
      _toast(e.message, error: true);
    } catch (_) {
      _toast('Terjadi kesalahan, coba lagi.', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _accept() => _run(
    () => ref.read(driverRepositoryProvider).accept(widget.jobId),
    success: 'Pekerjaan diterima. Ajukan uang jalan bila diperlukan.',
  );

  Future<void> _advance(Job job) async {
    final next = job.status.nextDriverStatus;
    if (next == null) return;
    final isFinish = next == JobStatus.menungguValidasi;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isFinish ? 'Selesaikan orderan?' : 'Lanjut ke ${next.label}?'),
        content: Text(
          isFinish
              ? 'Pastikan dokumen fisik sudah diserahkan ke Mandor dan semua foto lengkap. '
                    'Job akan diperiksa admin sebelum dinyatakan selesai.'
              : 'Status job akan diubah menjadi "${next.label}".',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(isFinish ? 'Selesaikan' : 'Lanjut')),
        ],
      ),
    );
    if (ok != true) return;
    await _run(
      () => ref.read(driverRepositoryProvider).updateStatus(widget.jobId, next),
      success: isFinish ? 'Orderan dikirim untuk validasi admin.' : 'Status diperbarui: ${next.label}',
    );
  }

  Future<void> _capture(Job job, PhotoStage stage, PhotoSlot slot) async {
    final photo = await PhotoCapture.capture(context, slot: slot);
    if (photo == null) return;
    ref.read(uploadQueueProvider.notifier).enqueue(jobId: job.id, stage: stage, slot: slot, photo: photo);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(jobProvider(widget.jobId));
    return Scaffold(
      appBar: AppBar(
        title: Text(async.valueOrNull?.jobNumber ?? 'Detail Job'),
        actions: [IconButton(onPressed: _refresh, icon: const Icon(Icons.refresh))],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorView(message: e.toString(), onRetry: _refresh),
        data: (job) => RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(padding: const EdgeInsets.fromLTRB(16, 12, 16, 32), children: _sections(job)),
        ),
      ),
    );
  }

  /// null = ikut otomatis (tertutup saat ada tahap foto terbuka). Begitu driver
  /// melipat/membukanya sendiri, pilihannya yang dipakai.
  bool? _detailExpanded;

  List<Widget> _sections(Job job) {
    final status = job.status;
    final stage = status.openPhotoStage;
    final queue = ref.watch(uploadQueueProvider);
    final uploadingCount = queue.where((t) => t.jobId == job.id && t.isPending).length;

    return [
      _HeaderCard(
        job: job,
        // Saat muat/bongkar detail dilipat sendiri supaya daftar foto yang
        // harus diambil langsung terlihat tanpa menggulir.
        expanded: detailJobTerbuka(pilihanDriver: _detailExpanded, tahapFoto: stage),
        onToggle: () => setState(
          () => _detailExpanded = !detailJobTerbuka(pilihanDriver: _detailExpanded, tahapFoto: stage),
        ),
      ),
      if (job.validationNote != null && job.validationNote!.isNotEmpty && !status.isClosed) ...[
        const SizedBox(height: 12),
        _Banner(
          icon: Icons.assignment_return_outlined,
          color: MasColors.warning,
          bg: MasColors.warningBg,
          title: 'Dikembalikan oleh admin',
          text: job.validationNote!,
        ),
      ],
      const SizedBox(height: 12),
      _Stepper(status: status),
      const SizedBox(height: 12),
      if (status == JobStatus.ditugaskan) ...[
        SwipeToAccept(onAccepted: _accept, busy: _busy),
        const SizedBox(height: 12),
      ],
      if (status == JobStatus.cancelled)
        _Banner(
          icon: Icons.cancel_outlined,
          color: MasColors.danger,
          bg: MasColors.dangerBg,
          title: 'Job dibatalkan',
          text: job.cancelledReason ?? 'Dibatalkan oleh admin.',
        )
      else if (status == JobStatus.selesai)
        _Banner(
          icon: Icons.verified_outlined,
          color: MasColors.brand,
          bg: MasColors.brandLight,
          title: 'Job selesai & tervalidasi',
          text: 'Divalidasi ${formatDateTime(job.validatedAt ?? job.completedAt)}. Terima kasih!',
        )
      else if (status == JobStatus.menungguValidasi)
        const _Banner(
          icon: Icons.fact_check_outlined,
          color: MasColors.warning,
          bg: MasColors.warningBg,
          title: 'Menunggu validasi admin',
          text: 'Admin sedang memeriksa foto dan data job. Status Anda masih In Job sampai admin menyetujui.',
        ),
      if (!status.isClosed) ...[const SizedBox(height: 12), UangJalanCard(job: job)],
      if (stage != null) ...[
        const SizedBox(height: 16),
        _SectionTitle(
          'Foto ${stage.label.toLowerCase()}',
          trailing: '${stage.requiredSlots.length - job.missingSlots(stage).length}/${stage.requiredSlots.length}',
        ),
        const SizedBox(height: 4),
        const Text(
          'Ambil dari kamera. Foto distempel tanggal, jam, dan lokasi.',
          style: TextStyle(fontSize: 12, color: MasColors.muted),
        ),
        const SizedBox(height: 8),
        for (final slot in stage.requiredSlots) ...[
          PhotoSlotCard(
            slot: slot,
            photo: job.photosByStage(stage)[slot],
            task: ref.read(uploadQueueProvider.notifier).taskFor(job.id, stage, slot),
            enabled: !_busy,
            onCapture: () => _capture(job, stage, slot),
            onRetry: () {
              final t = ref.read(uploadQueueProvider.notifier).taskFor(job.id, stage, slot);
              if (t != null) ref.read(uploadQueueProvider.notifier).retry(t.id);
            },
            onRemoveTask: () {
              final t = ref.read(uploadQueueProvider.notifier).taskFor(job.id, stage, slot);
              if (t != null) ref.read(uploadQueueProvider.notifier).remove(t.id);
            },
          ),
          const SizedBox(height: 8),
        ],
      ],
      if (status.nextDriverStatus != null) ...[
        const SizedBox(height: 12),
        _AdvanceButton(job: job, busy: _busy, uploadingCount: uploadingCount, onPressed: () => _advance(job)),
      ],
      if (status == JobStatus.dalamPerjalanan) ...[
        const SizedBox(height: 8),
        const Text(
          'Foto bongkar bisa diambil setelah menekan "Tiba di tujuan".',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: MasColors.muted),
        ),
      ],
      if (status == JobStatus.diterima) ...[
        const SizedBox(height: 8),
        const Text(
          'Foto muat bisa diambil setelah menekan "Tiba di lokasi muat".',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: MasColors.muted),
        ),
      ],
    ];
  }
}

/// Tombol lanjut — aktif hanya bila syarat terpenuhi; alasan kunci ditampilkan.
class _AdvanceButton extends ConsumerWidget {
  const _AdvanceButton({required this.job, required this.busy, required this.uploadingCount, required this.onPressed});

  final Job job;
  final bool busy;
  final int uploadingCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = job.status;
    final posisi = ref.watch(jobUangJalanProvider(job.id)).valueOrNull?.posisi;
    final stage = status.openPhotoStage;
    final missing = stage == null ? const <PhotoSlot>[] : job.missingSlots(stage);

    String? reason;
    if (!job.isAccepted) {
      reason = 'Terima pekerjaan dulu.';
    } else if (status == JobStatus.diterima && (posisi == null || !posisi.adaBukti || posisi.pendingRequest)) {
      // BR-02: kunci uang jalan sebelum tahap muat.
      reason = lockMessageUangJalan;
    } else if (posisi != null && posisi.pendingRequest) {
      reason = lockMessageUangJalan;
    } else if (uploadingCount > 0) {
      reason = 'Tunggu $uploadingCount foto selesai diunggah.';
    } else if (stage != null && missing.isNotEmpty) {
      reason = 'Lengkapi ${missing.length} foto ${stage.label.toLowerCase()} dulu.';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton.icon(
          onPressed: reason == null && !busy ? onPressed : null,
          icon: Icon(status.nextDriverStatus == JobStatus.menungguValidasi ? Icons.task_alt : Icons.arrow_forward),
          label: Text(status.advanceLabel ?? 'Lanjut'),
        ),
        if (reason != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock_outline, size: 14, color: MasColors.muted),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    reason,
                    style: const TextStyle(fontSize: 12, color: MasColors.muted),
                    textAlign: TextAlign.center,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.job, required this.expanded, required this.onToggle});

  final Job job;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            button: true,
            label: expanded ? 'Tutup detail job' : 'Buka detail job',
            child: InkWell(
              onTap: onToggle,
              child: Padding(
                padding: EdgeInsets.fromLTRB(14, 14, 8, expanded ? 0 : 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  job.customerNama,
                                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                                ),
                              ),
                              StatusBadge(job.status),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(job.alatDiangkut, style: const TextStyle(color: MasColors.muted)),
                          // Rute ringkas menggantikan blok asal/tujuan saat
                          // dilipat — driver tetap tahu ini job yang mana.
                          if (!expanded) ...[
                            const SizedBox(height: 6),
                            Row(
                              children: [
                                const Icon(Icons.alt_route, size: 13, color: MasColors.subtle),
                                const SizedBox(width: 5),
                                // Asal & tujuan dapat jatah lebar yang sama.
                                // Digabung jadi satu teks, nama tempat yang
                                // panjang menelan seluruh baris dan tujuannya
                                // ikut terpotong — padahal itu yang dicari.
                                Expanded(
                                  child: Text(
                                    job.asal,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 12.5, color: MasColors.muted),
                                  ),
                                ),
                                const Padding(
                                  padding: EdgeInsets.symmetric(horizontal: 4),
                                  child: Text('→', style: TextStyle(fontSize: 12.5, color: MasColors.subtle)),
                                ),
                                Expanded(
                                  child: Text(
                                    job.tujuan,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(fontSize: 12.5, color: MasColors.muted),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    Icon(expanded ? Icons.expand_less : Icons.expand_more, size: 22, color: MasColors.muted),
                  ],
                ),
              ),
            ),
          ),
          if (expanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Divider(height: 20),
                  _Place(
                    icon: Icons.trip_origin,
                    label: 'Asal',
                    value: job.asal,
                    lat: job.asalLat,
                    lng: job.asalLng,
                  ),
                  const SizedBox(height: 8),
                  _Place(
                    icon: Icons.location_on,
                    label: 'Tujuan',
                    value: job.tujuan,
                    lat: job.tujuanLat,
                    lng: job.tujuanLng,
                  ),
                  const Divider(height: 20),
                  _Info('Berangkat', formatDateTime(job.etd)),
                  _Info(
                    'Estimasi sampai',
                    job.eta == null ? '-' : '${formatDateTime(job.eta)}${job.etaIsEstimated ? ' (estimasi)' : ''}',
                  ),
                  if (job.routeDistanceKm != null) _Info('Jarak', '${job.routeDistanceKm!.toStringAsFixed(0)} km'),
                  if (job.unitKode != null)
                    _Info('Unit', '${job.unitKode}${job.unitNoPolisi != null ? ' • ${job.unitNoPolisi}' : ''}'),
                  if (job.picNama != null && job.picNama!.isNotEmpty)
                    Row(
                      children: [
                        Expanded(child: _Info('PIC lapangan', job.picNama!)),
                        if (job.picNoHp != null && job.picNoHp!.isNotEmpty)
                          IconButton(
                            tooltip: 'Telepon PIC',
                            onPressed: () => launchUrl(Uri(scheme: 'tel', path: job.picNoHp)),
                            icon: const Icon(Icons.call, color: MasColors.brand),
                          ),
                      ],
                    ),
                  if (job.catatan != null && job.catatan!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: MasColors.page, borderRadius: BorderRadius.circular(8)),
                      child: Text('Catatan admin: ${job.catatan}', style: const TextStyle(fontSize: 13)),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.status});
  final JobStatus status;

  @override
  Widget build(BuildContext context) {
    if (status == JobStatus.cancelled) return const SizedBox.shrink();
    final current = driverSteps.indexOf(status);
    return SizedBox(
      height: 64,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: driverSteps.length,
        separatorBuilder: (_, _) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final s = driverSteps[i];
          final done = i < current;
          final active = i == current;
          final color = done || active ? MasColors.brand : MasColors.subtle;
          return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? MasColors.brand : Colors.white,
                  border: Border.all(color: color, width: active ? 2.5 : 1.5),
                ),
                child: done
                    ? const Icon(Icons.check, size: 16, color: Colors.white)
                    : Center(
                        child: Text(
                          '${i + 1}',
                          style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w700),
                        ),
                      ),
              ),
              const SizedBox(height: 4),
              Text(
                s.label,
                style: TextStyle(fontSize: 10, color: color, fontWeight: active ? FontWeight.w700 : FontWeight.w500),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Place extends StatelessWidget {
  const _Place({required this.icon, required this.label, required this.value, this.lat, this.lng});

  final IconData icon;
  final String label;
  final String value;
  final double? lat;
  final double? lng;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 18, color: MasColors.brand),
      const SizedBox(width: 8),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 11, color: MasColors.subtle)),
            Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          ],
        ),
      ),
      // Disembunyikan kalau tempatnya tidak bisa dituju sama sekali — tidak ada
      // titik pin maupun nama yang bisa dicari Maps.
      if (rutePetaUri(lat: lat, lng: lng, alamat: value).isNotEmpty) ...[
        const SizedBox(width: 6),
        TextButton.icon(
          onPressed: () => _bukaRute(context),
          icon: const Icon(Icons.directions_outlined, size: 16),
          label: const Text('Rute', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
          style: TextButton.styleFrom(
            foregroundColor: MasColors.brandDark,
            minimumSize: const Size(0, 32),
            padding: const EdgeInsets.symmetric(horizontal: 8),
            visualDensity: VisualDensity.compact,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ),
      ],
    ],
  );

  Future<void> _bukaRute(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final ok = await bukaRutePeta(lat: lat, lng: lng, alamat: value);
    if (!ok) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Google Maps tidak bisa dibuka di perangkat ini.')),
      );
    }
  }
}

class _Info extends StatelessWidget {
  const _Info(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 110,
          child: Text(label, style: const TextStyle(fontSize: 13, color: MasColors.muted)),
        ),
        Expanded(
          child: Text(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
        ),
      ],
    ),
  );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text, {this.trailing});
  final String text;
  final String? trailing;

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Expanded(
        child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      ),
      if (trailing != null)
        Text(
          trailing!,
          style: const TextStyle(color: MasColors.muted, fontWeight: FontWeight.w600),
        ),
    ],
  );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.color, required this.bg, required this.title, required this.text});
  final IconData icon;
  final Color color;
  final Color bg;
  final String title;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: color),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(color: color, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 2),
              Text(text, style: TextStyle(color: color, fontSize: 13)),
            ],
          ),
        ),
      ],
    ),
  );
}
