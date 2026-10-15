/**
 * PieChart (donut variant) — animated, with legend.
 * RTL-safe.
 */
import React, { type ReactElement, useEffect, useRef, useState } from 'react';
import {
  Animated,
  I18nManager,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

export interface PieChartProps {
  data: PieSlice[];
  size?: number;
  innerRadius?: number;
  animationDuration?: number;
  showLegend?: boolean;
  title?: string;
  loading?: boolean;
  centerLabel?: string;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number, innerR: number): string {
  const sweep = endAngle - startAngle;
  const large = sweep > 180 ? 1 : 0;
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const iStart = polarToCartesian(cx, cy, innerR, endAngle);
  const iEnd = polarToCartesian(cx, cy, innerR, startAngle);
  return [
    `M ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`,
    `L ${iEnd.x} ${iEnd.y}`,
    `A ${innerR} ${innerR} 0 ${large} 1 ${iStart.x} ${iStart.y}`,
    'Z',
  ].join(' ');
}

export function PieChart({
  data,
  size = 180,
  innerRadius,
  animationDuration = 800,
  showLegend = true,
  title,
  loading = false,
  centerLabel,
}: PieChartProps): ReactElement {
  const isRTL = I18nManager.isRTL;
  const animValue = useRef(new Animated.Value(0)).current;
  const [progress, setProgress] = useState(0);

  const inner = innerRadius ?? size * 0.32;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.44;

  useEffect(() => {
    animValue.setValue(0);
    if (loading) { setProgress(0); return; }
    const anim = Animated.timing(animValue, {
      toValue: 1,
      duration: animationDuration,
      useNativeDriver: false,
    });
    const id = animValue.addListener(({ value }) => setProgress(value));
    anim.start();
    return () => { anim.stop(); animValue.removeListener(id); };
  }, [data, loading, animationDuration, animValue]);

  if (loading) {
    return (
      <View>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E8E8" strokeWidth={r - inner} />
        </Svg>
      </View>
    );
  }

  if (!data.length) {
    return (
      <View style={[styles.empty, { width: size, height: size }]}>
        <Text style={styles.emptyText}>—</Text>
      </View>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let current = 0;
  const slices = data.map((slice) => {
    const pct = slice.value / total;
    const start = current * 360;
    const end = (current + pct * progress) * 360;
    current += pct;
    return { ...slice, pct, start, end };
  });

  const totalLabel = centerLabel ?? String(total);

  return (
    <View style={[styles.container, isRTL && styles.containerRTL]}>
      <View>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Svg width={size} height={size}>
          <G>
            {slices.map((s, i) =>
              s.end - s.start > 0.5 ? (
                <Path
                  key={i}
                  d={arcPath(cx, cy, r, s.start, s.end, inner)}
                  fill={s.color}
                />
              ) : null,
            )}
            <Circle cx={cx} cy={cy} r={inner - 2} fill="#FFF" />
            <SvgText
              x={cx}
              y={cy + 5}
              fontSize={16}
              fontWeight="700"
              fill="#333"
              textAnchor="middle"
            >
              {totalLabel}
            </SvgText>
          </G>
        </Svg>
      </View>
      {showLegend && (
        <View style={styles.legend}>
          {data.map((s) => {
            const pct = Math.round((s.value / total) * 100);
            return (
              <View key={s.label} style={styles.legendRow}>
                <View style={[styles.dot, { backgroundColor: s.color }]} />
                <Text style={styles.legendLabel}>{s.label}</Text>
                <Text style={styles.legendPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  containerRTL: {
    flexDirection: 'row-reverse',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: '#CCC', fontSize: 18 },
  legend: {
    flex: 1,
    gap: 6,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: 12,
    color: '#555',
  },
  legendPct: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
});
