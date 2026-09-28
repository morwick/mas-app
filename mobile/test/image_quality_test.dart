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

/// Pola acak berkontras (seperti tekstur badan truk / tulisan) — deterministik.
img.Image _tekstur(int w, int h) {
  final im = img.Image(width: w, height: h);
  var seed = 12345;
  int acak() => seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  img.fill(im, color: img.ColorRgb8(128, 128, 128));
  for (var k = 0; k < 900; k++) {
    final x = acak() % w, y = acak() % h;
    final rw = 10 + acak() % 60, rh = 10 + acak() % 60;
    final v = acak() % 2 == 0 ? 20 : 235;
    img.fillRect(im, x1: x, y1: y, x2: x + rw, y2: y + rh, color: img.ColorRgb8(v, v, v));
  }
  return im;
}

/// Goyangan horizontal: rata-rata [panjang] piksel ke samping (motion blur).
img.Image _goyang(img.Image src, int panjang) {
  final out = img.Image(width: src.width, height: src.height);
  for (var y = 0; y < src.height; y++) {
    for (var x = 0; x < src.width; x++) {
      var sum = 0.0;
      for (var t = 0; t < panjang; t++) {
        final xx = (x + t - panjang ~/ 2).clamp(0, src.width - 1);
        sum += src.getPixel(xx, y).r;
      }
      final v = (sum / panjang).round();
      out.setPixelRgb(x, y, v, v, v);
    }
  }
  return out;
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
      expect(r.edgeWidth, double.infinity);
      expect(r.isBlurry, isTrue);
      expect(r.problems.first, 'Foto tampak buram, disarankan ambil ulang');
    });

    test('gambar yang diblur tepinya lebih lebar daripada aslinya', () {
      final sharp = _checkerboard(1920, 1440);
      final blurred = img.gaussianBlur(sharp.clone(), radius: 6);
      final a = analyzeQuality(sharp);
      final b = analyzeQuality(blurred);
      expect(b.edgeWidth, greaterThan(a.edgeWidth));
    });

    test('foto digoyang (motion blur) terdeteksi buram, aslinya tidak', () {
      // 2560 px seperti kamera HP; goyangan 30 px ≈ 12 px di salinan analisis.
      final tajam = _tekstur(2560, 1920);
      final a = analyzeQuality(tajam);
      expect(a.isBlurry, isFalse, reason: 'lebar tepi tajam: ${a.edgeWidth}');

      final goyang = analyzeQuality(_goyang(tajam, 30));
      expect(goyang.isBlurry, isTrue, reason: 'lebar tepi goyang: ${goyang.edgeWidth}');
      // Goyangan horizontal melebarkan tepi di arah 0°, bukan 90°.
      expect(goyang.edgeWidthPerArah[0], greaterThan(goyang.edgeWidthPerArah[2]));
    });

    test('terlalu gelap / terang dan resolusi kecil terdeteksi', () {
      expect(analyzeQuality(_flat(1920, 1440, 10)).isTooDark, isTrue);
      expect(analyzeQuality(_flat(1920, 1440, 250)).isTooBright, isTrue);
      expect(analyzeQuality(_checkerboard(800, 600)).isLowResolution, isTrue);
    });

    test('surat jalan memakai ambang lebih ketat', () {
      final a = analyzeQuality(_checkerboard(1920, 1440));
      final b = analyzeQuality(_checkerboard(1920, 1440), document: true);
      // Lebih ketat = lebar tepi maksimum yang diizinkan lebih kecil.
      expect(b.threshold, lessThan(a.threshold));
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
