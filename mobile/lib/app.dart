import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'core/push.dart';
import 'core/theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/jobs/job_detail_screen.dart';
import 'features/jobs/jobs_list_screen.dart';
import 'features/notifications/notifications_screen.dart';

/// Jembatan supaya go_router bisa mengevaluasi ulang redirect saat sesi berubah.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(authProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final listenable = _AuthListenable(ref);
  final router = GoRouter(
    initialLocation: '/jobs',
    refreshListenable: listenable,
    redirect: (context, state) {
      final loggedIn = ref.read(authProvider) != null;
      final atLogin = state.matchedLocation == '/login';
      if (!loggedIn) return atLogin ? null : '/login';
      if (atLogin) return '/jobs';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      GoRoute(
        path: '/jobs',
        builder: (_, _) => const JobsListScreen(),
        routes: [
          GoRoute(
            path: ':id',
            builder: (_, state) => JobDetailScreen(jobId: state.pathParameters['id']!),
          ),
        ],
      ),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationsScreen()),
    ],
  );

  // Ketukan notifikasi → buka detail job.
  ref.read(pushServiceProvider).onOpenJob = (jobId) {
    if (jobId != null && ref.read(authProvider) != null) router.push('/jobs/$jobId');
  };

  ref.onDispose(() {
    router.dispose();
    listenable.dispose();
  });
  return router;
});

class MasDriverApp extends ConsumerWidget {
  const MasDriverApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: 'MAS Driver',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) => _ForegroundPushBanner(child: child!),
    );
  }
}

/// Tampilkan pesan push yang datang saat aplikasi terbuka sebagai snackbar.
class _ForegroundPushBanner extends ConsumerStatefulWidget {
  const _ForegroundPushBanner({required this.child});
  final Widget child;

  @override
  ConsumerState<_ForegroundPushBanner> createState() => _ForegroundPushBannerState();
}

class _ForegroundPushBannerState extends ConsumerState<_ForegroundPushBanner> {
  final _messengerKey = GlobalKey<ScaffoldMessengerState>();

  @override
  void initState() {
    super.initState();
    ref.read(pushServiceProvider).foregroundMessages.listen((msg) {
      final title = msg.notification?.title ?? 'Notifikasi';
      final body = msg.notification?.body ?? '';
      _messengerKey.currentState?.showSnackBar(SnackBar(
        content: Text(body.isEmpty ? title : '$title\n$body'),
        duration: const Duration(seconds: 5),
      ));
    });
  }

  @override
  Widget build(BuildContext context) =>
      ScaffoldMessenger(key: _messengerKey, child: widget.child);
}
