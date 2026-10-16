/**
 * LineChart — animated bezier line chart using react-native-svg.
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
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

export interface LineChartDataPoint {
  label: string;
  value: number;
}

export interface LineChartProps {
  data: LineChartDataPoint[];
  width?: number;
  height?: number;
  color?: string;
  gradientFrom?: string;
  gradientTo?: string;
  showDots?: boolean;
  showGrid?: boolean;
  showLabels?: boolean;
  labelStep?: number;
  animationDuration?: number;
  title?: string;
  unit?: string;
  loading?: boolean;
}

const DEFAULT_COLOR = '#1976D2';
const PADDING = { top: 16, end: 16, bottom: 36, start: 40 };

function skeletonPath(w: number, h: number): string {
  const innerW = w - PADDING.start - PADDING.end;
  const innerH = h - PADDING.top - PADDING.bottom;
  const mid = PADDING.top + innerH / 2;
  return `M ${PADDING.start} ${mid} Q ${PADDING.start + innerW * 0.25} ${mid - 20} ${PADDING.start + innerW * 0.5} ${mid} T ${PADDING.start + innerW} ${mid}`;
}

function buildBezierPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`;
  }
  return d;
}

function buildAreaPath(points: { x: number; y: number }[], bottom: number): string {
  if (points.length < 2) return '';
  const line = buildBezierPath(points);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${line} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
}

export function LineChart({
  data,
  width = 320,
  height = 180,
  color = DEFAULT_COLOR,
  gradientFrom,
  gradientTo,
  showDots = true,
  showGrid = true,
  showLabels = true,
  labelStep = 5,
  animationDuration = 800,
  title,
  unit = '',
  loading = false,
}: LineChartProps): ReactElement {
  const isRTL = I18nManager.isRTL;
  const animValue = useRef(new Animated.Value(0)).current;
  const [animProgress, setAnimProgress] = useState(0);

  useEffect(() => {
    if (loading) {
      animValue.setValue(0);
      setAnimProgress(0);
      return;
    }
    animValue.setValue(0);
    const anim = Animated.timing(animValue, {
      toValue: 1,
      duration: animationDuration,
      useNativeDriver: false,
    });
    const listener = animValue.addListener(({ value }) => setAnimProgress(value));
    anim.start();
    return () => {
      anim.stop();
      animValue.removeListener(listener);
    };
  }, [data, loading, animationDuration, animValue]);

  const innerW = width - PADDING.start - PADDING.end;
  const innerH = height - PADDING.top - PADDING.bottom;
  const bottom = PADDING.top + innerH;
  const gradientId = 'lineGrad';
  const fromColor = gradientFrom ?? color;
  const toColor = gradientTo ?? `${color}22`;

  if (loading) {
    return (
      <View style={{ width, height }}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
        <Svg width={width} height={height}>
          <Path d={skeletonPath(width, height)} stroke="#E0E0E0" strokeWidth={2} fill="none" />
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
  const minVal = Math.min(...data.map((d) => d.value), 0);
  const range = maxVal - minVal || 1;

  const toX = (i: number): number => {
    const ratio = i / (data.length - 1);
    return isRTL
      ? PADDING.start + innerW * (1 - ratio)
      : PADDING.start + innerW * ratio;
  };
  const toY = (v: number): number =>
    PADDING.top + innerH * (1 - (v - minVal) / range);

  const allPoints = data.map((d, i) => ({ x: toX(i), y: toY(d.value) }));
  const visibleCount = Math.max(2, Math.floor(allPoints.length * animProgress));
  const points = allPoints.slice(0, visibleCount);

  const linePath = buildBezierPath(points);
  const areaPath = buildAreaPath(points, bottom);

  // Grid lines
  const gridCount = 4;
  const gridLines: ReactElement[] = [];
  for (let i = 0; i <= gridCount; i++) {
    const y = PADDING.top + (innerH / gridCount) * i;
    const val = maxVal - (range / gridCount) * i;
    gridLines.push(
      <Line
        key={`grid-${i}`}
        x1={PADDING.start}
        y1={y}
        x2={PADDING.start + innerW}
        y2={y}
        stroke="#F0F0F0"
        strokeWidth={1}
      />,
      <SvgText
        key={`label-y-${i}`}
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

  return (
    <View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={fromColor} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={toColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {showGrid && gridLines}
        {areaPath ? (
          <Path d={areaPath} fill={`url(#${gradientId})`} />
        ) : null}
        {linePath ? (
          <Path d={linePath} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {showDots &&
          points.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
          ))}
        {showLabels &&
          data.map((d, i) =>
            i % labelStep === 0 ? (
              <SvgText
                key={`lbl-${i}`}
                x={toX(i)}
                y={bottom + 14}
                fontSize={9}
                fill="#888"
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            ) : null,
          )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    textAlign: 'auto',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#CCC',
    fontSize: 18,
  },
});
