import 'package:url_launcher/url_launcher.dart';

/// Membuka Google Maps pada satu tempat milik job.

/// Tautan ke satu tempat, diurutkan dari yang paling tepat.
///
/// Bentuk utamanya `geo:<titik>?q=<titik>(<nama>)`. Titiknya dipakai apa adanya
/// sebagai tujuan — Maps tidak menggesernya ke tempat lain yang namanya mirip —
/// sementara labelnya membuat pin terbaca "Nanga Kemangai, Sintang" alih-alih
/// sederet angka. Dari situ driver tinggal menekan Rute di Maps.
///
/// Tautan web dipakai bila skema `geo:` tidak ada yang menangani.
///
/// Tanpa titik, nama tempat dicari sebagai teks. Tanpa keduanya tidak ada yang
/// bisa dituju dan daftarnya kosong.
List<Uri> rutePetaUri({double? lat, double? lng, required String alamat}) {
  final punyaTitik = lat != null && lng != null;
  final nama = alamat.trim();
  if (!punyaTitik && nama.isEmpty) return const [];

  if (!punyaTitik) {
    return [
      Uri.parse('geo:0,0?q=${Uri.encodeComponent(nama)}'),
      Uri.https('www.google.com', '/maps/search/', {'api': '1', 'query': nama}),
    ];
  }

  final titik = '$lat,$lng';
  final label = nama.isEmpty ? '' : '(${Uri.encodeComponent(nama)})';
  return [
    Uri.parse('geo:$titik?q=$titik$label'),
    Uri.https('www.google.com', '/maps/search/', {'api': '1', 'query': titik}),
  ];
}

/// Coba tiap tautan sampai ada yang terbuka. False berarti tidak satu pun bisa.
Future<bool> bukaRutePeta({double? lat, double? lng, required String alamat}) async {
  for (final uri in rutePetaUri(lat: lat, lng: lng, alamat: alamat)) {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return true;
    } catch (_) {
      // Skema tidak dikenal perangkat ini — coba tautan berikutnya.
    }
  }
  return false;
}
