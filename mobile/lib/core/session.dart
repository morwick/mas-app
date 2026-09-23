import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// Sesi driver yang tersimpan di perangkat (token dari `POST /api/driver/login`).
class DriverSession {
  const DriverSession({
    required this.token,
    required this.driverId,
    required this.nama,
    required this.noHp,
  });

  final String token;
  final String driverId;
  final String nama;
  final String noHp;

  Map<String, dynamic> toJson() => {
        'token': token,
        'driver_id': driverId,
        'nama': nama,
        'no_hp': noHp,
      };

  factory DriverSession.fromJson(Map<String, dynamic> json) => DriverSession(
        token: json['token'] as String,
        driverId: json['driver_id'] as String,
        nama: (json['nama'] as String?) ?? '',
        noHp: (json['no_hp'] as String?) ?? '',
      );
}

/// Penyimpanan sesi & token FCM. Token bertahan sampai logout supaya driver
/// di jalan tidak perlu login ulang.
class SessionStore {
  SessionStore(this._prefs);

  static const _sessionKey = 'mas_driver_session';
  static const _fcmKey = 'mas_fcm_token';

  final SharedPreferences _prefs;

  static Future<SessionStore> create() async =>
      SessionStore(await SharedPreferences.getInstance());

  DriverSession? read() {
    final raw = _prefs.getString(_sessionKey);
    if (raw == null) return null;
    try {
      return DriverSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(DriverSession session) =>
      _prefs.setString(_sessionKey, jsonEncode(session.toJson()));

  Future<void> clear() => _prefs.remove(_sessionKey);

  String? get fcmToken => _prefs.getString(_fcmKey);
  Future<void> setFcmToken(String? token) =>
      token == null ? _prefs.remove(_fcmKey) : _prefs.setString(_fcmKey, token);
}
