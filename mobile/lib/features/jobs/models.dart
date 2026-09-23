import 'job_status.dart';

double? _toDouble(Object? v) => v == null ? null : (v as num).toDouble();

class JobPhoto {
  const JobPhoto({
    required this.id,
    required this.jobId,
    required this.stage,
    required this.slot,
    required this.filePath,
    required this.fileUrl,
    required this.uploadedAt,
    this.sharpnessScore,
    this.kualitasRendah = false,
    this.takenAt,
    this.lat,
    this.lng,
  });

  final String id;
  final String jobId;
  final PhotoStage? stage;
  final PhotoSlot? slot;
  final String filePath;
  final String fileUrl;
  final String uploadedAt;
  final double? sharpnessScore;
  final bool kualitasRendah;
  final String? takenAt;
  final double? lat;
  final double? lng;

  factory JobPhoto.fromJson(Map<String, dynamic> j) => JobPhoto(
        id: j['id'] as String,
        jobId: j['job_id'] as String,
        stage: PhotoStage.tryParse(j['stage'] as String?),
        slot: PhotoSlot.tryParse(j['slot'] as String?),
        filePath: j['file_path'] as String,
        fileUrl: j['file_url'] as String,
        uploadedAt: j['uploaded_at'] as String,
        sharpnessScore: _toDouble(j['sharpness_score']),
        kualitasRendah: (j['kualitas_rendah'] as bool?) ?? false,
        takenAt: j['taken_at'] as String?,
        lat: _toDouble(j['lat']),
        lng: _toDouble(j['lng']),
      );
}

class Job {
  const Job({
    required this.id,
    required this.jobNumber,
    required this.customerNama,
    required this.alatDiangkut,
    required this.asal,
    required this.tujuan,
    required this.etd,
    required this.status,
    required this.createdAt,
    required this.photos,
    this.picNama,
    this.picNoHp,
    this.asalLat,
    this.asalLng,
    this.tujuanLat,
    this.tujuanLng,
    this.routeDistanceKm,
    this.uangJalanPagu,
    this.eta,
    this.etaIsEstimated = false,
    this.catatan,
    this.cancelledReason,
    this.acceptedAt,
    this.completedAt,
    this.validatedAt,
    this.validationNote,
    this.unitKode,
    this.unitNoPolisi,
  });

  final String id;
  final String jobNumber;
  final String customerNama;
  final String? picNama;
  final String? picNoHp;
  final String alatDiangkut;
  final String asal;
  final String tujuan;
  final double? asalLat;
  final double? asalLng;
  final double? tujuanLat;
  final double? tujuanLng;
  final double? routeDistanceKm;
  final double? uangJalanPagu;
  final String etd;
  final String? eta;
  final bool etaIsEstimated;
  final JobStatus status;
  final String? catatan;
  final String? cancelledReason;
  final String? acceptedAt;
  final String createdAt;
  final String? completedAt;
  final String? validatedAt;
  final String? validationNote;
  final String? unitKode;
  final String? unitNoPolisi;
  final List<JobPhoto> photos;

  bool get isAccepted => acceptedAt != null;

  /// Foto per slot untuk satu tahap (foto lama tanpa slot diabaikan).
  Map<PhotoSlot, JobPhoto> photosByStage(PhotoStage stage) {
    final out = <PhotoSlot, JobPhoto>{};
    for (final p in photos) {
      if (p.stage == stage && p.slot != null) out[p.slot!] = p;
    }
    return out;
  }

  List<PhotoSlot> missingSlots(PhotoStage stage) {
    final filled = photosByStage(stage);
    return stage.requiredSlots.where((s) => !filled.containsKey(s)).toList();
  }

