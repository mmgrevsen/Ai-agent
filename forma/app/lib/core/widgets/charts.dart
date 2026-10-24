import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../domain/dates.dart';
import '../theme/tokens.dart';
import '../util/format.dart';

class ChartPoint {
  const ChartPoint(this.date, this.value);
  final DateTime date;
  final double value;
}

class ChartSeries {
  const ChartSeries({required this.points, required this.color, this.dotsOnly = false, this.label, this.dashed = false});
  final List<ChartPoint> points;
  final Color color;

  /// Raw measurements drawn as dots (e.g. scale weight under the trend).
  final bool dotsOnly;
  final bool dashed;
  final String? label;
}

/// Interactive time-series chart. X is days since the first point, so gaps
/// in data are shown honestly rather than compressed.
class TimeSeriesChart extends StatelessWidget {
  const TimeSeriesChart({
    super.key,
    required this.series,
    this.height = 220,
    this.format,
    this.target,
    this.minY,
  });

  final List<ChartSeries> series;
  final double height;
  final String Function(double)? format;

  /// Optional horizontal reference line (goal / target).
  final double? target;
  final double? minY;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final all = [for (final s in series) ...s.points];
    if (all.isEmpty) return SizedBox(height: height);
    final origin = all.map((p) => dateOnly(p.date)).reduce((a, b) => a.isBefore(b) ? a : b);
    double x(DateTime d) => daysBetween(origin, dateOnly(d)).toDouble() + (d.hour / 24);
    final values = [...all.map((p) => p.value), ?target];
    var lo = values.reduce(math.min);
    var hi = values.reduce(math.max);
    final pad = math.max((hi - lo) * 0.12, hi.abs() * 0.01 + 0.5);
    lo = minY ?? lo - pad;
    hi = hi + pad;
    final maxX = math.max(1.0, all.map((p) => x(p.date)).reduce(math.max));
    final fmt = format ?? number;
    final labelStyle = context.text.labelSmall?.copyWith(letterSpacing: 0, color: c.textTertiary);

    return SizedBox(
      height: height,
      child: LineChart(
        LineChartData(
          minX: 0,
          maxX: maxX,
          minY: lo,
          maxY: hi,
          gridData: FlGridData(
            drawVerticalLine: false,
            horizontalInterval: (hi - lo) / 4,
            getDrawingHorizontalLine: (_) => FlLine(color: c.chartGrid, strokeWidth: 1),
          ),
          borderData: FlBorderData(show: false),
          extraLinesData: target == null
              ? const ExtraLinesData()
              : ExtraLinesData(horizontalLines: [
                  HorizontalLine(y: target!, color: c.textTertiary, strokeWidth: 1, dashArray: [4, 4]),
                ]),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(),
            rightTitles: const AxisTitles(),
            leftTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 44,
                interval: (hi - lo) / 4,
                getTitlesWidget: (v, meta) => v == meta.max || v == meta.min
                    ? const SizedBox.shrink()
                    : SideTitleWidget(meta: meta, child: Text(fmt(v), style: labelStyle)),
              ),
            ),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 26,
                interval: math.max(1, (maxX / 4).roundToDouble()),
                getTitlesWidget: (v, meta) => SideTitleWidget(
                  meta: meta,
                  child: Text(DateFormat('d MMM').format(addDays(origin, v.round())), style: labelStyle),
                ),
              ),
            ),
          ),
          lineTouchData: LineTouchData(
            touchTooltipData: LineTouchTooltipData(
              getTooltipColor: (_) => c.surfaceRaised,
              tooltipBorder: BorderSide(color: c.outline),
              getTooltipItems: (spots) => [
                for (final s in spots)
                  LineTooltipItem(
                    '${s.barIndex == 0 ? '${DateFormat('d MMM').format(addDays(origin, s.x.floor()))}\n' : ''}${series[s.barIndex].label ?? ''} ${fmt(s.y)}'.trim(),
                    context.text.labelMedium!.copyWith(color: series[s.barIndex].color),
                  ),
              ],
            ),
          ),
          lineBarsData: [
            for (final s in series)
              LineChartBarData(
                spots: [for (final p in s.points) FlSpot(x(p.date), p.value)],
                color: s.color,
                barWidth: s.dotsOnly ? 0 : 2.4,
                isCurved: !s.dotsOnly && s.points.length > 2,
                curveSmoothness: 0.2,
                preventCurveOverShooting: true,
                dashArray: s.dashed ? [5, 4] : null,
                dotData: FlDotData(
                  show: s.dotsOnly || s.points.length < 12,
                  getDotPainter: (spot, _, _, _) => FlDotCirclePainter(
                    radius: s.dotsOnly ? 2.6 : 3,
                    color: s.dotsOnly ? s.color.withValues(alpha: 0.55) : s.color,
                    strokeWidth: 0,
                  ),
                ),
                belowBarData: BarAreaData(
                  show: !s.dotsOnly && series.indexOf(s) == series.length - 1 && series.length == 1,
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [s.color.withValues(alpha: 0.16), s.color.withValues(alpha: 0)],
                  ),
                ),
              ),
          ],
        ),
        duration: Motion.medium,
      ),
    );
  }
}

class BarDatum {
  const BarDatum(this.label, this.value, {this.highlight = false});
  final String label;
  final double value;
  final bool highlight;
}

class SimpleBarChart extends StatelessWidget {
  const SimpleBarChart({super.key, required this.data, this.height = 180, this.format, this.target, this.color});

  final List<BarDatum> data;
  final double height;
  final String Function(double)? format;
  final double? target;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = context.colors;
    final maxV = math.max(data.isEmpty ? 1.0 : data.map((d) => d.value).reduce(math.max), target ?? 0) * 1.15;
    final fmt = format ?? number;
    final labelStyle = context.text.labelSmall?.copyWith(letterSpacing: 0, color: c.textTertiary);
    final barColor = color ?? c.accent;
    return SizedBox(
      height: height,
      child: BarChart(
        BarChartData(
          maxY: maxV <= 0 ? 1 : maxV,
          gridData: const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          extraLinesData: target == null
              ? const ExtraLinesData()
              : ExtraLinesData(horizontalLines: [HorizontalLine(y: target!, color: c.textTertiary, strokeWidth: 1, dashArray: [4, 4])]),
          titlesData: FlTitlesData(
            topTitles: const AxisTitles(),
            rightTitles: const AxisTitles(),
            leftTitles: const AxisTitles(),
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                reservedSize: 24,
                getTitlesWidget: (v, meta) => SideTitleWidget(meta: meta, child: Text(data[v.toInt()].label, style: labelStyle)),
              ),
            ),
          ),
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipColor: (_) => c.surfaceRaised,
              tooltipBorder: BorderSide(color: c.outline),
              getTooltipItem: (group, _, rod, _) => BarTooltipItem(fmt(rod.toY), context.text.labelMedium!.copyWith(color: c.textPrimary)),
            ),
          ),
          barGroups: [
            for (final (i, d) in data.indexed)
              BarChartGroupData(x: i, barRods: [
                BarChartRodData(
                  toY: d.value,
                  width: math.min(22, 220 / math.max(1, data.length)),
                  color: d.highlight ? barColor : barColor.withValues(alpha: 0.45),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(4)),
                ),
              ]),
          ],
        ),
        duration: Motion.medium,
      ),
    );
  }
}

/// Range selector values used by progress views.
enum ChartRange {
  month('1M', 30),
  quarter('3M', 91),
  half('6M', 182),
  year('1Y', 365),
  all('All', 100000);

  const ChartRange(this.label, this.days);
  final String label;
  final int days;
}
