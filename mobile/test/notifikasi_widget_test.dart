import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/widgets/banner_notifikasi.dart';
import 'package:mas_driver/core/widgets/lonceng_notifikasi.dart';

void main() {
  testWidgets('notifikasi yang masuk saat aplikasi terbuka tampil sebagai banner, bisa diketuk', (tester) async {
    final masuk = StreamController<NotifikasiMasuk>();
    NotifikasiMasuk? dibuka;
    await tester.pumpWidget(MaterialApp(
      home: BannerNotifikasi(
        masuk: masuk.stream,
        onBuka: (n) => dibuka = n,
        child: const Scaffold(body: Text('halaman')),
      ),
    ));

    expect(find.byKey(const Key('banner-notifikasi')), findsNothing);
    masuk.add(const NotifikasiMasuk(
      judul: 'Pengajuan uang jalan ditolak',
      isi: 'JOB-2026-001: nominal terlalu besar',
      data: {'job_id': 'j1', 'kind': 'uang_jalan_ditolak'},
    ));
    await tester.pumpAndSettle();

    expect(find.text('Pengajuan uang jalan ditolak'), findsOneWidget);
    expect(find.text('JOB-2026-001: nominal terlalu besar'), findsOneWidget);

    await tester.tap(find.text('Pengajuan uang jalan ditolak'));
    await tester.pumpAndSettle();
    expect(dibuka?.data['job_id'], 'j1');

    // Hilang sendiri setelah beberapa detik.
    masuk.add(const NotifikasiMasuk(judul: 'Job baru untuk Anda', isi: '', data: {}));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 7));
    await tester.pumpAndSettle();
    final banner = tester.widget<AnimatedOpacity>(
      find.ancestor(of: find.byKey(const Key('banner-notifikasi')), matching: find.byType(AnimatedOpacity)),
    );
    expect(banner.opacity, 0);
    await masuk.close();
  });

  testWidgets('lonceng bergoyang bila ada yang belum dibaca, diam bila tidak', (tester) async {
    Future<double> sudut(int belumDibaca) async {
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: LoncengNotifikasi(belumDibaca: belumDibaca))));
      await tester.pump(const Duration(milliseconds: 150));
      final t = tester.widget<Transform>(
        find.descendant(of: find.byType(LoncengNotifikasi), matching: find.byType(Transform)).first,
      );
      return t.transform.getRotation().entry(1, 0);
    }

    expect(await sudut(3), isNot(0));
    expect(find.text('3'), findsOneWidget);
    expect(await sudut(0), 0);
  });

  testWidgets('banner di MaterialApp.builder (di atas Navigator, tanpa Overlay) tidak error', (tester) async {
    final masuk = StreamController<NotifikasiMasuk>();
    await tester.pumpWidget(MaterialApp(
      // Sama seperti app.dart: banner membungkus seluruh navigator.
      builder: (context, child) => BannerNotifikasi(
        masuk: masuk.stream,
        onBuka: (_) {},
        child: child!,
      ),
      home: const Scaffold(body: Text('halaman')),
    ));
    masuk.add(const NotifikasiMasuk(judul: 'Job baru', isi: 'JOB-1', data: {}));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.takeException(), isNull);
    expect(find.byKey(const Key('banner-notifikasi')), findsOneWidget);
    await tester.tap(find.byIcon(Icons.close));
    await tester.pump(const Duration(seconds: 7));
    await masuk.close();
  });

  testWidgets('lapisan banner tidak menghalangi sentuhan ke halaman', (tester) async {
    final masuk = StreamController<NotifikasiMasuk>();
    var ditekan = 0;
    await tester.pumpWidget(MaterialApp(
      builder: (context, child) => BannerNotifikasi(masuk: masuk.stream, onBuka: (_) {}, child: child!),
      home: Scaffold(
        body: Center(child: ElevatedButton(onPressed: () => ditekan++, child: const Text('Tombol halaman'))),
      ),
    ));
    await tester.tap(find.text('Tombol halaman'));
    expect(ditekan, 1);
    // Saat banner tampil pun, bagian lain layar tetap bisa disentuh.
    masuk.add(const NotifikasiMasuk(judul: 'Job baru', isi: '', data: {}));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.tap(find.text('Tombol halaman'));
    expect(ditekan, 2);
    await tester.pump(const Duration(seconds: 7));
    await masuk.close();
  });
}
