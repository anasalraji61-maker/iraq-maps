/**
 * BarChart — animated bar chart using react-native-svg.
 * RTL-safe: start/end instead of left/right.
 */
import { type ReactElement, useEffect, useRef, useState } from 'react';
import {
  Animated,
  I18nManager,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Line,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

export interface BarChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface BarChartProps {
  data: BarChartDataPoint[];
  width?: number;
  height?: number;
  defaultColor?: string;
  showValues?: boolean;
  showGrid?: boolean;
  animationDuration?: number;
  title?: string;
  unit?: string;
  loading?: boolean;
  barRadius?: number;
  horizontal?: boolean;
}

const DEFAULT_COLOR = '#1976D2';
const PADDING = { top: 20, end: 12, bottom: 36, start: 36 };

export function BarChart({
  data,
  width = 320,
  height = 180,
  defaultColor = DEFAULT_COLOR,
  showValues = true,
  showGrid = true,
  animationDuration = 700,
  title,
  unit = '',
  loading = false,
  barRadius = 4,
}: BarChartProps): ReactElement {
  const isRTL = I18nManager.isRTL;
  const animValue = useRef(new Animated.Value(0)).current;
  const [animProgress, setAnimProgress] = useState(0);

  useEffect(() => {
    animValue.setValue(0);
    if (loading) { setAnimProgress(0); return; }
    const anim = Animated.timing(animValue, {
      toValue: 1,
      duration: animationDuration,
      useNativeDriver: false,
    });
    const id = animValue.addListener(({ value }) => setAnimProgress(value));
    anim.start();
    return () => { anim.stop(); animValue.removeListener(id); };
  }, [data, loading, animationDuration, animValue]);

  const innerW = width - PADDING.start - PADDING.end;
  const innerH = height - PADDING.top - PADDING.bottom;

  if (loading) {
    const barW = data.length > 0 ? innerW / data.length - 4 : 20;
    return (
      <View>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Svg width={width} height={height}>
          {Array.from({ length: Math.min(data.length || 7, 12) }).map((_, i) => {
            const x = PADDING.start + i * (innerW / (data.length || 7));
            const h = innerH * (0.3 + (i % 3) * 0.2);
            return (
              <Rect
                key={i}
                x={x + 2}
                y={PADDING.top + innerH - h}
                width={Math.max(barW, 8)}
                height={h}
                rx={barRadius}
                fill="#E8E8E8"
              />
            );
          })}
        </Svg>
      </View>
    );
  }

  if (!data.length) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>—</Text>
      </View>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  const gridCount = 4;
  const barTotalW = innerW / data.length;
  const barW = Math.max(barTotalW * 0.65, 4);
  const barGap = (barTotalW - barW) / 2;

  const barX = (i: number): number => {
    if (isRTL) {
      return PADDING.start + innerW - (i + 1) * barTotalW + barGap;
    }
    return PADDING.start + i * barTotalW + barGap;
  };

  const gridLines: ReactElement[] = [];
  if (showGrid) {
    for (let i = 0; i <= gridCount; i++) {
      const y = PADDING.top + (innerH / gridCount) * i;
      const val = maxVal * (1 - i / gridCount);
      gridLines.push(
        <Line
          key={`g${i}`}
          x1={PADDING.start}
          y1={y}
          x2={PADDING.start + innerW}
          y2={y}
          stroke="#F0F0F0"
          strokeWidth={1}
        />,
        <SvgText
          key={`gy${i}`}
          x={isRTL ? PADDING.start + innerW + 4 : PADDING.start - 4}
          y={y + 4}
          fontSize={9}
          fill="#AAA"
          textAnchor={isRTL ? 'start' : 'end'}
        >
          {Math.round(val)}{unit}
        </SvgText>,
      );
    }
  }

  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Svg width={width} height={height}>
        {gridLines}
        {data.map((d, i) => {
          const rawH = (d.value / maxVal) * innerH;
          const barH = rawH * animProgress;
          const x = barX(i);
          const y = PADDING.top + innerH - barH;
          const color = d.color ?? defaultColor;
          return (
            <React.Fragment key={i}>
              <Rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(barH, 0)}
                rx={barRadius}
                fill={color}
                opacity={0.9}
              />
              {showValues && barH > 14 && (
                <SvgText
                  x={x + barW / 2}
                  y={y - 4}
                  fontSize={9}
                  fill={color}
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {d.value}{unit}
                </SvgText>
              )}
              <SvgText
                x={x + barW / 2}
                y={PADDING.top + innerH + 14}
                fontSize={9}
                fill="#888"
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// React import needed for Fragment
import React from 'react';

const styles = StyleSheet.create({
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
});
