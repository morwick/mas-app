import 'package:flutter/material.dart';

/// Kerangka abu-abu yang berdenyut pelan selama data belum datang, supaya
/// driver langsung melihat bentuk daftarnya alih-alih spinner di layar kosong.
class Berdenyut extends StatefulWidget {
  const Berdenyut({super.key, required this.child});
  final Widget child;

  @override
  State<Berdenyut> createState() => _BerdenyutState();
}

class _BerdenyutState extends State<Berdenyut> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 900))..repeat(reverse: true);
  late final _opacity = Tween(begin: 0.45, end: 1.0).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut));

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(opacity: _opacity, child: widget.child);
}

/// Satu balok kerangka.
class BalokSkeleton extends StatelessWidget {
  const BalokSkeleton({super.key, this.lebar, this.tinggi = 12, this.radius = 6});
  final double? lebar;
  final double tinggi;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
        width: lebar,
        height: tinggi,
        decoration: BoxDecoration(
          color: const Color(0xFFE6E5DF),
          borderRadius: BorderRadius.circular(radius),
        ),
      );
}

/// Kerangka seukuran kartu job di daftar (nomor + status, customer, alat,
/// rute, jadwal).
class KartuJobSkeleton extends StatelessWidget {
  const KartuJobSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const Card(
        child: Padding(
          padding: EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  BalokSkeleton(lebar: 110, tinggi: 11),
                  Spacer(),
                  BalokSkeleton(lebar: 72, tinggi: 18, radius: 99),
                ],
              ),
              SizedBox(height: 10),
              BalokSkeleton(lebar: 180, tinggi: 15),
              SizedBox(height: 6),
              BalokSkeleton(lebar: 130, tinggi: 11),
              SizedBox(height: 12),
              BalokSkeleton(tinggi: 11),
              SizedBox(height: 8),
              BalokSkeleton(lebar: 150, tinggi: 11),
            ],
          ),
        ),
      );
}

/// Daftar kerangka untuk muatan pertama sebuah tab. Tetap bisa ditarik untuk
/// memuat ulang (dibungkus [RefreshIndicator] oleh pemanggil bila perlu).
class DaftarSkeleton extends StatelessWidget {
  const DaftarSkeleton({
    super.key,
    this.jumlah = 5,
    this.kartu = const KartuJobSkeleton(),
    this.padding = const EdgeInsets.fromLTRB(16, 8, 16, 24),
  });

  final int jumlah;
  final Widget kartu;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Berdenyut(
        key: const Key('daftar-skeleton'),
        child: ListView.separated(
          padding: padding,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: jumlah,
          separatorBuilder: (_, _) => const SizedBox(height: 10),
          itemBuilder: (_, _) => kartu,
        ),
      );
}
