import 'dart:typed_data';

import 'package:image/image.dart' as img;

import '../../core/config.dart';

/// Hasil pemeriksaan kualitas foto di perangkat (FR-PHOTO-04).
class QualityReport {
  const QualityReport({
    required this.sharpness,
    required this.brightness,
    required this.width,
    required this.height,
    required this.threshold,
  });

  /// Variance of Laplacian pada salinan abu-abu lebar 800 px.
  final double sharpness;

  /// Rata-rata kecerahan 0–255.
  final double brightness;
  final int width;
  final int height;
  final double threshold;

  bool get isBlurry => sharpness < threshold;
  bool get isTooDark => brightness < 35;
  bool get isTooBright => brightness > 225;
  bool get isLowResolution => (width < height ? width : height) < AppConfig.minShortSidePx;

  bool get isAcceptable => !isBlurry && !isTooDark && !isTooBright && !isLowResolution;

  /// Alasan yang ditampilkan ke driver, urut dari yang paling penting.
  List<String> get problems => [
        if (isBlurry) 'Foto tampak buram, disarankan ambil ulang',
        if (isTooDark) 'Foto terlalu gelap',
        if (isTooBright) 'Foto terlalu terang / silau',
        if (isLowResolution) 'Resolusi foto terlalu kecil',
      ];
}

/// Hitung ketajaman & kecerahan. [original] dipakai untuk ukuran asli;
/// perhitungan dilakukan pada salinan kecil supaya cepat.
QualityReport analyzeQuality(img.Image original, {bool document = false}) {
  final small = original.width > 800 ? img.copyResize(original, width: 800) : original;
  final gray = img.grayscale(small);
  final w = gray.width;
  final h = gray.height;

  // Luminance ke buffer supaya akses piksel murah.
  final lum = Float32List(w * h);
  var sum = 0.0;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final v = gray.getPixel(x, y).r.toDouble();
      lum[y * w + x] = v;
      sum += v;
    }
  }
  final brightness = lum.isEmpty ? 0.0 : sum / lum.length;

  // Laplacian 4-tetangga, lalu variansnya.
  var n = 0;
  var mean = 0.0;
  var m2 = 0.0;
  for (var y = 1; y < h - 1; y++) {
    for (var x = 1; x < w - 1; x++) {
      final i = y * w + x;
      final lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      n++;
      final delta = lap - mean;
      mean += delta / n;
      m2 += delta * (lap - mean);
    }
  }
  final variance = n > 1 ? m2 / (n - 1) : 0.0;

  return QualityReport(
    sharpness: variance,
    brightness: brightness,
    width: original.width,
    height: original.height,
    threshold: document ? AppConfig.blurThresholdSuratTimbang : AppConfig.blurThresholdDefault,
  );
}

/// Stempel tanggal-jam dan koordinat pada bagian bawah gambar (FR-PHOTO-06).
img.Image stampImage(img.Image image, {required String line1, required String line2}) {
  final font = image.width >= 1200 ? img.arial48 : img.arial24;
  final lineH = font.lineHeight;
  final barH = lineH * 2 + 24;
  img.fillRect(
    image,
    x1: 0,
    y1: image.height - barH,
    x2: image.width,
    y2: image.height,
    color: img.ColorRgba8(0, 0, 0, 150),
  );
  final white = img.ColorRgb8(255, 255, 255);
  img.drawString(image, line1, font: font, x: 16, y: image.height - barH + 8, color: white);
  img.drawString(image, line2, font: font, x: 16, y: image.height - barH + 12 + lineH, color: white);
  return image;
}

/// Parameter pemrosesan foto — dijalankan di isolate terpisah lewat `compute`.
class ProcessPhotoInput {
  const ProcessPhotoInput({
    required this.bytes,
    required this.document,
    required this.stampLine1,
    required this.stampLine2,
  });

  final Uint8List bytes;
  final bool document;
  final String stampLine1;
  final String stampLine2;
}

class ProcessPhotoOutput {
  const ProcessPhotoOutput({required this.report, required this.jpeg});

  final QualityReport report;
  final Uint8List jpeg;
}

/// Dekode → koreksi orientasi EXIF → periksa kualitas (pada ukuran asli) →
/// perkecil ke ≤ 1920 px → stempel → JPEG q85.
ProcessPhotoOutput processPhoto(ProcessPhotoInput input) {
  img.Image? decoded;
  try {
    decoded = img.decodeImage(input.bytes);
  } catch (_) {
    decoded = null; // decoder bisa melempar RangeError pada data rusak
  }
  if (decoded == null) throw const FormatException('Foto tidak bisa dibaca');
  final oriented = img.bakeOrientation(decoded);

  final report = analyzeQuality(oriented, document: input.document);

  final longSide = oriented.width > oriented.height ? oriented.width : oriented.height;
  final resized = longSide > AppConfig.uploadMaxLongSidePx
      ? (oriented.width >= oriented.height
          ? img.copyResize(oriented, width: AppConfig.uploadMaxLongSidePx)
          : img.copyResize(oriented, height: AppConfig.uploadMaxLongSidePx))
      : oriented;

  stampImage(resized, line1: input.stampLine1, line2: input.stampLine2);
  final jpeg = Uint8List.fromList(img.encodeJpg(resized, quality: AppConfig.uploadJpegQuality));
  return ProcessPhotoOutput(report: report, jpeg: jpeg);
}
