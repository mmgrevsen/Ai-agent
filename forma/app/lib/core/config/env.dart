/// Build-time configuration, passed with `--dart-define` (or
/// `--dart-define-from-file=env/dev.json`).
///
/// Only *public* values belong here. The Supabase publishable key is designed to be
/// shipped in clients — row-level security protects the data. Secrets (AI
/// keys, food API keys, service-role key) live only in Supabase Edge
/// Function secrets.
abstract final class Env {
  static const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  /// Supabase publishable (client) key. `SUPABASE_ANON_KEY` is accepted for
  /// projects that still use the legacy anon key.
  static const supabaseKey = String.fromEnvironment(
    'SUPABASE_PUBLISHABLE_KEY',
    defaultValue: String.fromEnvironment('SUPABASE_ANON_KEY'),
  );

  /// Contact string sent to Open Food Facts as required by their API terms.
  static const offUserAgent = String.fromEnvironment(
    'OFF_USER_AGENT',
    defaultValue: 'Forma/1.0 (https://github.com/mmgrevsen/Ai-agent)',
  );

  static bool get hasBackend => supabaseUrl.isNotEmpty && supabaseKey.isNotEmpty;
}
