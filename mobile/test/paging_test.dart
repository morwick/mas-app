import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/paging.dart';

String idOf(String s) => s;

void main() {
  group('gabungHalaman', () {
    test('halaman pertama mengisi daftar kosong', () {
      final hasil = gabungHalaman(
        const DaftarBertahap<String>(),
        const Halaman(items: ['a', 'b'], total: 5),
        idOf: idOf,
        halaman: 1,
      );
      expect(hasil.items, ['a', 'b']);
      expect(hasil.total, 5);
      expect(hasil.halaman, 1);
      expect(hasil.adaLagi, isTrue);
    });

    test('halaman berikutnya disambung di belakang', () {
      const lama = DaftarBertahap(items: ['a', 'b'], total: 5, halaman: 1);
      final hasil = gabungHalaman(lama, const Halaman(items: ['c', 'd'], total: 5), idOf: idOf, halaman: 2);
      expect(hasil.items, ['a', 'b', 'c', 'd']);
      expect(hasil.adaLagi, isTrue);
    });

    test('baris kembar dibuang, bukan ditumpuk', () {
      // Job baru masuk di server → baris lama terdorong ke halaman berikutnya.
      const lama = DaftarBertahap(items: ['a', 'b'], total: 4, halaman: 1);
      final hasil = gabungHalaman(lama, const Halaman(items: ['b', 'c'], total: 4), idOf: idOf, halaman: 2);
      expect(hasil.items, ['a', 'b', 'c']);
    });

    test('kembar di dalam satu halaman juga dibuang', () {
      final hasil = gabungHalaman(
        const DaftarBertahap<String>(),
        const Halaman(items: ['a', 'a', 'b'], total: 3),
        idOf: idOf,
        halaman: 1,
      );
      expect(hasil.items, ['a', 'b']);
    });

    test('halaman kosong menutup daftar', () {
      // Tanpa ini, daftar yang kehilangan baris karena kembar akan terus
      // meminta halaman berikutnya selamanya.
      const lama = DaftarBertahap(items: ['a'], total: 9, halaman: 1);
      final hasil = gabungHalaman(lama, const Halaman<String>(items: [], total: 9), idOf: idOf, halaman: 2);
      expect(hasil.adaLagi, isFalse);
      expect(hasil.items, ['a']);
    });

    test('panjang mencapai total menutup daftar', () {
      final hasil = gabungHalaman(
        const DaftarBertahap<String>(),
        const Halaman(items: ['a', 'b'], total: 2),
        idOf: idOf,
        halaman: 1,
      );
      expect(hasil.adaLagi, isFalse);
    });

    test('memuatLagi selalu padam setelah halaman tiba', () {
      const lama = DaftarBertahap(items: ['a'], total: 3, halaman: 1, memuatLagi: true);
      final hasil = gabungHalaman(lama, const Halaman(items: ['b'], total: 3), idOf: idOf, halaman: 2);
      expect(hasil.memuatLagi, isFalse);
    });
  });

  group('Halaman.dariJson', () {
    test('membaca bentuk respons server', () {
      final h = Halaman.dariJson<String>(
        {'items': [{'id': 'x'}, {'id': 'y'}], 'total': 7, 'page': 1, 'page_size': 20},
        (j) => j['id'] as String,
      );
      expect(h.items, ['x', 'y']);
      expect(h.total, 7);
    });

    test('respons tanpa items dianggap kosong', () {
      final h = Halaman.dariJson<String>({'total': 0}, (j) => j['id'] as String);
      expect(h.items, isEmpty);
      expect(h.total, 0);
    });
  });
}
