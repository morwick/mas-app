import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api_client.dart';
import '../../../core/formatters.dart';
import '../../../core/theme.dart';
import '../job_status.dart';
import '../models.dart';
import '../providers.dart';

/// Kartu uang jalan: pagu, sudah cair, sisa, pengajuan menunggu, dan tombol
/// **Ajukan Uang Jalan** (FR-UJ-02/03).
class UangJalanCard extends ConsumerWidget {
  const UangJalanCard({super.key, required this.job});

  final Job job;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(jobUangJalanProvider(job.id));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: async.when(
          loading: () => const Center(child: Padding(padding: EdgeInsets.all(8), child: CircularProgressIndicator(strokeWidth: 2))),
          error: (e, _) => Text('Uang jalan tidak bisa dimuat: $e', style: const TextStyle(color: MasColors.danger)),
          data: (uj) => _Body(job: job, data: uj),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.job, required this.data});

  final Job job;
  final JobUangJalan data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final posisi = data.posisi;
    final pending = data.pending;
    final status = job.status;
    final canAsk = status != JobStatus.ditugaskan && !status.isClosed && status != JobStatus.menungguValidasi;
    final enabled = canAsk && posisi != null && posisi.canRequest;

    String? hint;
    if (status == JobStatus.ditugaskan) {
      hint = 'Terima pekerjaan dulu untuk mengajukan uang jalan.';
    } else if (pending != null) {
      hint = 'Pengajuan ${formatRupiah(pending.nominal)} menunggu pencairan admin.';
    } else if (posisi != null && posisi.sisa <= 0) {
      hint = 'Pagu uang jalan sudah cair seluruhnya.';
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Row(
          children: [
            Icon(Icons.account_balance_wallet_outlined, size: 20, color: MasColors.brandDark),
            SizedBox(width: 8),
            Text('Uang jalan', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
          ],
        ),
        const SizedBox(height: 10),
        if (posisi != null) ...[
          _Row('Pagu job', formatRupiah(posisi.pagu)),
          _Row('Sudah diterima', formatRupiah(posisi.cair)),
          _Row('Sisa pagu', formatRupiah(posisi.sisa), bold: true),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: posisi.pagu > 0 ? (posisi.cair / posisi.pagu).clamp(0.0, 1.0) : 0,
              minHeight: 6,
              backgroundColor: MasColors.page,
            ),
          ),
        ],
        if (pending != null) ...[
          const SizedBox(height: 10),
          _Notice(
            icon: Icons.hourglass_top,
            color: MasColors.warning,
            bg: MasColors.warningBg,
            text: 'Pengajuan ${formatRupiah(pending.nominal)} (${formatRelative(pending.requestedAt)}) '
                'menunggu bukti transfer dari admin.',
          ),
        ] else if (posisi != null && !posisi.adaBukti && status == JobStatus.diterima) ...[
          const SizedBox(height: 10),
          const _Notice(
            icon: Icons.lock_outline,
            color: MasColors.info,
            bg: MasColors.infoBg,
            text: 'Tahap muat terkunci sampai ada pencairan uang jalan pertama yang berbukti.',
          ),
        ],
        if (data.transaksi.any((t) => t.isPencairan)) ...[
          const SizedBox(height: 10),
          const Text('Pencairan', style: TextStyle(fontSize: 12, color: MasColors.muted, fontWeight: FontWeight.w600)),
          for (final t in data.transaksi.where((t) => t.isPencairan))
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                children: [
                  Icon(
                    t.buktiTransferUrl != null ? Icons.receipt_long : Icons.receipt_long_outlined,
                    size: 16,
                    color: t.buktiTransferUrl != null ? MasColors.brand : MasColors.subtle,
                  ),
                  const SizedBox(width: 6),
                  Expanded(child: Text(formatDate(t.tanggal), style: const TextStyle(fontSize: 13))),
                  Text(formatRupiah(t.jumlah), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
        ],
        for (final r in data.pengajuan.where((r) => r.status == RequestStatus.ditolak).take(1))
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: _Notice(
              icon: Icons.cancel_outlined,
              color: MasColors.danger,
              bg: MasColors.dangerBg,
              text: 'Pengajuan ${formatRupiah(r.nominal)} ditolak'
                  '${r.alasanTolak == null || r.alasanTolak!.isEmpty ? '.' : ': ${r.alasanTolak}'}',
            ),
          ),
        if (!status.isClosed && status != JobStatus.menungguValidasi) ...[
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: enabled ? () => _openSheet(context, ref, posisi) : null,
            icon: const Icon(Icons.send_outlined, size: 18),
            label: const Text('Ajukan Uang Jalan'),
          ),
          if (hint != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(hint, style: const TextStyle(fontSize: 12, color: MasColors.muted), textAlign: TextAlign.center),
            ),
        ],
      ],
    );
  }

  Future<void> _openSheet(BuildContext context, WidgetRef ref, UangJalanPosisi posisi) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => AjukanUangJalanSheet(jobId: job.id, sisa: posisi.sisa),
    );
    if (ok == true && context.mounted) {
      refreshJobDataFromWidget(ref, job.id);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Pengajuan uang jalan terkirim. Menunggu admin mengunggah bukti transfer.')),
      );
    }
  }
}

