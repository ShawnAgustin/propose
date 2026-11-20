// Draws pose markers (short line, long line, circle, eye) inside a frame, using the
// accessibility settings: palette, line thickness, label size, dashes + badges, black outline.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { BADGE, DASH, PAL, type DashStyle, type Fine, type PlacedMarker, type Template } from './model';
import { I } from './ui';

export const SHORT_LEN = 40;
export const CIRCLE = 28;
export const EYE = 26;
const GLOW = '#FF8A65';

export function MarkerLayer({ markers, w, h, fine, tpl, selected, big }: {
  markers: PlacedMarker[]; w: number; h: number; fine: Fine; tpl: (id: string) => Template; selected?: number | null; big?: number | null;
}) {
  if (!w || !h) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {markers.map((m, i) => (
        <Marker key={i} m={m} T={tpl(m.t)} name={markerLabel(markers, i, tpl)} w={w} h={h} fine={fine} sel={selected === i} big={big === i} />
      ))}
    </View>
  );
}

// Copy number of a marker: its own k, or (for markers saved before copies were numbered) its order
export function copyNo(markers: PlacedMarker[], i: number) {
  const m = markers[i];
  if (m.k != null) return m.k;
  return markers.slice(0, i + 1).filter((x) => x.t === m.t).length;
}

// What a marker is called: your own name, else the marker's name, numbered when there are copies
// ("Waist 2"), so every copy can be told apart on the photo and in the camera
export function markerLabel(markers: PlacedMarker[], i: number, tpl: (id: string) => Template) {
  const m = markers[i];
  if (m.name?.trim()) return m.name.trim();
  const base = tpl(m.t).name;
  return markers.filter((x) => x.t === m.t).length > 1 ? `${base} ${copyNo(markers, i)}` : base;
}

function Marker({ m, T, name, w, h, fine, sel, big }: { m: PlacedMarker; T: Template; name: string; w: number; h: number; fine: Fine; sel: boolean; big: boolean }) {
  const c = PAL[fine.palette][T.color] ?? '#fff';
  const ds: DashStyle = fine.dash ? DASH[T.color] : 'solid';
  const lw = fine.w;
  const glow = sel ? styles.glow : null;
  const label = fine.always || sel || big ? (
    <Text style={[styles.label, { fontSize: big ? 28 : fine.lbl }, sel && styles.labelSel, big && styles.labelBig]} numberOfLines={1}>
      {fine.dash ? `${BADGE[T.color]} ` : ''}
      {name}
    </Text>
  ) : null;

  if (T.kind === 'long') {
    const y = m.y * h;
    // Full width by default; once resized, centred on the marker's x
    const len = lineLen(m, T, w);
    const left = m.l != null ? m.x * w - len / 2 : 0;
    return (
      <View style={[styles.abs, { left, top: y - lw / 2, width: len }]}>
        {fine.outline && <View style={[styles.abs, { left: 0, top: -1.5, width: len, height: lw + 3, backgroundColor: '#000', borderRadius: (lw + 3) / 2 }]} />}
        <View style={glow}>
          <DashLine length={len} thickness={lw} color={c} dash={ds} />
        </View>
        {label && <View style={[styles.abs, { left: 10, bottom: lw + 5 }]}>{label}</View>}
      </View>
    );
  }

  const cx = m.x * w;
  const cy = m.y * h;
  let shape: React.ReactNode;
  let below = 0;
  if (T.kind === 'short') {
    const dot = 6 + Math.max(0, lw - 2.5);
    const len = lineLen(m, T, w);
    shape = (
      <View style={[styles.abs, glow, { left: -len / 2, top: -lw / 2, width: len, height: lw, transform: [{ rotate: `${m.a || 0}deg` }] }]}>
        {fine.outline && <View style={[styles.abs, { left: -2, top: -1.5, width: len + 4, height: lw + 3, backgroundColor: '#000', borderRadius: 4 }]} />}
        <DashLine length={len} thickness={lw} color={c} dash={ds} />
        <View style={[styles.abs, { left: -4, top: lw / 2 - dot / 2, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c }]} />
        <View style={[styles.abs, { right: -4, top: lw / 2 - dot / 2, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: c }]} />
      </View>
    );
    below = 14;
  } else if (T.kind === 'circle') {
    shape = (
      <>
        {fine.outline && <View style={[styles.abs, { left: -CIRCLE / 2 - 1.5, top: -CIRCLE / 2 - 1.5, width: CIRCLE + 3, height: CIRCLE + 3, borderRadius: CIRCLE, borderWidth: lw + 3, borderColor: '#000' }]} />}
        <View style={[styles.abs, glow, { left: -CIRCLE / 2, top: -CIRCLE / 2, width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, borderWidth: lw, borderColor: c, borderStyle: ds }]} />
      </>
    );
    below = CIRCLE / 2 + 7;
  } else {
    shape = (
      <View style={[styles.abs, glow, { left: -EYE / 2, top: -EYE / 2 }]}>
        <SymbolView name={I.eye} size={EYE} tintColor={c} weight={lw >= 4 ? 'bold' : 'medium'} style={{ width: EYE, height: EYE }} />
      </View>
    );
    below = EYE / 2 + 7;
  }
  return (
    <View style={[styles.abs, { left: cx, top: cy, width: 0, height: 0 }]}>
      {shape}
      {label && <View style={[styles.labelWrap, { top: below }]}>{label}</View>}
    </View>
  );
}

