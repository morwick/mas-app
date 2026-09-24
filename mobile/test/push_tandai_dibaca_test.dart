import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/push.dart';
import 'package:mas_driver/features/jobs/models.dart';

DriverNotification notif(
  String id, {
  String? jobId,
  String kind = 'job_baru',
  String? readAt,
}) =>
    DriverNotification(
      id: id,
      kind: kind,
      title: 't',
      body: 'b',
      jobId: jobId,
      readAt: readAt,
      createdAt: '2026-09-23T10:00:00+00:00',
    );

void main() {
  group('notifikasiCocokDenganPush', () {
    final semua = [
      notif('n1', jobId: 'job-1', kind: 'job_baru'),
      notif('n2', jobId: 'job-1', kind: 'bukti_transfer'),
      notif('n3', jobId: 'job-2', kind: 'job_baru'),
      notif('n4', jobId: 'job-1', kind: 'job_baru', readAt: '2026-09-23T11:00:00+00:00'),
      notif('n5', jobId: null, kind: 'job_baru'),
    ];

    test('hanya yang sejob dan sejenis', () {
      expect(notifikasiCocokDenganPush(semua, jobId: 'job-1', kind: 'job_baru'), ['n1']);
    });

    test('yang sudah dibaca tidak diulang', () {
      // n4 job & jenisnya sama tetapi readAt sudah terisi.
      final ids = notifikasiCocokDenganPush(semua, jobId: 'job-1', kind: 'job_baru');
      expect(ids, isNot(contains('n4')));
    });

    test('job lain tidak ikut tertandai', () {
      expect(notifikasiCocokDenganPush(semua, jobId: 'job-2', kind: 'job_baru'), ['n3']);
    });

    test('tanpa kind, semua notifikasi job itu yang belum dibaca', () {
      expect(notifikasiCocokDenganPush(semua, jobId: 'job-1', kind: null), ['n1', 'n2']);
      expect(notifikasiCocokDenganPush(semua, jobId: 'job-1', kind: ''), ['n1', 'n2']);
    });

    test('push tanpa job_id tidak menandai apa pun', () {
      // Lebih baik tidak berbuat apa-apa daripada menandai notifikasi orang lain.
      expect(notifikasiCocokDenganPush(semua, jobId: null, kind: 'job_baru'), isEmpty);
      expect(notifikasiCocokDenganPush(semua, jobId: '', kind: 'job_baru'), isEmpty);
    });

    test('jenis yang tidak ada tidak menandai apa pun', () {
      expect(notifikasiCocokDenganPush(semua, jobId: 'job-1', kind: 'job_dibatalkan'), isEmpty);
    });

    test('beberapa notifikasi sejenis ditandai sekaligus', () {
      final dobel = [
        notif('a', jobId: 'job-9'),
        notif('b', jobId: 'job-9'),
      ];
      expect(notifikasiCocokDenganPush(dobel, jobId: 'job-9', kind: 'job_baru'), ['a', 'b']);
    });
  });
}
