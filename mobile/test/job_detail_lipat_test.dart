import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/features/jobs/job_detail_screen.dart';
import 'package:mas_driver/features/jobs/job_status.dart';

void main() {
  group('lipatan detail job', () {
    test('terbuka selama belum ada tahap foto', () {
      expect(detailJobTerbuka(pilihanDriver: null, tahapFoto: null), isTrue);
    });

    test('melipat sendiri saat muat dan bongkar', () {
      // Inti fiturnya: permintaan foto harus kelihatan tanpa menggulir.
      for (final tahap in [PhotoStage.loading, PhotoStage.unloading]) {
        expect(detailJobTerbuka(pilihanDriver: null, tahapFoto: tahap), isFalse);
      }
    });

    test('serah terima dokumen juga melipat detail', () {
      expect(detailJobTerbuka(pilihanDriver: null, tahapFoto: PhotoStage.serahTerima), isFalse);
    });

    test('pilihan driver mengalahkan otomatis', () {
      expect(detailJobTerbuka(pilihanDriver: true, tahapFoto: PhotoStage.loading), isTrue);
      expect(detailJobTerbuka(pilihanDriver: false, tahapFoto: null), isFalse);
    });
  });
}