// Drawn length of a line marker in frame pixels (see PlacedMarker.l)
export function lineLen(m: PlacedMarker, T: Template, w: number) {
  if (m.l != null) return m.l * w;
  return T.kind === 'long' ? w : SHORT_LEN;
}

// A straight line made of Views, so dashed/dotted patterns work on every side and platform.
export function DashLine({ length, thickness, color, dash }: { length: number; thickness: number; color: string; dash: DashStyle }) {
  if (dash === 'solid') return <View style={{ width: length, height: thickness, borderRadius: thickness / 2, backgroundColor: color }} />;
  const seg = dash === 'dashed' ? 8 : thickness;
  const gap = dash === 'dashed' ? 5 : Math.max(3, thickness * 1.6);
  const n = Math.max(1, Math.floor((length + gap) / (seg + gap)));
  return (
    <View style={{ width: length, height: thickness, flexDirection: 'row', gap }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ width: seg, height: thickness, borderRadius: dash === 'dotted' ? thickness / 2 : 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

// 3×3 rule-of-thirds grid
export function Grid3() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[1 / 3, 2 / 3].map((p) => (
        <React.Fragment key={p}>
          <View style={[styles.gridV, { left: `${p * 100}%` }]} />
          <View style={[styles.gridH, { top: `${p * 100}%` }]} />
        </React.Fragment>
      ))}
    </View>
  );
}

// Which marker is under (x, y) in frame pixels: point markers by distance, long lines by row.
export function hitMarker(markers: PlacedMarker[], tpl: (id: string) => Template, x: number, y: number, w: number, h: number) {
  let best: { i: number; d: number } | null = null;
  markers.forEach((m, i) => {
    const T = tpl(m.t);
    const long = T.kind === 'long';
    // A shortened long line only counts along its own span
    if (long && m.l != null && Math.abs(x - m.x * w) > lineLen(m, T, w) / 2 + 20) return;
    const d = long ? Math.abs(y - m.y * h) * 1.4 : Math.hypot(x - m.x * w, y - m.y * h);
    if (d <= 30 && (!best || d < best.d)) best = { i, d };
  });
  return (best as { i: number; d: number } | null)?.i ?? null;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  glow: { shadowColor: GLOW, shadowOpacity: 1, shadowRadius: 4, shadowOffset: { width: 0, height: 0 } },
  labelWrap: { position: 'absolute', left: -120, width: 240, alignItems: 'center' },
  label: { color: '#fff', fontWeight: '500', backgroundColor: 'rgba(20,17,15,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  labelSel: { backgroundColor: '#F3E3C3', color: '#14110F' },
  labelBig: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.45)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(255,255,255,0.45)' },
});
