import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/pembaruan.dart';
import 'package:mas_driver/core/widgets/wajib_update.dart';

class _Palsu implements PemeriksaPembaruan {
  _Palsu(this.status);

  StatusPembaruan status;
  final bool pasangBerhasil = false;
  int dipasang = 0;
  int tokoDibuka = 0;

  @override
  Future<StatusPembaruan> periksa() async => status;

  @override
  Future<bool> pasang() async {
    dipasang++;
    return pasangBerhasil;
  }

  @override
  Future<void> bukaToko() async => tokoDibuka++;
}

Future<void> _tampil(WidgetTester tester, _Palsu palsu) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [pemeriksaPembaruanProvider.overrideWithValue(palsu)],
    child: const MaterialApp(home: WajibUpdate(child: Scaffold(body: Text('halaman')))),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('versi terbaru: aplikasi jalan normal tanpa layar update', (tester) async {
    final palsu = _Palsu(StatusPembaruan.terbaru);
    await _tampil(tester, palsu);
    expect(find.text('halaman'), findsOneWidget);
    expect(find.byKey(const Key('wajib-update')), findsNothing);
    expect(palsu.dipasang, 0);
  });

  testWidgets('ada versi baru: layar update Play dibuka & aplikasi terkunci', (tester) async {
    final palsu = _Palsu(StatusPembaruan.wajib);
    await _tampil(tester, palsu);
    expect(palsu.dipasang, 1);
    expect(find.byKey(const Key('wajib-update')), findsOneWidget);
    expect(find.text('Pembaruan wajib'), findsOneWidget);
    expect(find.text('halaman'), findsNothing);
  });

  testWidgets('tombol Update sekarang: buka Play Store bila layar update gagal', (tester) async {
    final palsu = _Palsu(StatusPembaruan.wajib);
    await _tampil(tester, palsu);
    await tester.tap(find.byKey(const Key('tombol-update')));
    await tester.pumpAndSettle();
    expect(palsu.dipasang, 2);
    expect(palsu.tokoDibuka, 1);
    expect(find.byKey(const Key('wajib-update')), findsOneWidget);
  });

  testWidgets('kembali dari latar belakang: dicek ulang, kunci lepas setelah terpasang', (tester) async {
    final palsu = _Palsu(StatusPembaruan.wajib);
    await _tampil(tester, palsu);
    expect(find.byKey(const Key('wajib-update')), findsOneWidget);

    // Masih versi lama → tetap terkunci, layar Play tidak dibuka berulang.
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wajib-update')), findsOneWidget);
    expect(palsu.dipasang, 1);

    palsu.status = StatusPembaruan.terbaru;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('wajib-update')), findsNothing);
    expect(find.text('halaman'), findsOneWidget);
  });

  testWidgets('update tertunda dilanjutkan otomatis', (tester) async {
    final palsu = _Palsu(StatusPembaruan.sedangDipasang);
    await _tampil(tester, palsu);
    expect(palsu.dipasang, 1);
    expect(find.byKey(const Key('wajib-update')), findsOneWidget);
  });
}