  factory Job.fromJson(Map<String, dynamic> j) => Job(
        id: j['id'] as String,
        jobNumber: j['job_number'] as String,
        customerNama: (j['customer_nama'] as String?) ?? '-',
        picNama: j['pic_nama'] as String?,
        picNoHp: j['pic_no_hp'] as String?,
        alatDiangkut: (j['alat_diangkut'] as String?) ?? '-',
        asal: (j['asal'] as String?) ?? '-',
        tujuan: (j['tujuan'] as String?) ?? '-',
        asalLat: _toDouble(j['asal_lat']),
        asalLng: _toDouble(j['asal_lng']),
        tujuanLat: _toDouble(j['tujuan_lat']),
        tujuanLng: _toDouble(j['tujuan_lng']),
        routeDistanceKm: _toDouble(j['route_distance_km']),
        uangJalanPagu: _toDouble(j['uang_jalan_pagu']),
        etd: j['etd'] as String,
        eta: j['eta'] as String?,
        etaIsEstimated: (j['eta_is_estimated'] as bool?) ?? false,
        status: JobStatus.parse(j['status'] as String).normalized,
        catatan: j['catatan'] as String?,
        cancelledReason: j['cancelled_reason'] as String?,
        acceptedAt: j['accepted_at'] as String?,
        createdAt: j['created_at'] as String,
        completedAt: j['completed_at'] as String?,
        validatedAt: j['validated_at'] as String?,
        validationNote: j['validation_note'] as String?,
        unitKode: j['unit_kode'] as String?,
        unitNoPolisi: j['unit_no_polisi'] as String?,
        photos: ((j['photos'] as List?) ?? const [])
            .map((e) => JobPhoto.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

/// Posisi uang jalan (hasil `job_uang_jalan_posisi`).
class UangJalanPosisi {
  const UangJalanPosisi({
    required this.pagu,
    required this.cair,
    required this.sisa,
    required this.adaBukti,
    required this.pendingRequest,
  });

  final double pagu;
  final double cair;
  final double sisa;
  final bool adaBukti;
  final bool pendingRequest;

  /// BR-05: boleh mengajukan selama total diterima < pagu dan tidak ada
  /// pengajuan yang masih menunggu.
  bool get canRequest => sisa > 0 && !pendingRequest;

  factory UangJalanPosisi.fromJson(Map<String, dynamic> j) => UangJalanPosisi(
        pagu: _toDouble(j['pagu']) ?? 0,
        cair: _toDouble(j['cair']) ?? 0,
        sisa: _toDouble(j['sisa']) ?? 0,
        adaBukti: (j['ada_bukti'] as bool?) ?? false,
        pendingRequest: (j['pending_request'] as bool?) ?? false,
      );
}

enum RequestStatus {
  diajukan('diajukan', 'Menunggu pencairan'),
  dicairkan('dicairkan', 'Dicairkan'),
  ditolak('ditolak', 'Ditolak');

  const RequestStatus(this.value, this.label);
  final String value;
  final String label;

  static RequestStatus parse(String raw) =>
      RequestStatus.values.firstWhere((s) => s.value == raw, orElse: () => RequestStatus.diajukan);
}

class UangJalanRequest {
  const UangJalanRequest({
    required this.id,
    required this.nominal,
    required this.status,
    required this.requestedAt,
    this.catatan,
    this.alasanTolak,
    this.decidedAt,
  });

  final String id;
  final double nominal;
  final String? catatan;
  final RequestStatus status;
  final String? alasanTolak;
  final String requestedAt;
  final String? decidedAt;

  factory UangJalanRequest.fromJson(Map<String, dynamic> j) => UangJalanRequest(
        id: j['id'] as String,
        nominal: _toDouble(j['nominal']) ?? 0,
        catatan: j['catatan'] as String?,
        status: RequestStatus.parse(j['status'] as String),
        alasanTolak: j['alasan_tolak'] as String?,
        requestedAt: j['requested_at'] as String,
        decidedAt: j['decided_at'] as String?,
      );
}

class UangJalanTransaksi {
  const UangJalanTransaksi({
    required this.id,
    required this.jenis,
    required this.tanggal,
    required this.jumlah,
    this.sumberDanaNama,
    this.buktiTransferUrl,
  });

  final String id;
  final String jenis;
  final String tanggal;
  final double jumlah;
  final String? sumberDanaNama;
  final String? buktiTransferUrl;

  bool get isPencairan => jenis == 'pencairan';

  factory UangJalanTransaksi.fromJson(Map<String, dynamic> j) => UangJalanTransaksi(
        id: j['id'] as String,
        jenis: j['jenis'] as String,
        tanggal: j['tanggal'] as String,
        jumlah: _toDouble(j['jumlah']) ?? 0,
        sumberDanaNama: j['sumber_dana_nama'] as String?,
        buktiTransferUrl: j['bukti_transfer_url'] as String?,
      );
}

class JobUangJalan {
  const JobUangJalan({required this.transaksi, required this.pengajuan, required this.posisi});

  final List<UangJalanTransaksi> transaksi;
  final List<UangJalanRequest> pengajuan;
  final UangJalanPosisi? posisi;

  UangJalanRequest? get pending {
    for (final p in pengajuan) {
      if (p.status == RequestStatus.diajukan) return p;
    }
    return null;
  }

  factory JobUangJalan.fromJson(Map<String, dynamic> j) => JobUangJalan(
        transaksi: ((j['transaksi'] as List?) ?? const [])
            .map((e) => UangJalanTransaksi.fromJson(e as Map<String, dynamic>))
            .toList(),
        pengajuan: ((j['pengajuan'] as List?) ?? const [])
            .map((e) => UangJalanRequest.fromJson(e as Map<String, dynamic>))
            .toList(),
        posisi: j['posisi'] == null ? null : UangJalanPosisi.fromJson(j['posisi'] as Map<String, dynamic>),
      );
}

class DriverNotification {
  const DriverNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    this.href,
    this.jobId,
    this.readAt,
  });

  final String id;
  final String kind;
  final String title;
  final String body;
  final String? href;
  final String? jobId;
  final String? readAt;
  final String createdAt;

  bool get isUnread => readAt == null;

  factory DriverNotification.fromJson(Map<String, dynamic> j) => DriverNotification(
        id: j['id'] as String,
        kind: j['kind'] as String,
        title: j['title'] as String,
        body: j['body'] as String,
        href: j['href'] as String?,
        jobId: j['job_id'] as String?,
        readAt: j['read_at'] as String?,
        createdAt: j['created_at'] as String,
      );
}
