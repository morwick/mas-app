import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../pembaruan.dart';
import '../theme.dart';

/// Wajib update: saat aplikasi dibuka dan setiap kembali dari latar belakang,
/// versi di Play Store diperiksa. Bila ada versi baru, layar update Play
/// dibuka; selama belum terpasang, aplikasi terkunci di layar "Pembaruan
/// wajib" — driver tidak bisa melewatinya.
class WajibUpdate extends ConsumerStatefulWidget {
  const WajibUpdate({super.key, required this.child, this.tundaAwal = Duration.zero});

  final Widget child;

  /// Layar update baru dibuka setelah jeda ini (menunggu splash selesai).
  final Duration tundaAwal;

  @override
  ConsumerState<WajibUpdate> createState() => _WajibUpdateState();
}

class _WajibUpdateState extends ConsumerState<WajibUpdate> with WidgetsBindingObserver {
  bool _wajib = false;
  bool _sibuk = false;

  PemeriksaPembaruan get _pemeriksa => ref.read(pemeriksaPembaruanProvider);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _periksa(tunda: widget.tundaAwal);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Kembali dari Play Store / latar belakang: periksa lagi supaya kunci
    // tidak bisa dilewati, dan terlepas sendiri begitu update terpasang.
    if (state == AppLifecycleState.resumed) _periksa(bukaOtomatis: false);
  }

  /// [bukaOtomatis]: langsung buka layar update Play (saat aplikasi dibuka).
  /// Saat kembali dari latar belakang cukup diperiksa ulang — driver yang
  /// membatalkan tetap terkunci dan memakai tombol "Update sekarang".
  Future<void> _periksa({Duration tunda = Duration.zero, bool bukaOtomatis = true}) async {
    if (_sibuk) return;
    _sibuk = true;
    try {
      final hasil = await Future.wait([_pemeriksa.periksa(), Future<void>.delayed(tunda)]);
      final status = hasil.first as StatusPembaruan;
      if (!mounted) return;
      setState(() => _wajib = status != StatusPembaruan.terbaru);
      // Update yang sudah dimulai sebelumnya selalu dilanjutkan.
      if (status == StatusPembaruan.sedangDipasang || (_wajib && bukaOtomatis)) {
        await _pemeriksa.pasang();
      }
    } finally {
      _sibuk = false;
    }
  }

  bool _sibukTombol = false;

  Future<void> _tombolUpdate() async {
    if (_sibukTombol) return;
    setState(() => _sibukTombol = true);
    try {
      // Layar update tidak bisa dibuka (mis. tidak diizinkan Play) → buka
      // halaman aplikasi di Play Store sebagai cadangan.
      if (!await _pemeriksa.pasang()) await _pemeriksa.bukaToko();
    } finally {
      if (mounted) setState(() => _sibukTombol = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_wajib) return widget.child;
    return Stack(
      children: [
        // Halaman di belakang tetap hidup, tapi tertutup dan tidak bisa disentuh.
        Offstage(child: widget.child),
        Positioned.fill(child: _layarKunci()),
      ],
    );
  }

  Widget _layarKunci() {
    return Material(
      key: const Key('wajib-update'),
      color: Colors.white,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 28),
          child: Column(
            children: [
              const Spacer(flex: 3),
              Image.asset('assets/splash_logo.png', width: 96),
              const SizedBox(height: 28),
              const Icon(Icons.system_update_rounded, size: 40, color: MasColors.brand),
              const SizedBox(height: 12),
              const Text(
                'Pembaruan wajib',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: MasColors.text),
              ),
              const SizedBox(height: 8),
              const Text(
                'Versi baru MAS Driver sudah tersedia di Play Store. '
                'Perbarui aplikasi sekarang untuk melanjutkan.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 14, height: 1.4, color: MasColors.muted),
              ),
              const Spacer(flex: 4),
              FilledButton.icon(
                key: const Key('tombol-update'),
                onPressed: _sibukTombol ? null : _tombolUpdate,
                icon: _sibukTombol
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.download_rounded),
                label: const Text('Update sekarang'),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
