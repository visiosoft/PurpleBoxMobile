import { useRef, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import Svg, { G, Line, Path, Polyline, Rect, Text as SvgText, Circle } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'
import { Ionicons } from '@expo/vector-icons'
import { COLORS, FONTS } from '../../lib/theme'
import type { ChartSpec } from '../../lib/assistant'
import { openLocalFile } from '../../lib/files'
import { notify } from '../../lib/alert'

/**
 * A chart an answer drew from its own figures (make_chart on the server,
 * checked against the data before it gets here). Bar, line or pie in the
 * app's colours, drawn with react-native-svg, and saved as a PNG to share.
 */

// 2Capacity's green and blue first, then the rest.
const PALETTE = ['#34A853', '#4285F4', '#4FC3F7', '#F5B83D', '#1F1F1F', '#E8618C', '#F97316', '#14B8A6']
const H = 200
const LEFT = 40
const BOTTOM = 28
const TOP = 8

const fmt = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`
  if (a >= 10_000) return `${Math.round(v / 1000)}k`
  return Number(v).toLocaleString('en-GB', { maximumFractionDigits: 1 })
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}

function Axes({ w, max, labels, step }: { w: number; max: number; labels: string[]; step: number }) {
  const plotH = H - BOTTOM - TOP
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const every = Math.max(1, Math.ceil(labels.length / Math.max(1, Math.floor((w - LEFT) / 52))))
  return (
    <G>
      {ticks.map((t) => {
        const y = TOP + plotH * (1 - t)
        return (
          <G key={t}>
            <Line x1={LEFT} x2={w} y1={y} y2={y} stroke="#EEEAF3" strokeDasharray={t ? '3 3' : undefined} />
            <SvgText x={LEFT - 6} y={y + 3.5} fontSize={10} fill={COLORS.ink3} textAnchor="end">{fmt(max * t)}</SvgText>
          </G>
        )
      })}
      {labels.map((l, i) => (i % every === 0 ? (
        <SvgText key={i} x={LEFT + step * i + step / 2} y={H - 10} fontSize={10} fill={COLORS.ink3} textAnchor="middle">
          {l.length > 9 ? `${l.slice(0, 8)}…` : l}
        </SvgText>
      ) : null))}
    </G>
  )
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)]
  const [x0, y0] = p(a0)
  const [x1, y1] = p(a1)
  if (a1 - a0 >= Math.PI * 2 - 1e-6) return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1} Z`
}

export default function ChartView({ chart }: { chart: ChartSpec }) {
  const box = useRef<View>(null)
  const [w, setW] = useState(0)
  const series = chart.series?.length ? chart.series : [{ name: chart.title, values: [] }]
  const labels = chart.labels || []

  async function save() {
    try {
      const uri = await captureRef(box, { format: 'png', quality: 1, result: 'tmpfile' })
      await openLocalFile(uri, 'png')
    } catch (e) {
      notify('Could not save the chart', (e as Error)?.message)
    }
  }

  let drawing = null
  if (w > 0 && chart.type === 'pie') {
    const vals = labels.map((_, i) => Math.max(0, Number(series[0].values[i]) || 0))
    const total = vals.reduce((a, b) => a + b, 0) || 1
    const r = Math.min(w, H) / 2 - 8
    // Where each slice starts and ends, as running totals of the angle.
    const ends = vals.map((_, i) => (vals.slice(0, i + 1).reduce((s, x) => s + x, 0) / total) * Math.PI * 2)
    drawing = (
      <Svg width={w} height={H}>
        {vals.map((v, i) => (v > 0
          ? <Path key={i} d={arc(w / 2, H / 2, r, i ? ends[i - 1] : 0, ends[i])} fill={PALETTE[i % PALETTE.length]} stroke="#fff" strokeWidth={1.5} />
          : null))}
      </Svg>
    )
  } else if (w > 0) {
    const all = series.flatMap((s) => s.values.map((v) => Number(v) || 0))
    const max = niceMax(Math.max(0, ...all))
    const step = (w - LEFT) / Math.max(1, labels.length)
    const plotH = H - BOTTOM - TOP
    const y = (v: number) => TOP + plotH * (1 - Math.max(0, v) / max)
    if (chart.type === 'line') {
      drawing = (
        <Svg width={w} height={H}>
          <Axes w={w} max={max} labels={labels} step={step} />
          {series.map((s, k) => {
            const pts = labels.map((_, i) => `${LEFT + step * i + step / 2},${y(Number(s.values[i]) || 0)}`).join(' ')
            return (
              <G key={k}>
                <Polyline points={pts} fill="none" stroke={PALETTE[k % PALETTE.length]} strokeWidth={2.2} />
                {labels.length <= 16 && labels.map((_, i) => (
                  <Circle key={i} cx={LEFT + step * i + step / 2} cy={y(Number(s.values[i]) || 0)} r={2.6} fill={PALETTE[k % PALETTE.length]} />
                ))}
              </G>
            )
          })}
        </Svg>
      )
    } else {
      const inner = step * 0.72
      const bw = inner / series.length
      drawing = (
        <Svg width={w} height={H}>
          <Axes w={w} max={max} labels={labels} step={step} />
          {series.map((s, k) => labels.map((_, i) => {
            const v = Number(s.values[i]) || 0
            const top = y(v)
            return (
              <Rect key={`${k}-${i}`} x={LEFT + step * i + (step - inner) / 2 + bw * k} y={top} width={Math.max(1, bw - 1.5)}
                height={Math.max(0, TOP + plotH - top)} rx={3} fill={PALETTE[k % PALETTE.length]} />
            )
          }))}
        </Svg>
      )
    }
  }

  const legend = chart.type === 'pie'
    ? labels.map((l, i) => ({ name: `${l}: ${fmt(Number(series[0].values[i]) || 0)}`, color: PALETTE[i % PALETTE.length] }))
    : series.length > 1 ? series.map((s, k) => ({ name: s.name, color: PALETTE[k % PALETTE.length] })) : []

  return (
    <View style={{ marginTop: 12, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: '#fff', overflow: 'hidden' }}>
      {/* What is captured as the PNG: title, drawing and legend on white. */}
      <View ref={box} collapsable={false} style={{ backgroundColor: '#fff', padding: 10 }}>
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 13, color: COLORS.ink, marginRight: 64, marginBottom: 6 }}>{chart.title}</Text>
        <View onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))} style={{ height: H }}>{drawing}</View>
        {legend.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
            {legend.map((l, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: l.color }} />
                <Text style={{ fontFamily: FONTS.body, fontSize: 11.5, color: COLORS.ink2 }}>{l.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <Pressable onPress={save} hitSlop={10} accessibilityLabel="Save the chart as a picture"
        style={{ position: 'absolute', top: 9, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="download-outline" size={14} color={COLORS.ink3} />
        <Text style={{ fontFamily: FONTS.bodyMedium, fontSize: 12, color: COLORS.ink3 }}>PNG</Text>
      </Pressable>
    </View>
  )
}
