import 'package:flutter/material.dart';

import '../theme.dart';

/// Splash beranimasi (3 detik) saat aplikasi dibuka.
///
/// Ditumpuk di atas [child]: halaman pertama (login / daftar job) sudah
/// disiapkan di belakangnya, lalu splash memudar dan dilepas dari pohon
/// widget. Latar hijau lembut sama dengan splash native Android/iOS sehingga
/// peralihannya tidak berkedip.
class SplashAnimasi extends StatefulWidget {
  const SplashAnimasi({super.key, required this.child, this.durasi = defaultDurasi});

  static const defaultDurasi = Duration(milliseconds: 3000);

  final Widget child;
  final Duration durasi;

  @override
  State<SplashAnimasi> createState() => _SplashAnimasiState();
}

class _SplashAnimasiState extends State<SplashAnimasi> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.durasi)
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) setState(() => _selesai = true);
    })
    ..forward();
  bool _selesai = false;

  // Urutan (porsi dari total durasi): logo muncul membesar → gelombang
  // cincin memancar → nama aplikasi naik → garis progres berjalan →
  // seluruh splash memudar.
  late final _logoMuncul = CurvedAnimation(parent: _c, curve: const Interval(0.0, 0.35, curve: Curves.easeOut));
  late final _logoSkala = Tween(begin: 0.72, end: 1.0)
      .animate(CurvedAnimation(parent: _c, curve: const Interval(0.0, 0.40, curve: Curves.easeOutBack)));
  late final _cincin = CurvedAnimation(parent: _c, curve: const Interval(0.25, 0.75, curve: Curves.easeOut));
  late final _teks = CurvedAnimation(parent: _c, curve: const Interval(0.28, 0.58, curve: Curves.easeOut));
  late final _progres = CurvedAnimation(parent: _c, curve: const Interval(0.20, 0.88, curve: Curves.easeInOut));
  late final _pudar = CurvedAnimation(parent: _c, curve: const Interval(0.88, 1.0, curve: Curves.easeIn));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_selesai) return widget.child;
    return Stack(
      children: [
        widget.child,
        // Menahan sentuhan selama splash tampil.
        Positioned.fill(
          child: AbsorbPointer(
            child: AnimatedBuilder(
              animation: _c,
              builder: (context, _) => Opacity(
                opacity: 1 - _pudar.value,
                child: _isi(),
              ),
            ),
          ),
        ),
      ],
    );
  }


  Widget _isi() {
    const diameter = 176.0;
    return ColoredBox(
      key: const Key('splash-animasi'),
      // Soft green — sama dengan badge "Stand By" di web (#E8F7E0).
      color: MasColors.brandLight,
      child: SafeArea(
        child: SizedBox.expand(
          child: Column(
            children: [
              const Spacer(flex: 5),
              SizedBox(
                width: diameter * 1.6,
                height: diameter * 1.6,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Gelombang cincin yang memancar dari balik logo.
                    Opacity(
                      opacity: 0.45 * (1 - _cincin.value) * _logoMuncul.value,
                      child: Container(
                        width: diameter * (1 + 0.6 * _cincin.value),
                        height: diameter * (1 + 0.6 * _cincin.value),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: MasColors.brand.withValues(alpha: 0.5), width: 3),
                        ),
                      ),
                    ),
                    // Logo di atas lingkaran putih (seperti ikon aplikasi).
                    Opacity(
                      opacity: _logoMuncul.value,
                      child: Transform.scale(
                        scale: _logoSkala.value,
                        child: Container(
                          width: diameter,
                          height: diameter,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: MasColors.brandDark.withValues(alpha: 0.12),
                                blurRadius: 28,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: Image.asset(
                            'assets/splash_logo.png',
                            width: diameter * 0.56,
                            filterQuality: FilterQuality.medium,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              Opacity(
                opacity: _teks.value,
                child: Transform.translate(
                  offset: Offset(0, 14 * (1 - _teks.value)),
                  child: const Column(
                    children: [
                      Text(
                        'MAS Driver',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: MasColors.brandDark,
                          letterSpacing: 0.4,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Heavy Equipment & Truck',
                        style: TextStyle(fontSize: 14, color: MasColors.muted, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              ),
              const Spacer(flex: 4),
              Padding(
                padding: const EdgeInsets.only(bottom: 48),
                child: SizedBox(
                  width: 140,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: _progres.value,
                      minHeight: 5,
                      color: MasColors.brand,
                      backgroundColor: Colors.white.withValues(alpha: 0.7),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
