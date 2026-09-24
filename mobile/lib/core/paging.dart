// Daftar yang dimuat bertahap sambil digulir.
//
// Dipisah dari Riverpod dengan sengaja: bagian yang paling mudah salah adalah
// penggabungan halaman, dan itu fungsi murni yang bisa diuji sendiri.

/// Satu halaman hasil dari server (`{items, total, page, page_size}`).
class Halaman<T> {
  const Halaman({required this.items, required this.total});

  final List<T> items;

  /// Jumlah seluruh baris di server, bukan hanya yang ada di halaman ini.
  final int total;

  static Halaman<T> dariJson<T>(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) baca,
  ) =>
      Halaman(
        items: ((json['items'] as List<dynamic>?) ?? const [])
            .map((e) => baca(e as Map<String, dynamic>))
            .toList(),
        total: (json['total'] as num?)?.toInt() ?? 0,
      );
}

/// Isi daftar yang sudah terkumpul beserta posisinya.
class DaftarBertahap<T> {
  const DaftarBertahap({
    this.items = const [],
    this.total = 0,
    this.halaman = 0,
    this.memuatLagi = false,
    this.habis = false,
  });

  final List<T> items;
  final int total;

  /// Halaman terakhir yang sudah masuk; 0 berarti belum ada apa-apa.
  final int halaman;

  /// Sedang mengambil halaman berikutnya — untuk indikator di kaki daftar.
  final bool memuatLagi;

  /// Server sudah tidak punya baris lagi.
  final bool habis;

  bool get adaLagi => !habis;
  bool get kosong => items.isEmpty;

  DaftarBertahap<T> salin({List<T>? items, int? total, int? halaman, bool? memuatLagi, bool? habis}) =>
      DaftarBertahap(
        items: items ?? this.items,
        total: total ?? this.total,
        halaman: halaman ?? this.halaman,
        memuatLagi: memuatLagi ?? this.memuatLagi,
        habis: habis ?? this.habis,
      );
}

/// Sambung halaman berikutnya ke daftar yang sudah tampil.
///
/// Baris ber-id sama dibuang. Data di server bergerak sementara driver
/// menggulir — job baru masuk, notifikasi baru tiba — sehingga baris yang sudah
/// tampil bisa terdorong ke halaman berikutnya dan terkirim dua kali. Tanpa
/// penyaringan ini daftarnya dobel dan `ListView` protes karena key-nya kembar.
DaftarBertahap<T> gabungHalaman<T>(
  DaftarBertahap<T> lama,
  Halaman<T> baru, {
  required String Function(T) idOf,
  required int halaman,
}) {
  final sudahAda = lama.items.map(idOf).toSet();
  final tambahan = baru.items.where((e) => sudahAda.add(idOf(e))).toList();
  final gabungan = [...lama.items, ...tambahan];
  return DaftarBertahap(
    items: gabungan,
    total: baru.total,
    halaman: halaman,
    // Halaman kosong = sudah mentok. Perbandingan dengan total saja tidak
    // cukup: kalau ada baris kembar yang dibuang, panjangnya tidak akan pernah
    // menyentuh total dan daftarnya akan terus meminta halaman berikutnya.
    habis: baru.items.isEmpty || gabungan.length >= baru.total,
  );
}