/// Lembar isi nominal (≤ sisa pagu) + catatan, lalu alert konfirmasi persis
/// sesuai PRD sebelum dikirim.
class AjukanUangJalanSheet extends ConsumerStatefulWidget {
  const AjukanUangJalanSheet({super.key, required this.jobId, required this.sisa});

  final String jobId;
  final double sisa;

  @override
  ConsumerState<AjukanUangJalanSheet> createState() => _AjukanUangJalanSheetState();
}

class _AjukanUangJalanSheetState extends ConsumerState<AjukanUangJalanSheet> {
  final _formKey = GlobalKey<FormState>();
  final _nominal = TextEditingController();
  final _catatan = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _nominal.dispose();
    _catatan.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final nominal = parseRupiah(_nominal.text)!;

    final yakin = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Ajukan uang jalan'),
        content: const Text(ajukanUangJalanAlert),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Ya, ajukan')),
        ],
      ),
    );
    if (yakin != true || !mounted) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(driverRepositoryProvider).ajukanUangJalan(
            widget.jobId,
            nominal: nominal,
            catatan: _catatan.text,
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } catch (_) {
      setState(() => _error = 'Terjadi kesalahan, coba lagi.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.of(context).viewInsets.bottom),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Ajukan Uang Jalan', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('Sisa pagu: ${formatRupiah(widget.sisa)}', style: const TextStyle(color: MasColors.muted)),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nominal,
              autofocus: true,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly, _RupiahFormatter()],
              decoration: const InputDecoration(labelText: 'Nominal (Rp)', prefixText: 'Rp '),
              validator: (v) {
                final n = parseRupiah(v ?? '');
                if (n == null || n <= 0) return 'Nominal wajib diisi';
                if (n > widget.sisa) return 'Melebihi sisa pagu (${formatRupiah(widget.sisa)})';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _catatan,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Catatan (opsional)', hintText: 'Mis. solar + tol'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: const TextStyle(color: MasColors.danger)),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Ajukan'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Menampilkan pemisah ribuan saat mengetik ("1.500.000").
class _RupiahFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final n = parseRupiah(newValue.text);
    if (n == null) return newValue.copyWith(text: '');
    final text = formatRupiah(n).replaceFirst('Rp ', '');
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value, {this.bold = false});
  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          children: [
            Expanded(child: Text(label, style: const TextStyle(color: MasColors.muted, fontSize: 13))),
            Text(value, style: TextStyle(fontWeight: bold ? FontWeight.w700 : FontWeight.w500, fontSize: 13)),
          ],
        ),
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.icon, required this.color, required this.bg, required this.text});
  final IconData icon;
  final Color color;
  final Color bg;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(text, style: TextStyle(color: color, fontSize: 13))),
          ],
        ),
      );
}
