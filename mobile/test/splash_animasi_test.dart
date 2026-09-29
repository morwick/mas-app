import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/widgets/splash_animasi.dart';

void main() {
  testWidgets('splash tampil di atas halaman lalu hilang setelah animasi selesai', (tester) async {
    var diketuk = 0;
    await tester.pumpWidget(MaterialApp(
      home: SplashAnimasi(
        child: Scaffold(
          body: Center(child: TextButton(onPressed: () => diketuk++, child: const Text('halaman'))),
        ),
      ),
    ));

    expect(find.byKey(const Key('splash-animasi')), findsOneWidget);
    expect(find.text('MAS Driver'), findsOneWidget);

    // Halaman di belakang tidak bisa diketuk selama splash tampil.
    await tester.tap(find.text('halaman'), warnIfMissed: false);
    expect(diketuk, 0);

    // Masih tampil di tengah animasi (±1,3 detik)...
    await tester.pump(const Duration(milliseconds: 1300));
    expect(find.byKey(const Key('splash-animasi')), findsOneWidget);

    // ...dan dilepas setelah durasinya habis.
    await tester.pump(SplashAnimasi.defaultDurasi);
    await tester.pump();
    expect(find.byKey(const Key('splash-animasi')), findsNothing);
    await tester.tap(find.text('halaman'));
    expect(diketuk, 1);
  });

  test('durasi splash 2–3 detik', () {
    expect(SplashAnimasi.defaultDurasi.inMilliseconds, inInclusiveRange(2000, 3000));
  });
}
