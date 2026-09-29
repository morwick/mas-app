import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mas_driver/core/api_client.dart';
import 'package:mas_driver/core/paging.dart';
import 'package:mas_driver/core/session.dart';
import 'package:mas_driver/core/widgets/skeleton.dart';
import 'package:mas_driver/core/widgets_paging.dart';
import 'package:mas_driver/features/auth/auth_controller.dart';
import 'package:mas_driver/features/jobs/jobs_list_screen.dart';
import 'package:mas_driver/features/jobs/models.dart';
import 'package:mas_driver/features/jobs/providers.dart';
import 'package:mas_driver/features/jobs/repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Tiap tab menunggu sampai dijawab manual oleh test.
class _RepoTertunda extends DriverRepository {
  _RepoTertunda() : super(_ApiKosong());

  final Map<String, Completer<Halaman<Job>>> tunggu = {
    for (final t in JobTab.values) t.value: Completer<Halaman<Job>>(),
  };

  @override
  Future<Halaman<Job>> jobsPage({required String status, required int page, required int pageSize}) =>
      tunggu[status]!.future;
}

class _ApiKosong implements ApiClient {
  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

const _kosong = Halaman<Job>(items: [], total: 0);

void main() {
  testWidgets('tiap tab menampilkan kerangka selama datanya belum ada', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final store = await SessionStore.create();
    final repo = _RepoTertunda();
    await tester.pumpWidget(ProviderScope(
      overrides: [
        sessionStoreProvider.overrideWithValue(store),
        driverRepositoryProvider.overrideWithValue(repo),
        notificationsProvider.overrideWith((ref) async => const <DriverNotification>[]),
      ],
      child: const MaterialApp(home: JobsListScreen()),
    ));
    await tester.pump();

    // Tab awal (Aktif) belum ada data → kerangka, bukan spinner.
    expect(find.byKey(const Key('daftar-skeleton')), findsOneWidget);
    expect(find.byType(KartuJobSkeleton), findsWidgets);
    expect(find.byType(CircularProgressIndicator), findsNothing);

    // Pindah ke tab lain yang juga belum ada data → tetap kerangka.
    for (final tab in ['Perlu dikonfirmasi', 'Selesai', 'Aktif']) {
      await tester.tap(find.text(tab));
      await tester.pump();
      expect(find.byKey(const Key('daftar-skeleton')), findsOneWidget, reason: tab);
    }

    // Data tab Aktif datang → kerangka diganti isi (di sini: kosong).
    repo.tunggu['aktif']!.complete(_kosong);
    await tester.pump();
    await tester.pump();
    expect(find.byKey(const Key('daftar-skeleton')), findsNothing);
    expect(find.text('Tidak ada job'), findsOneWidget);

    // Tab yang datanya belum datang masih menampilkan kerangka.
    await tester.tap(find.text('Perlu dikonfirmasi'));
    await tester.pump();
    expect(find.byKey(const Key('daftar-skeleton')), findsOneWidget);

    repo.tunggu['konfirmasi']!.complete(_kosong);
    repo.tunggu['selesai']!.complete(_kosong);
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('lazy scroll: kaki daftar menampilkan kerangka saat memuat halaman berikutnya', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: DaftarBergulirBertahap<String>(
          daftar: const DaftarBertahap(items: ['a', 'b'], total: 10, halaman: 1),
          onMuatLagi: () async {},
          itemBuilder: (_, s) => Text(s),
          kakiMemuat: const KartuJobSkeleton(),
        ),
      ),
    ));
    expect(find.text('a'), findsOneWidget);
    expect(find.byType(KartuJobSkeleton), findsOneWidget);
  });
}
