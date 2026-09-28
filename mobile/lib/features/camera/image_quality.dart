import 'dart:math' as math;
import 'dart:typed_data';

import 'package:image/image.dart' as img;

import '../../core/config.dart';

/// Hasil pemeriksaan kualitas foto di perangkat (FR-PHOTO-04).
class QualityReport {
  const QualityReport({
    required this.edgeWidth,
    required this.brightness,
    required this.width,
    required this.height,
    required this.threshold,
    this.edgeWidthPerArah = const [],
  });

  /// Lebar tepi (px, pada salinan lebar [AppConfig.blurAnalysisWidth]) di arah
  /// yang paling melebar. Foto tajam ±2–5 px; foto goyang/tidak fokus melebar.
  /// `double.infinity` bila foto nyaris tanpa tepi (rata / sangat buram).
  final double edgeWidth;

  /// Lebar tepi per arah 0°, 45°, 90°, 135° (0 = sampel tidak cukup) — untuk diagnosa.
  final List<double> edgeWidthPerArah;

  /// Rata-rata kecerahan 0–255.
  final double brightness;
  final int width;
  final int height;

  /// Lebar tepi maksimum yang masih dianggap tajam.
  final double threshold;

  bool get isBlurry => edgeWidth >= threshold;
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

/// Arah langkah (dy, dx) untuk gradien 0°, 45°, 90°, 135°.
const _arah = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
];

/// Sampel tepi per arah — cukup untuk median yang stabil, tetap cepat di HP.
const _sampelPerArah = 700;

/// Gradien minimum (0–255 per px) agar dianggap tepi, bukan noise.
const _gradienMin = 4.0;

