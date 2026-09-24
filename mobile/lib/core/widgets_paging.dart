import 'package:flutter/material.dart';

import 'paging.dart';
import 'theme.dart';

/// `ListView` yang meminta halaman berikutnya saat gulirnya mendekati dasar.
///
/// Ambangnya 400 px — kira-kira dua kartu sebelum habis — supaya halaman
/// berikutnya sudah tiba sebelum driver menyentuh dasar dan daftarnya tidak
/// pernah terlihat berhenti.
class DaftarBergulirBertahap<T> extends StatelessWidget {
  const DaftarBergulirBertahap({
    super.key,
    required this.daftar,
    required this.onMuatLagi,
    required this.itemBuilder,
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 24),
    this.separator,
  });

  final DaftarBertahap<T> daftar;
  final Future<void> Function() onMuatLagi;
  final Widget Function(BuildContext, T) itemBuilder;
  final EdgeInsets padding;
  final Widget? separator;

  static const _ambangPx = 400.0;

  @override
  Widget build(BuildContext context) {
    // Satu baris ekstra di kaki daftar untuk indikator / penutup.
    final jumlah = daftar.items.length + (daftar.adaLagi ? 1 : 0);

    return NotificationListener<ScrollNotification>(
      onNotification: (n) {
        if (n.metrics.axis != Axis.vertical) return false;
        final sisa = n.metrics.maxScrollExtent - n.metrics.pixels;
        if (sisa <= _ambangPx && daftar.adaLagi && !daftar.memuatLagi) {
          onMuatLagi();
        }
        return false;
      },
      child: ListView.separated(
        padding: padding,
        itemCount: jumlah,
        separatorBuilder: (_, _) => separator ?? const SizedBox(height: 10),
        itemBuilder: (context, i) {
          if (i < daftar.items.length) return itemBuilder(context, daftar.items[i]);
          return const _KakiMemuat();
        },
      ),
    );
  }
}

class _KakiMemuat extends StatelessWidget {
  const _KakiMemuat();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.symmetric(vertical: 18),
    child: Center(
      child: SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(strokeWidth: 2.2, color: MasColors.subtle),
      ),
    ),
  );
}
