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

  /// Build number of this app, set by CI (`--dart-define=FORMA_BUILD=…`).
  /// 0 means a local development build.
  static const appBuild = int.fromEnvironment('FORMA_BUILD');

  /// Version of the content bundled in this build (UTC yyyymmddHHMM of the
  /// commit, set by CI). Downloaded content only wins if it is newer.
  static const builtInContentVersion = int.fromEnvironment('FORMA_CONTENT_VERSION');

  /// Where published content is downloaded from. A public, read-only file.
  static const contentUrl = String.fromEnvironment(
    'CONTENT_URL',
    defaultValue: 'https://github.com/mmgrevsen/Ai-agent/releases/download/forma-content-latest/content.json',
  );

  static bool get hasBackend => supabaseUrl.isNotEmpty && supabaseKey.isNotEmpty;
}
