import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/maps.dart';

const _asal = 'Nanga Kemangai, Sintang, Kalimantan Barat, Indonesia';

void main() {
  group('rutePetaUri', () {
    test('titik dipakai sebagai tujuan dan diberi label namanya', () {
      // Data asli JOB-2026-016. Titiknya apa adanya supaya Maps tidak
      // menggeser tujuan ke tempat lain yang namanya mirip.
      final uris = rutePetaUri(lat: -0.2458721, lng: 112.7197266, alamat: _asal);
      expect(
        uris.first.toString(),
        'geo:-0.2458721,112.7197266?q=-0.2458721,112.7197266'
            '(Nanga%20Kemangai%2C%20Sintang%2C%20Kalimantan%20Barat%2C%20Indonesia)',
      );
    });

    test('geo: didahulukan daripada tautan web', () {
      final uris = rutePetaUri(lat: 1.0, lng: 2.0, alamat: 'X');
      expect(uris, hasLength(2));
      expect(uris.first.scheme, 'geo');
      expect(uris.last.scheme, 'https');
      expect(uris.last.queryParameters['query'], '1.0,2.0');
    });

    test('tanpa nama, pin tetap dijatuhkan di titiknya', () {
      final uris = rutePetaUri(lat: 1.0, lng: 2.0, alamat: '');
      expect(uris.first.toString(), 'geo:1.0,2.0?q=1.0,2.0');
    });

    test('tanpa titik, nama tempat yang dicari', () {
      final uris = rutePetaUri(alamat: 'Nunukan, Kalimantan Utara');
      expect(uris.first.toString(), 'geo:0,0?q=Nunukan%2C%20Kalimantan%20Utara');
      expect(uris.last.queryParameters['query'], 'Nunukan, Kalimantan Utara');
    });

    test('lat tanpa lng dianggap tidak punya titik', () {
      expect(rutePetaUri(lat: 1.0, alamat: 'Pekanbaru').first.toString(), 'geo:0,0?q=Pekanbaru');
    });

    test('tanpa titik dan tanpa nama tidak menghasilkan tautan', () {
      expect(rutePetaUri(alamat: ''), isEmpty);
      expect(rutePetaUri(alamat: '   '), isEmpty);
    });
  });
}
