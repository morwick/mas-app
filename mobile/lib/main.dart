import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/push.dart';
import 'core/session.dart';
import 'features/auth/auth_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('id_ID');

  final store = await SessionStore.create();
  final container = ProviderContainer(
    overrides: [sessionStoreProvider.overrideWithValue(store)],
  );

  // Push opsional — tidak memblokir tampilan pertama.
  container.read(pushServiceProvider).init();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: const MasDriverApp(),
    ),
  );
}
