import 'package:flutter/material.dart';

/// Warna mengikuti design system web (brand hijau MAS).
class MasColors {
  MasColors._();

  static const brand = Color(0xFF1C9600);
  static const brandDark = Color(0xFF145B00);
  static const brandLight = Color(0xFFE8F7E0);
  static const page = Color(0xFFF5F5F0);
  static const text = Color(0xFF1A1A17);
  static const muted = Color(0xFF5F5E5A);
  static const subtle = Color(0xFF8A8983);
  static const danger = Color(0xFFC13838);
  static const dangerBg = Color(0xFFFCEBEB);
  static const warning = Color(0xFF854F0B);
  static const warningBg = Color(0xFFFAEEDA);
  static const info = Color(0xFF1F4FA8);
  static const infoBg = Color(0xFFEAF2FF);
}

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: MasColors.brand,
    primary: MasColors.brand,
    surface: Colors.white,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: MasColors.page,
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: MasColors.text,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      centerTitle: false,
    ),
    cardTheme: CardThemeData(
      color: Colors.white,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.black.withValues(alpha: 0.10), width: 0.5),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        foregroundColor: MasColors.text,
        side: BorderSide(color: Colors.black.withValues(alpha: 0.18)),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.18)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.black.withValues(alpha: 0.18)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: MasColors.brand, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating),
  );
}
