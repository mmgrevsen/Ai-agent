/// Where a value came from. Every user-facing number should be traceable to
/// one of these so recorded, imported, calculated and estimated data are never
/// confused.
enum Provenance {
  /// Entered by the user (a logged set, a weigh-in, a diary entry).
  recorded('Recorded', 'Entered by you.'),

  /// Read from Apple Health or another connected source.
  imported('Imported', 'Imported from Apple Health. Accuracy depends on the source device.'),

  /// Derived deterministically from recorded data (trend, totals, e1RM).
  calculated('Calculated', 'Calculated from your recorded data.'),

  /// A formula-based or partial-data estimate.
  estimated('Estimated', 'An estimate, not a measurement. It improves as you log more data.'),

  /// Produced by an AI model; always editable.
  aiEstimate('AI estimate', 'Estimated by AI. Check it and correct it if needed.'),

  /// Food values from a laboratory/government reference database.
  verified('Verified', 'From a reference database with laboratory-analysed values.'),

  /// Food values from a crowd-sourced database such as Open Food Facts.
  community('Community', 'Crowd-sourced data (Open Food Facts). Values may contain errors.'),

  /// Food values entered by the user.
  custom('Custom', 'A food you created.');

  const Provenance(this.label, this.explanation);

  final String label;
  final String explanation;

  static Provenance fromName(String? name, {Provenance fallback = Provenance.recorded}) =>
      Provenance.values.firstWhere((p) => p.name == name, orElse: () => fallback);
}