/// Ukur lebar tepi di 4 arah.
///
/// Kenapa bukan "variance of Laplacian" lagi: kamera HP menajamkan foto dan
/// menambah noise, sehingga foto yang digoyang tetap punya energi tepi tinggi
/// dan lolos. Goyangan justru terlihat sebagai tepi yang *melebar* di arah
/// goyangan — itu yang diukur di sini:
///
/// 1. Salinan abu-abu lebar tetap, dihaluskan ringan untuk meredam noise.
/// 2. Tiap piksel tepi dikelompokkan menurut arah gradiennya. Tepi dipilih per
///    arah (10% terkuat di arah itu) — kalau dipilih dari seluruh foto, yang
///    terpilih justru tepi sejajar goyangan yang tetap tajam.
/// 3. Dari titik tepi, telusuri searah gradien selama kecerahan terus naik;
///    panjang telusuran = lebar tepi. Median per arah; skor = arah terlebar.
///
/// Dikalibrasi dengan foto truk, alat berat, dan dokumen yang diberi goyangan
/// buatan + noise + penajaman ala kamera HP.
List<double> ukurLebarTepi(img.Image gray) {
  final w = gray.width;
  final h = gray.height;
  if (w < 16 || h < 16) return const [0, 0, 0, 0];

  // Luminance → buffer, lalu haluskan [1 2 1]/4 dua arah.
  final lum = Float32List(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      lum[y * w + x] = gray.getPixel(x, y).r.toDouble();
    }
  }
  final tmp = Float32List(w * h);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final l = lum[y * w + (x > 0 ? x - 1 : x)];
      final r = lum[y * w + (x < w - 1 ? x + 1 : x)];
      tmp[y * w + x] = (l + 2 * lum[y * w + x] + r) / 4;
    }
  }
  final g = Float32List(w * h);
  for (var y = 0; y < h; y++) {
    final atas = (y > 0 ? y - 1 : y) * w;
    final bawah = (y < h - 1 ? y + 1 : y) * w;
    for (var x = 0; x < w; x++) {
      g[y * w + x] = (tmp[atas + x] + 2 * tmp[y * w + x] + tmp[bawah + x]) / 4;
    }
  }

  // Gradien, arah (0..3), dan histogram magnitudo per arah (untuk persentil).
  final mag = Float32List(w * h);
  final bin = Uint8List(w * h);
  const skalaHist = 4; // 0,25 per kotak histogram
  const panjangHist = 256 * skalaHist;
  final hist = List.generate(4, (_) => Int32List(panjangHist));
  final jumlah = Int32List(4);
  const tepiAman = 3;
  for (var y = tepiAman; y < h - tepiAman; y++) {
    for (var x = tepiAman; x < w - tepiAman; x++) {
      final i = y * w + x;
      final gx = (g[i + 1] - g[i - 1]) / 2;
      final gy = (g[i + w] - g[i - w]) / 2;
      final m = math.sqrt(gx * gx + gy * gy);
      mag[i] = m;
      if (m < _gradienMin) continue;
      var sudut = math.atan2(gy, gx) * 180 / math.pi;
      if (sudut < 0) sudut += 180;
      final b = (sudut / 45).round() % 4;
      bin[i] = b;
      final k = math.min(panjangHist - 1, (m * skalaHist).floor());
      hist[b][k]++;
      jumlah[b]++;
    }
  }

  final hasil = <double>[];
  for (var b = 0; b < 4; b++) {
    if (jumlah[b] < 50) {
      hasil.add(0);
      continue;
    }
    // Ambang = persentil ke-90 magnitudo di arah ini.
    final target = (jumlah[b] * 0.9).floor();
    var kumulatif = 0;
    var ambangIdx = 0;
    for (var k = 0; k < panjangHist; k++) {
      kumulatif += hist[b][k];
      if (kumulatif > target) {
        ambangIdx = k;
        break;
      }
    }
    final ambang = math.max(_gradienMin, ambangIdx / skalaHist);
    final kandidat = ((jumlah[b] - target).clamp(1, 1 << 30));
    final lompat = math.max(1, kandidat ~/ _sampelPerArah);

    final dy = _arah[b][0];
    final dx = _arah[b][1];
    final step = dy * w + dx;
    final faktor = (b == 1 || b == 3) ? math.sqrt2 : 1.0;
    final lebarList = <double>[];
    var hitung = 0;
    for (var y = tepiAman; y < h - tepiAman; y++) {
      for (var x = tepiAman; x < w - tepiAman; x++) {
        final i = y * w + x;
        final m = mag[i];
        if (m < ambang || bin[i] != b) continue;
        if (hitung++ % lompat != 0) continue;
        // Non-max suppression searah gradien: ambil puncak tepi saja.
        if (mag[i + step] > m || mag[i - step] > m) continue;
        final s = (g[i + step] - g[i - step]).sign;
        if (s == 0) continue;
        var lebar = 0;
        // Maju selama kecerahan terus berubah searah tepi.
        var yy = y, xx = x, v = g[i];
        while (lebar < 40) {
          final ny = yy + dy, nx = xx + dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) break;
          final nv = g[ny * w + nx];
          if ((nv - v) * s <= 0.5) break;
          yy = ny;
          xx = nx;
          v = nv;
          lebar++;
        }
        yy = y;
        xx = x;
        v = g[i];
        while (lebar < 40) {
          final ny = yy - dy, nx = xx - dx;
          if (ny < 0 || ny >= h || nx < 0 || nx >= w) break;
          final nv = g[ny * w + nx];
          if ((v - nv) * s <= 0.5) break;
          yy = ny;
          xx = nx;
          v = nv;
          lebar++;
        }
        lebarList.add(lebar * faktor);
      }
    }
    if (lebarList.length < 25) {
      hasil.add(0);
      continue;
    }
    lebarList.sort();
    final n = lebarList.length;
    hasil.add(n.isOdd ? lebarList[n ~/ 2] : (lebarList[n ~/ 2 - 1] + lebarList[n ~/ 2]) / 2);
  }
  return hasil;
}

/// Hitung ketajaman & kecerahan. [original] dipakai untuk ukuran asli;
/// perhitungan dilakukan pada salinan kecil supaya cepat.
QualityReport analyzeQuality(img.Image original, {bool document = false}) {
  final lebarAnalisis = AppConfig.blurAnalysisWidth;
  final small = original.width > lebarAnalisis
      ? img.copyResize(original, width: lebarAnalisis, interpolation: img.Interpolation.average)
      : original;
  final gray = img.grayscale(small.clone());

  var sum = 0.0;
  for (var y = 0; y < gray.height; y++) {
    for (var x = 0; x < gray.width; x++) {
      sum += gray.getPixel(x, y).r.toDouble();
    }
  }
  final piksel = gray.width * gray.height;
  final brightness = piksel == 0 ? 0.0 : sum / piksel;

  final perArah = ukurLebarTepi(gray);
  final arahTerukur = perArah.where((v) => v > 0).length;
  // Kurang dari dua arah punya tepi yang cukup → foto nyaris tanpa detail
  // (rata, atau buram parah) — anggap buram.
  final edgeWidth = arahTerukur < 2 ? double.infinity : perArah.reduce(math.max);

  return QualityReport(
    edgeWidth: edgeWidth,
    edgeWidthPerArah: perArah,
    brightness: brightness,
    width: original.width,
    height: original.height,
    threshold: document ? AppConfig.blurEdgeWidthSuratJalan : AppConfig.blurEdgeWidthDefault,
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
