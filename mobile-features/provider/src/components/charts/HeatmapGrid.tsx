/**
 * HeatmapGrid — 7 days × 24 hours heatmap for peak-hours visualization.
 * RTL-safe.
 */
import React, { type ReactElement } from 'react';
import { I18nManager, ScrollView, StyleSheet, Text, View } from 'react-native';
import { t } from '../../strings';

export interface HeatmapCell {
  day: number;   // 0=Sun … 6=Sat
  hour: number;  // 0–23
  value: number; // 0..max
}

export interface HeatmapGridProps {
  data: HeatmapCell[];
  dayLabels?: string[];
  hourStep?: number;
  maxValue?: number;
  colorFrom?: string;
  colorTo?: string;
  loading?: boolean;
  title?: string;
  cellSize?: number;
}

// eslint-disable-next-line no-restricted-syntax
const DEFAULT_DAYS_AR = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function interpolateColor(fromHex: string, toHex: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(fromHex);
  const [r2, g2, b2] = hexToRgb(toHex);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

export function HeatmapGrid({
  data,
  dayLabels = DEFAULT_DAYS_AR,
  hourStep = 3,
  maxValue,
  colorFrom = '#EBF5FB',
  colorTo = '#1565C0',
  loading = false,
  title,
  cellSize = 14,
}: HeatmapGridProps): ReactElement {
  const isRTL = I18nManager.isRTL;

  const computedMax =
    maxValue ??
    data.reduce((m, c) => Math.max(m, c.value), 1);

  // Build a 7×24 grid
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const cell of data) {
    if (cell.day >= 0 && cell.day < 7 && cell.hour >= 0 && cell.hour < 24) {
      grid[cell.day]![cell.hour] = cell.value;
    }
  }

  const days = isRTL ? [...dayLabels].reverse() : dayLabels;
  const dayIndices = isRTL ? [6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6];

  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {/* Hour labels */}
          <View style={[styles.row, { marginStart: 40 }]}>
            {Array.from({ length: 24 }, (_, h) => (
              <View
                key={h}
                style={[styles.cell, { width: cellSize, height: 14, backgroundColor: 'transparent' }]}
              >
                {h % hourStep === 0 ? (
                  <Text style={styles.hourLabel}>{h}</Text>
                ) : null}
              </View>
            ))}
          </View>

          {/* Day rows */}
          {loading
            ? Array.from({ length: 7 }, (_, di) => (
                <View key={di} style={styles.row}>
                  <View style={styles.dayLabel}>
                    <View style={[styles.skeletonText, { width: 30 }]} />
                  </View>
                  {Array.from({ length: 24 }, (_, h) => (
                    <View
                      key={h}
                      style={[
                        styles.cell,
                        {
                          width: cellSize,
                          height: cellSize,
                          backgroundColor: '#E8E8E8',
                        },
                      ]}
                    />
                  ))}
                </View>
              ))
            : dayIndices.map((di, rowIdx) => (
                <View key={di} style={styles.row}>
                  <View style={styles.dayLabel}>
                    <Text style={styles.dayLabelText}>{days[rowIdx]}</Text>
                  </View>
                  {Array.from({ length: 24 }, (_, h) => {
                    const val = grid[di]![h] ?? 0;
                    const t = computedMax > 0 ? val / computedMax : 0;
                    const bg = interpolateColor(colorFrom, colorTo, t);
                    return (
                      <View
                        key={h}
                        style={[
                          styles.cell,
                          {
                            width: cellSize,
                            height: cellSize,
                            backgroundColor: bg,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              ))}

          {/* Color scale legend */}
          <View style={[styles.scaleRow, { marginStart: 40 }]}>
            <Text style={styles.scaleLabel}>{t('analytics.heatmapScaleMin')}</Text>
            {Array.from({ length: 10 }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.scaleCell,
                  { backgroundColor: interpolateColor(colorFrom, colorTo, i / 9) },
                ]}
              />
            ))}
            <Text style={styles.scaleLabel}>{t('analytics.heatmapScaleMax')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  dayLabel: {
    width: 38,
    alignItems: 'flex-end',
    paddingEnd: 4,
  },
  dayLabelText: {
    fontSize: 10,
    color: '#666',
  },
  cell: {
    margin: 1,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hourLabel: {
    fontSize: 8,
    color: '#999',
    textAlign: 'center',
  },
  scaleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  scaleCell: {
    width: 12,
    height: 8,
    borderRadius: 1,
  },
  scaleLabel: {
    fontSize: 9,
    color: '#AAA',
    marginHorizontal: 2,
  },
  skeletonText: {
    height: 10,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
});
