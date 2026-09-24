import 'package:flutter/material.dart';

import 'theme.dart';

/// Tampilan gagal memuat dengan tombol coba lagi.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off, size: 40, color: MasColors.subtle),
              const SizedBox(height: 8),
              Text(message, textAlign: TextAlign.center, style: const TextStyle(color: MasColors.muted)),
              const SizedBox(height: 12),
              OutlinedButton(onPressed: onRetry, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
}

/// Keadaan kosong (daftar tanpa isi).
class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, this.subtitle});

  final IconData icon;
  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 44, color: MasColors.subtle),
              const SizedBox(height: 10),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600, color: MasColors.muted)),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 13, color: MasColors.subtle)),
              ],
            ],
          ),
        ),
      );
}
