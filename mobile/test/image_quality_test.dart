import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mas_driver/features/camera/image_quality.dart';

img.Image _checkerboard(int w, int h, {int cell = 8}) {
  final im = img.Image(width: w, height: h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final on = ((x ~/ cell) + (y ~/ cell)).isEven;
      final v = on ? 235 : 20;
      im.setPixelRgb(x, y, v, v, v);
    }
  }
  return im;
}

img.Image _flat(int w, int h, int v) {
  final im = img.Image(width: w, height: h);
  img.fill(im, color: img.ColorRgb8(v, v, v));
  return im;
}

void main() {
  group('analyzeQuality', () {
    test('gambar tajam berkontras tinggi lolos ambang', () {
      final r = analyzeQuality(_checkerboard(1920, 1440));
      expect(r.isBlurry, isFalse);
      expect(r.isLowResolution, isFalse);
      expect(r.isTooDark, isFalse);
      expect(r.isAcceptable, isTrue);
    });

    test('gambar rata (tanpa tepi) dianggap buram', () {
      final r = analyzeQuality(_flat(1920, 1440, 128));
      expect(r.sharpness, closeTo(0, 1e-6));
      expect(r.isBlurry, isTrue);
      expect(r.problems.first, 'Foto tampak buram, disarankan ambil ulang');
    });

    test('gambar yang diblur lebih rendah skornya daripada aslinya', () {
      final sharp = _checkerboard(1920, 1440);
      final blurred = img.gaussianBlur(sharp.clone(), radius: 6);
      final a = analyzeQuality(sharp);
      final b = analyzeQuality(blurred);
      expect(b.sharpness, lessThan(a.sharpness));
    });

    test('terlalu gelap / terang dan resolusi kecil terdeteksi', () {
      expect(analyzeQuality(_flat(1920, 1440, 10)).isTooDark, isTrue);
      expect(analyzeQuality(_flat(1920, 1440, 250)).isTooBright, isTrue);
      expect(analyzeQuality(_checkerboard(800, 600)).isLowResolution, isTrue);
    });

    test('surat timbang memakai ambang lebih ketat', () {
      final a = analyzeQuality(_checkerboard(1920, 1440));
      final b = analyzeQuality(_checkerboard(1920, 1440), document: true);
      expect(b.threshold, greaterThan(a.threshold));
    });
  });

  group('processPhoto', () {
    test('menyusutkan ke <= 1920 px, menstempel, dan menghasilkan JPEG', () {
      final src = _checkerboard(2560, 1920);
      final bytes = Uint8List.fromList(img.encodeJpg(src, quality: 90));
      final out = processPhoto(ProcessPhotoInput(
        bytes: bytes,
        document: false,
        stampLine1: '22-09-2026 10:00:00  -  Foto sisi depan kendaraan',
        stampLine2: 'GPS: -6.20000, 106.81667',
      ));
      final decoded = img.decodeJpg(out.jpeg)!;
      expect(decoded.width, 1920);
      expect(decoded.height, 1440);
      // Laporan kualitas dihitung pada ukuran asli.
      expect(out.report.width, 2560);
      expect(out.report.isLowResolution, isFalse);
      // Bar stempel gelap di bagian bawah: piksel kiri bawah jauh lebih gelap
      // daripada kotak papan catur yang terang.
      final p = decoded.getPixel(2, decoded.height - 2);
      expect(p.r, lessThan(120));
    });

    test('bytes bukan gambar -> FormatException', () {
      expect(
        () => processPhoto(ProcessPhotoInput(
          bytes: Uint8List.fromList([1, 2, 3]),
          document: false,
          stampLine1: '',
          stampLine2: '',
        )),
        throwsFormatException,
      );
    });
  });
}
