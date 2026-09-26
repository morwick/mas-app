import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Ikon lonceng notifikasi yang bergoyang berkala selama masih ada notifikasi
/// belum dibaca — supaya driver sadar ada yang perlu dilihat. Diam bila
/// semuanya sudah dibaca.
class LoncengNotifikasi extends StatefulWidget {
  const LoncengNotifikasi({super.key, required this.belumDibaca});

  final int belumDibaca;

  @override
  State<LoncengNotifikasi> createState() => _LoncengNotifikasiState();
}

class _LoncengNotifikasiState extends State<LoncengNotifikasi> with SingleTickerProviderStateMixin {
  // Satu siklus 2,4 detik: goyang ±15° selama ~0,8 detik, lalu diam.
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2400));

  static final _goyang = TweenSequence<double>([
    TweenSequenceItem(tween: Tween(begin: 0, end: 0.26), weight: 1),
    TweenSequenceItem(tween: Tween(begin: 0.26, end: -0.26), weight: 2),
    TweenSequenceItem(tween: Tween(begin: -0.26, end: 0.18), weight: 2),
    TweenSequenceItem(tween: Tween(begin: 0.18, end: -0.12), weight: 2),
    TweenSequenceItem(tween: Tween(begin: -0.12, end: 0), weight: 1),
    TweenSequenceItem(tween: ConstantTween(0), weight: 16),
  ]);

  @override
  void initState() {
    super.initState();
    _atur();
  }

  @override
  void didUpdateWidget(LoncengNotifikasi old) {
    super.didUpdateWidget(old);
    if ((old.belumDibaca > 0) != (widget.belumDibaca > 0)) _atur();
  }

  void _atur() {
    if (widget.belumDibaca > 0) {
      _c.repeat();
    } else {
      _c
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ada = widget.belumDibaca > 0;
    return Badge(
      isLabelVisible: ada,
      label: Text('${widget.belumDibaca}'),
      child: AnimatedBuilder(
        animation: _c,
        builder: (_, child) => Transform.rotate(
          // Berayun dari gagang lonceng (atas tengah), bukan dari pusatnya.
          alignment: const Alignment(0, -0.8),
          angle: _goyang.transform(_c.value) * math.pi / 3.5,
          child: child,
        ),
        child: Icon(ada ? Icons.notifications_active : Icons.notifications_outlined),
      ),
    );
  }
}
