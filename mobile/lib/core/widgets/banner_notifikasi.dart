import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme.dart';

/// Isi satu notifikasi yang masuk saat aplikasi terbuka.
class NotifikasiMasuk {
  const NotifikasiMasuk({required this.judul, required this.isi, required this.data});

  final String judul;
  final String isi;
  final Map<String, dynamic> data;
}

/// Banner melayang di atas layar untuk notifikasi yang masuk saat aplikasi
/// terbuka — turun dari atas disertai getaran singkat, bisa diketuk untuk
/// membuka, digeser ke atas / ditutup, dan hilang sendiri setelah beberapa
/// detik. Dipasang sekali di atas seluruh halaman (MaterialApp.builder).
class BannerNotifikasi extends StatefulWidget {
  const BannerNotifikasi({
    super.key,
    required this.masuk,
    required this.onBuka,
    required this.child,
  });

  /// Aliran notifikasi yang masuk saat aplikasi terbuka.
  final Stream<NotifikasiMasuk> masuk;

  /// Banner diketuk.
  final void Function(NotifikasiMasuk n) onBuka;

  final Widget child;

  @override
  State<BannerNotifikasi> createState() => _BannerNotifikasiState();
}

class _BannerNotifikasiState extends State<BannerNotifikasi> {
  static const _lama = Duration(seconds: 6);

  StreamSubscription<NotifikasiMasuk>? _sub;
  NotifikasiMasuk? _aktif;
  bool _tampil = false;
  Timer? _timer;

  /// Banner dipasang di MaterialApp.builder — DI ATAS Navigator, jadi tidak
  /// ada Overlay dari aplikasi. Widget Material tertentu (Tooltip, efek
  /// sentuh, seleksi teks, dll.) wajib punya Overlay → "No Overlay widget
  /// found". Karena itu banner punya Overlay sendiri.
  late final OverlayEntry _entry = OverlayEntry(builder: _bangunBanner);

  @override
  void initState() {
    super.initState();
    _sub = widget.masuk.listen(_terima);
  }

  void _terima(NotifikasiMasuk n) {
    HapticFeedback.heavyImpact();
    _timer?.cancel();
    setState(() {
      _aktif = n;
      _tampil = true;
    });
    _entry.markNeedsBuild();
    _timer = Timer(_lama, _tutup);
  }

  void _tutup() {
    _timer?.cancel();
    if (!mounted) return;
    setState(() => _tampil = false);
    _entry.markNeedsBuild();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        // Area kosong Overlay tidak menangkap sentuhan — halaman di bawahnya
        // tetap bisa dipakai; hanya banner yang menerima ketukan.
        Positioned.fill(child: Overlay(initialEntries: [_entry])),
      ],
    );
  }

  Widget _bangunBanner(BuildContext context) {
    final n = _aktif;
    return Stack(
      children: [
        if (n != null)
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              bottom: false,
              child: AnimatedSlide(
                offset: _tampil ? Offset.zero : const Offset(0, -1.4),
                duration: const Duration(milliseconds: 280),
                curve: Curves.easeOutCubic,
                child: AnimatedOpacity(
                  opacity: _tampil ? 1 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: IgnorePointer(
                    ignoring: !_tampil,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                      child: GestureDetector(
                        // Geser ke atas untuk menutup.
                        onVerticalDragEnd: (d) {
                          if ((d.primaryVelocity ?? 0) < 0) _tutup();
                        },
                        child: Material(
                          key: const Key('banner-notifikasi'),
                          elevation: 8,
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(14),
                            onTap: () {
                              _tutup();
                              widget.onBuka(n);
                            },
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(14, 12, 4, 12),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    width: 36,
                                    height: 36,
                                    decoration: BoxDecoration(
                                      color: MasColors.brandLight,
                                      shape: BoxShape.circle,
                                    ),
                                    child: const Icon(Icons.notifications_active, color: MasColors.brand, size: 20),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text(
                                          'Notifikasi baru',
                                          style: TextStyle(fontSize: 11, color: MasColors.muted),
                                        ),
                                        Text(n.judul, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                                        if (n.isi.isNotEmpty)
                                          Text(
                                            n.isi,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(fontSize: 13),
                                          ),
                                      ],
                                    ),
                                  ),
                                  // Tanpa `tooltip`: banner berada di atas Navigator
                                  // (MaterialApp.builder) sehingga tidak ada Overlay —
                                  // Tooltip butuh Overlay ("No Overlay widget found").
                                  Semantics(
                                    label: 'Tutup',
                                    button: true,
                                    child: IconButton(
                                      visualDensity: VisualDensity.compact,
                                      onPressed: _tutup,
                                      icon: const Icon(Icons.close, size: 18),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
