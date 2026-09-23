import 'package:intl/intl.dart';

final _rupiah = NumberFormat.currency(locale: 'id_ID', symbol: 'Rp ', decimalDigits: 0);
final _dateTime = DateFormat('d MMM yyyy, HH:mm', 'id_ID');
final _date = DateFormat('d MMM yyyy', 'id_ID');
final _time = DateFormat('HH:mm', 'id_ID');
final _stamp = DateFormat('dd-MM-yyyy HH:mm:ss');

String formatRupiah(num value) => _rupiah.format(value);

/// Parse angka dari input rupiah bebas format ("1.500.000", "1500000").
int? parseRupiah(String raw) {
  final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
  if (digits.isEmpty) return null;
  return int.tryParse(digits);
}

DateTime? parseIso(String? iso) {
  if (iso == null || iso.isEmpty) return null;
  return DateTime.tryParse(iso)?.toLocal();
}

String formatDateTime(String? iso) {
  final d = parseIso(iso);
  return d == null ? '-' : _dateTime.format(d);
}

String formatDate(String? iso) {
  final d = parseIso(iso);
  return d == null ? '-' : _date.format(d);
}

String formatTime(String? iso) {
  final d = parseIso(iso);
  return d == null ? '-' : _time.format(d);
}

/// Teks stempel foto: tanggal-jam lokal (FR-PHOTO-06).
String formatStamp(DateTime d) => _stamp.format(d);

String formatCoord(double? lat, double? lng) {
  if (lat == null || lng == null) return 'GPS tidak tersedia';
  return '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';
}

/// "5 menit lalu", "2 jam lalu", dst. — untuk daftar notifikasi.
String formatRelative(String? iso) {
  final d = parseIso(iso);
  if (d == null) return '';
  final diff = DateTime.now().difference(d);
  if (diff.inMinutes < 1) return 'baru saja';
  if (diff.inMinutes < 60) return '${diff.inMinutes} menit lalu';
  if (diff.inHours < 24) return '${diff.inHours} jam lalu';
  if (diff.inDays < 7) return '${diff.inDays} hari lalu';
  return _date.format(d);
}
