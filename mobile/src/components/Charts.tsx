import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import Svg, {Line, Path, Rect, Circle, Text as SvgText} from 'react-native-svg';
import {colors, fonts} from '../theme';
import {Text} from './Text';

export interface BarDatum {
  label: string;
  a: number;
  b: number;
}

interface BarChartProps {
  data: readonly BarDatum[];
  height?: number;
  aLabel: string;
  bLabel: string;
  aColor?: string;
  bColor?: string;
  accessibilitySummary: string;
}

const AXIS = 24;

export function BarChart({data, height = 150, aLabel, bLabel, aColor = colors.accent, bColor = colors.ink, accessibilitySummary}: BarChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const max = Math.max(1, ...data.flatMap(d => [d.a, d.b]));
  const plotH = height - AXIS;
  const slot = data.length > 0 ? width / data.length : 0;
  const bar = Math.min(24, slot / 3);
  return (
    <View>
      <View style={styles.legend}>
        <Legend color={aColor} label={aLabel} />
        <Legend color={bColor} label={bLabel} />
      </View>
      <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilitySummary}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            {[0, 0.5, 1].map(t => (
              <Line key={t} x1={0} x2={width} y1={plotH * (1 - t)} y2={plotH * (1 - t)} stroke={colors.borderSoft} strokeWidth={1} />
            ))}
            {data.map((d, i) => {
              const cx = slot * i + slot / 2;
              const ha = (d.a / max) * plotH;
              const hb = (d.b / max) * plotH;
              return (
                <React.Fragment key={d.label}>
                  <Rect x={cx - bar - 2} y={plotH - ha} width={bar} height={ha} rx={3} fill={aColor} />
                  <Rect x={cx + 2} y={plotH - hb} width={bar} height={hb} rx={3} fill={bColor} />
                  <SvgText x={cx} y={height - 6} fontSize={12} fontFamily={fonts.regular} fill={colors.inkSoft} textAnchor="middle">
                    {d.label}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        ) : (
          <View style={{height}} />
        )}
      </View>
    </View>
  );
}

export interface LineSeries {
  name: string;
  values: readonly number[];
  color: string;
}

interface LineChartProps {
  labels: readonly string[];
  series: readonly LineSeries[];
  height?: number;
  accessibilitySummary: string;
}

export function LineChart({labels, series, height = 130, accessibilitySummary}: LineChartProps) {
  const [width, setWidth] = useState(0);
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const plotH = height - AXIS;
  const step = labels.length > 1 ? (width - 16) / (labels.length - 1) : 0;
  const point = (i: number, v: number) => ({x: 8 + step * i, y: plotH - (v / max) * (plotH - 8) - 2});
  return (
    <View>
      <View style={styles.legend}>
        {series.map(s => (
          <Legend key={s.name} color={s.color} label={s.name} />
        ))}
      </View>
      <View
        onLayout={e => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={accessibilitySummary}>
        {width > 0 ? (
          <Svg width={width} height={height}>
            <Line x1={8} x2={width - 8} y1={plotH} y2={plotH} stroke={colors.borderSoft} strokeWidth={1} />
            {series.map(s => {
              const pts = s.values.map((v, i) => point(i, v));
              const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
              return (
                <React.Fragment key={s.name}>
                  <Path d={d} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p, i) => (
                    <Circle key={i} cx={p.x} cy={p.y} r={3} fill={s.color} />
                  ))}
                </React.Fragment>
              );
            })}
            {labels.map((label, i) => (
              <SvgText
                key={`${label}-${i}`}
                x={8 + step * i}
                y={height - 6}
                fontSize={12}
                fontFamily={fonts.regular}
                fill={colors.inkSoft}
                textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>
                {label}
              </SvgText>
            ))}
          </Svg>
        ) : (
          <View style={{height}} />
        )}
      </View>
    </View>
  );
}

function Legend({color, label}: {color: string; label: string}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, {backgroundColor: color}]} />
      <Text variant="caption" color={colors.inkSoft}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginBottom: 6},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 6},
  dot: {width: 8, height: 8, borderRadius: 4},
});
