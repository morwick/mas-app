import 'package:flutter/material.dart';

import '../../../core/theme.dart';

/// Geser tombol ke kanan sampai ujung untuk mengonfirmasi (FR-MOBILE-04).
class SwipeToAccept extends StatefulWidget {
  const SwipeToAccept({
    super.key,
    required this.onAccepted,
    this.label = 'Geser untuk menerima pekerjaan',
    this.busy = false,
  });

  final Future<void> Function() onAccepted;
  final String label;
  final bool busy;

  @override
  State<SwipeToAccept> createState() => _SwipeToAcceptState();
}

class _SwipeToAcceptState extends State<SwipeToAccept> {
  static const _height = 60.0;
  static const _knob = 52.0;
  double _dx = 0;
  bool _done = false;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, c) {
      final maxDx = c.maxWidth - _knob - 8;
      final progress = maxDx <= 0 ? 0.0 : (_dx / maxDx).clamp(0.0, 1.0);
      final locked = widget.busy || _done;
      return Container(
        height: _height,
        decoration: BoxDecoration(
          color: Color.lerp(MasColors.brandLight, MasColors.brand, progress),
          borderRadius: BorderRadius.circular(_height / 2),
          border: Border.all(color: MasColors.brand, width: 1.5),
        ),
        child: Stack(
          alignment: Alignment.centerLeft,
          children: [
            Center(
              child: Opacity(
                opacity: (1 - progress * 1.6).clamp(0.0, 1.0),
                child: Text(
                  widget.busy ? 'Memproses…' : widget.label,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: MasColors.brandDark),
                ),
              ),
            ),
            Positioned(
              left: 4 + _dx,
              child: GestureDetector(
                onHorizontalDragUpdate: locked
                    ? null
                    : (d) => setState(() => _dx = (_dx + d.delta.dx).clamp(0.0, maxDx)),
                onHorizontalDragEnd: locked
                    ? null
                    : (_) async {
                        if (_dx >= maxDx * 0.92) {
                          setState(() {
                            _dx = maxDx;
                            _done = true;
                          });
                          try {
                            await widget.onAccepted();
                          } finally {
                            if (mounted) {
                              setState(() {
                                _dx = 0;
                                _done = false;
                              });
                            }
                          }
                        } else {
                          setState(() => _dx = 0);
                        }
                      },
                child: Container(
                  width: _knob,
                  height: _knob,
                  decoration: const BoxDecoration(
                    color: MasColors.brand,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Color(0x33000000), blurRadius: 6, offset: Offset(0, 2))],
                  ),
                  child: widget.busy
                      ? const Padding(
                          padding: EdgeInsets.all(14),
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Icon(Icons.double_arrow_rounded, color: Colors.white, size: 28),
                ),
              ),
            ),
          ],
        ),
      );
    });
  }
}
