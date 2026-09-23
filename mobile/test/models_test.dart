import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/formatters.dart';
import 'package:mas_driver/features/jobs/job_status.dart';
import 'package:mas_driver/features/jobs/models.dart';

Map<String, dynamic> _jobJson({String status = 'loading', List<Map<String, dynamic>> photos = const []}) => {
      'id': 'j1',
      'job_number': 'JOB-2026-001',
      'customer_nama': 'PT Contoh',
      'alat_diangkut': 'Excavator PC200',
      'asal': 'Pool Cikarang',
      'tujuan': 'Site Karawang',
      'etd': '2026-09-22T01:00:00+00:00',
      'status': status,
      'created_at': '2026-09-21T10:00:00+00:00',
      'uang_jalan_pagu': 1500000,
      'accepted_at': status == 'ditugaskan' ? null : '2026-09-22T00:30:00+00:00',
      'photos': photos,
    };

Map<String, dynamic> _photo(String stage, String slot, {bool rendah = false}) => {
      'id': '$stage-$slot',
      'job_id': 'j1',
      'type': stage,
      'stage': stage,
      'slot': slot,
      'file_path': 'x.jpg',
      'file_url': 'https://x/x.jpg',
      'uploaded_at': '2026-09-22T02:00:00+00:00',
      'kualitas_rendah': rendah,
    };

void main() {
  group('JobStatus', () {
    test('menunggu_pickup lama dinormalkan ke ditugaskan', () {
      expect(JobStatus.parse('menunggu_pickup').normalized, JobStatus.ditugaskan);
      expect(Job.fromJson(_jobJson(status: 'menunggu_pickup')).status, JobStatus.ditugaskan);
    });

    test('urutan status driver mengikuti PRD 6.1', () {
      expect(JobStatus.diterima.nextDriverStatus, JobStatus.loading);
      expect(JobStatus.loading.nextDriverStatus, JobStatus.dalamPerjalanan);
      expect(JobStatus.dalamPerjalanan.nextDriverStatus, JobStatus.unloading);
      expect(JobStatus.unloading.nextDriverStatus, JobStatus.serahTerimaPool);
      expect(JobStatus.serahTerimaPool.nextDriverStatus, JobStatus.menungguValidasi);
      expect(JobStatus.menungguValidasi.nextDriverStatus, isNull);
      expect(JobStatus.ditugaskan.nextDriverStatus, isNull);
    });

    test('tahap foto hanya terbuka saat status masuk tahapnya', () {
      expect(JobStatus.diterima.openPhotoStage, isNull);
      expect(JobStatus.loading.openPhotoStage, PhotoStage.loading);
      expect(JobStatus.dalamPerjalanan.openPhotoStage, isNull);
      expect(JobStatus.unloading.openPhotoStage, PhotoStage.unloading);
      expect(JobStatus.serahTerimaPool.openPhotoStage, PhotoStage.serahTerima);
    });

    test('menunggu_validasi masih dianggap aktif (driver tetap In Job)', () {
      expect(JobStatus.menungguValidasi.isActive, isTrue);
      expect(JobStatus.selesai.isActive, isFalse);
      expect(JobStatus.cancelled.isClosed, isTrue);
    });
  });

  group('Slot foto (BR-06)', () {
    test('loading/unloading butuh 5 slot, serah terima 1', () {
      expect(PhotoStage.loading.requiredSlots.length, 5);
      expect(PhotoStage.unloading.requiredSlots.length, 5);
      expect(PhotoStage.serahTerima.requiredSlots, [PhotoSlot.serahTerima]);
    });

    test('judul slot sesuai PRD', () {
      expect(PhotoSlot.kiri.label, 'Foto sisi kiri kendaraan');
      expect(PhotoSlot.suratTimbang.label, 'Foto surat timbang');
      expect(PhotoSlot.suratTimbang.isDocument, isTrue);
    });

    test('missingSlots menghitung slot yang belum terisi per tahap', () {
      final job = Job.fromJson(_jobJson(photos: [
        _photo('loading', 'depan'),
        _photo('loading', 'belakang'),
        _photo('loading', 'kanan'),
        _photo('loading', 'kiri'),
        _photo('unloading', 'depan'),
      ]));
      expect(job.missingSlots(PhotoStage.loading), [PhotoSlot.suratTimbang]);
      expect(job.missingSlots(PhotoStage.unloading).length, 4);
      expect(job.photosByStage(PhotoStage.loading).length, 4);
    });

    test('foto lama tanpa slot diabaikan', () {
      final legacy = _photo('loading', 'depan')..['slot'] = null;
      final job = Job.fromJson(_jobJson(photos: [legacy]));
      expect(job.photosByStage(PhotoStage.loading), isEmpty);
    });
  });

  group('Uang jalan (BR-05)', () {
    test('boleh mengajukan hanya bila sisa > 0 dan tidak ada pengajuan menunggu', () {
      UangJalanPosisi p({double sisa = 500000, bool pending = false}) => UangJalanPosisi(
            pagu: 1500000,
            cair: 1500000 - sisa,
            sisa: sisa,
            adaBukti: true,
            pendingRequest: pending,
          );
      expect(p().canRequest, isTrue);
      expect(p(sisa: 0).canRequest, isFalse);
      expect(p(pending: true).canRequest, isFalse);
    });

    test('JobUangJalan.pending mengembalikan pengajuan berstatus diajukan', () {
      final uj = JobUangJalan.fromJson({
        'transaksi': <Map<String, dynamic>>[],
        'ringkasan': <String, dynamic>{},
        'pengajuan': [
          {
            'id': 'r1',
            'job_id': 'j1',
            'driver_id': 'd',
            'nominal': 300000,
            'status': 'dicairkan',
            'requested_at': '2026-09-22T00:00:00Z',
          },
          {
            'id': 'r2',
            'job_id': 'j1',
            'driver_id': 'd',
            'nominal': 200000,
            'status': 'diajukan',
            'requested_at': '2026-09-22T01:00:00Z',
          },
        ],
        'posisi': {'pagu': 1500000, 'cair': 300000, 'sisa': 1200000, 'ada_bukti': true, 'pending_request': true},
      });
      expect(uj.pending?.id, 'r2');
      expect(uj.posisi?.canRequest, isFalse);
    });

    test('teks alert pengajuan persis sesuai kesepakatan', () {
      expect(
        ajukanUangJalanAlert,
        'Apakah anda yakin ingin mengajukan uang jalan? Anda baru bisa melanjutkan perjalanan '
        'setelah admin kasir mengupload bukti transfer uang jalan.',
      );
    });
  });

  group('formatters', () {
    test('parseRupiah menerima pemisah ribuan', () {
      expect(parseRupiah('1.500.000'), 1500000);
      expect(parseRupiah('Rp 250.000'), 250000);
      expect(parseRupiah(''), isNull);
    });
  });
}
