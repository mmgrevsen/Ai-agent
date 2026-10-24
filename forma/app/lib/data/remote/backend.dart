import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/config/env.dart';

/// Thrown for backend failures with a message safe to show to users.
class BackendException implements Exception {
  const BackendException(this.message, {this.status});
  final String message;
  final int? status;

  @override
  String toString() => message;
}

/// Thin wrapper around Supabase. `client == null` means the app runs in
/// local-only mode (no account, no sync, no server-side AI).
class Backend {
  Backend(this.client);

  final SupabaseClient? client;

  static Future<Backend> init() async {
    if (!Env.hasBackend) return Backend(null);
    await Supabase.initialize(url: Env.supabaseUrl, publishableKey: Env.supabaseKey);
    return Backend(Supabase.instance.client);
  }

  bool get configured => client != null;
  User? get user => client?.auth.currentUser;
  bool get signedIn => user != null;

  Stream<User?> authChanges() {
    final c = client;
    if (c == null) return Stream.value(null);
    return Stream.multi((controller) {
      controller.add(c.auth.currentUser);
      final sub = c.auth.onAuthStateChange.listen((s) => controller.add(s.session?.user));
      controller.onCancel = sub.cancel;
    });
  }

  SupabaseClient _require() {
    final c = client;
    if (c == null) {
      throw const BackendException('This feature needs the Forma server. It is not configured in this build.');
    }
    return c;
  }

  /// Calls an Edge Function and returns its JSON body.
  Future<Map<String, dynamic>> invoke(String function, Map<String, dynamic> body, {Duration timeout = const Duration(seconds: 60)}) async {
    final c = _require();
    if (c.auth.currentSession == null) {
      throw const BackendException('Sign in to use this feature.', status: 401);
    }
    try {
      final res = await c.functions.invoke(function, body: body).timeout(timeout);
      final data = res.data;
      if (data is Map<String, dynamic>) return data;
      throw const BackendException('Unexpected response from the server.');
    } on FunctionException catch (e) {
      final details = e.details;
      final msg = details is Map && details['error'] is String ? details['error'] as String : null;
      throw BackendException(
        msg ??
            switch (e.status) {
              401 => 'Your session has expired. Please sign in again.',
              429 => 'You have reached the usage limit. Try again later.',
              _ => 'The server could not complete the request (${e.status}).',
            },
        status: e.status,
      );
    } on TimeoutException {
      throw const BackendException('The server took too long to respond. Check your connection and try again.');
    }
  }

  // ------------------------------------------------------------ auth

  Future<void> signInWithPassword(String email, String password) async {
    try {
      await _require().auth.signInWithPassword(email: email.trim(), password: password);
    } on AuthException catch (e) {
      throw BackendException(e.message);
    }
  }

  /// Returns true when the account still needs email confirmation.
  Future<bool> signUp(String email, String password) async {
    try {
      final res = await _require().auth.signUp(email: email.trim(), password: password);
      return res.session == null;
    } on AuthException catch (e) {
      throw BackendException(e.message);
    }
  }

  Future<void> sendMagicLink(String email) async {
    try {
      await _require().auth.signInWithOtp(email: email.trim(), emailRedirectTo: 'app.forma://login-callback');
    } on AuthException catch (e) {
      throw BackendException(e.message);
    }
  }

  Future<void> signInWithApple() async {
    try {
      await _require().auth.signInWithOAuth(OAuthProvider.apple, redirectTo: 'app.forma://login-callback');
    } on AuthException catch (e) {
      throw BackendException(e.message);
    }
  }

  Future<void> signOut() async => client?.auth.signOut();
}
