import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import 'inputs.dart';

/// Single-field dialogs. Each dialog owns its controller, so it is disposed
/// only after the route (and its exit animation) is gone.
Future<String?> promptText(
  BuildContext context, {
  required String title,
  String label = '',
  String initial = '',
  int maxLines = 1,
  String confirmLabel = 'Save',
  bool allowEmpty = false,
}) =>
    showDialog<String>(
      context: context,
      builder: (_) => _TextPrompt(title: title, label: label, initial: initial, maxLines: maxLines, confirmLabel: confirmLabel, allowEmpty: allowEmpty),
    );

Future<double?> promptNumber(
  BuildContext context, {
  required String title,
  required String label,
  String? unit,
  double? initial,
  String? helper,
  String confirmLabel = 'Save',
  double min = 0,
  double max = double.infinity,
}) =>
    showDialog<double>(
      context: context,
      builder: (_) => _NumberPrompt(title: title, label: label, unit: unit, initial: initial, helper: helper, confirmLabel: confirmLabel, min: min, max: max),
    );

class _TextPrompt extends StatefulWidget {
  const _TextPrompt({required this.title, required this.label, required this.initial, required this.maxLines, required this.confirmLabel, required this.allowEmpty});
  final String title;
  final String label;
  final String initial;
  final int maxLines;
  final String confirmLabel;
  final bool allowEmpty;

  @override
  State<_TextPrompt> createState() => _TextPromptState();
}

class _TextPromptState extends State<_TextPrompt> {
  late final _c = TextEditingController(text: widget.initial);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final valid = widget.allowEmpty || _c.text.trim().isNotEmpty;
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _c,
        autofocus: true,
        maxLines: widget.maxLines,
        minLines: widget.maxLines > 1 ? 3 : 1,
        textCapitalization: TextCapitalization.sentences,
        onChanged: (_) => setState(() {}),
        decoration: InputDecoration(labelText: widget.label.isEmpty ? null : widget.label),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: valid ? () => Navigator.pop(context, _c.text.trim()) : null, child: Text(widget.confirmLabel)),
      ],
    );
  }
}

class _NumberPrompt extends StatefulWidget {
  const _NumberPrompt({
    required this.title,
    required this.label,
    required this.confirmLabel,
    required this.min,
    required this.max,
    this.unit,
    this.initial,
    this.helper,
  });
  final String title;
  final String label;
  final String? unit;
  final double? initial;
  final String? helper;
  final String confirmLabel;
  final double min;
  final double max;

  @override
  State<_NumberPrompt> createState() => _NumberPromptState();
}

class _NumberPromptState extends State<_NumberPrompt> {
  late final _c = TextEditingController(text: widget.initial == null ? '' : _fmt(widget.initial!));

  static String _fmt(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), '');

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final v = parseNumber(_c.text);
    final valid = v != null && v >= widget.min && v <= widget.max;
    return AlertDialog(
      title: Text(widget.title),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        NumberField(controller: _c, label: widget.label, unit: widget.unit, autofocus: true, onChanged: (_) => setState(() {})),
        if (widget.helper != null) ...[
          const SizedBox(height: Space.sm),
          Text(widget.helper!, style: context.text.bodySmall),
        ],
      ]),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
        FilledButton(onPressed: valid ? () => Navigator.pop(context, v) : null, child: Text(widget.confirmLabel)),
      ],
    );
  }
}

/// Destructive confirmation that requires typing [word].
Future<bool> confirmTyped(BuildContext context, {required String title, required String message, String word = 'DELETE', String action = 'Delete'}) async =>
    await showDialog<bool>(context: context, builder: (_) => _TypedConfirm(title: title, message: message, word: word, action: action)) ?? false;

class _TypedConfirm extends StatefulWidget {
  const _TypedConfirm({required this.title, required this.message, required this.word, required this.action});
  final String title;
  final String message;
  final String word;
  final String action;

  @override
  State<_TypedConfirm> createState() => _TypedConfirmState();
}

class _TypedConfirmState extends State<_TypedConfirm> {
  final _c = TextEditingController();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.message),
          const SizedBox(height: Space.md),
          TextField(controller: _c, onChanged: (_) => setState(() {}), decoration: InputDecoration(labelText: 'Type ${widget.word} to confirm')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(
            onPressed: _c.text.trim() == widget.word ? () => Navigator.pop(context, true) : null,
            style: TextButton.styleFrom(foregroundColor: context.colors.negative),
            child: Text(widget.action),
          ),
        ],
      );
}
