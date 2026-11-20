// Edit guide: name the pose, place markers on the reference photo (tap a chip to add one, again for
// another; drag to move, tap to select, rotate short lines in 5° steps, make lines longer or
// shorter), and tag it for the gallery filters.
import React, { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arNum, cap, clamp01, DEF_POS, MAX_MARKERS, PAL, TAG_GROUPS, type PlacedMarker } from '../model';
import { poseUri, useStore } from '../store';
import { FAV, SERIF, useTheme } from '../theme';
import { Chip, GhostBtn, I, Icon, PrimaryBtn, RoundBtn, Segmented, shadow, useToast } from '../ui';
import { Grid3, MarkerLayer, copyNo, hitMarker, lineLen, markerLabel } from '../markers';

const LEN_STEP = 1.25; // each − / + tap scales a line by this much
const LEN_MIN = 0.05; // share of the frame width
const LEN_MAX = 1;

export default function EditGuide() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { data, updatePose, deletePoses, setSettings, tpl } = useStore();
  const pose = data.poses.find((p) => p.id === id);
  const [mode, setMode] = useState<'markers' | 'tags'>('markers');
  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState<PlacedMarker[] | null>(null); // markers while a drag is in progress
  const drag = useRef<{ i: number; ox: number; oy: number; px: number; py: number; moved: boolean } | null>(null);

  if (!pose) {
    return (
      <View style={[styles.screen, { backgroundColor: t.canvas, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: t.text2 }}>This pose was deleted.</Text>
        <Pressable onPress={() => router.back()}><Text style={{ color: t.text, marginTop: 12, fontWeight: '600' }}>Back</Text></Pressable>
      </View>
    );
  }

  const fine = data.settings.fine;
  const ar = arNum(pose.ratio);
  const maxH = 360;
  const fw = Math.min(width - 40, maxH * ar);
  const fh = fw / ar;
  const markers = draft ?? pose.markers;
  const setMarkers = (fn: (m: PlacedMarker[]) => PlacedMarker[]) => updatePose(pose.id, (p) => ({ ...p, markers: fn(p.markers) }));
  const selM = sel != null ? markers[sel] : undefined;

  // Every tap adds another copy; each extra copy starts a little lower so it doesn't hide the last one
  const addMarker = (tid: string) => {
    if (pose.markers.length >= MAX_MARKERS) return Alert.alert("Can't add more", `A pose can have up to ${MAX_MARKERS} markers. Remove one first.`);
    const same = pose.markers.map((m, i) => (m.t === tid ? copyNo(pose.markers, i) : 0));
    const n = same.filter(Boolean).length;
    const k = Math.max(0, ...same) + 1; // next copy number for this kind
    const [x, y0] = DEF_POS[tid] ?? [0.5, 0.5];
    const y = clamp01(y0 + 0.06 * n > 0.95 ? y0 - 0.06 * n : y0 + 0.06 * n);
    setMarkers((m) => [...m, { t: tid, x, y, a: tpl(tid).angle ?? 0, k }]);
    setSel(pose.markers.length);
    Haptics.selectionAsync().catch(() => {});
  };
  const isLine = (m?: PlacedMarker) => !!m && ['short', 'long'].includes(tpl(m.t).kind);
  const lenShare = (m: PlacedMarker) => lineLen(m, tpl(m.t), fw) / fw;
  const resize = (f: number) =>
    sel != null &&
    setMarkers((ms) => ms.map((m, i) => (i === sel ? { ...m, l: Math.min(LEN_MAX, Math.max(LEN_MIN, lenShare(m) * f)) } : m)));
  const resetLen = () => sel != null && setMarkers((ms) => ms.map((m, i) => (i === sel ? { t: m.t, x: m.x, y: m.y, a: m.a } : m)));
  const rotate = (d: number) => sel != null && setMarkers((ms) => ms.map((m, i) => (i === sel ? { ...m, a: (((m.a || 0) + d) % 360 + 360) % 360 } : m)));
  // Deleting keeps the panel open: if the selected copy goes, the next copy of the same kind (or the
  // one before it) is selected instead; it only closes when no copies of that kind are left
  const removeAt = (idx: number) => {
    const kind = markers[idx].t;
    const sameAfter = markers.findIndex((m, i) => i > idx && m.t === kind);
    const sameBefore = markers.map((m, i) => (i < idx && m.t === kind ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    setMarkers((ms) => ms.filter((_, i) => i !== idx));
    setSel((s) => {
      if (s == null) return null;
      if (s !== idx) return s > idx ? s - 1 : s;
      if (sameAfter >= 0) return sameAfter - 1; // shifts down one after the delete
      return sameBefore >= 0 ? sameBefore : null;
    });
  };
  const removeSel = () => sel != null && removeAt(sel);
  const rename = (idx: number, v: string) =>
    setMarkers((ms) => ms.map((m, i) => (i === idx ? { ...m, name: v.slice(0, 30) || undefined } : m)));
  // The label a copy would have without your own name ("Waist 2"), shown as the rename placeholder
  const defaultLabel = (idx: number) => markerLabel(markers.map((m, i) => (i === idx ? { ...m, name: undefined } : m)), idx, tpl);
  // Every copy of the selected marker's kind, in the order they were added
  const copies = selM ? markers.map((m, i) => i).filter((i) => markers[i].t === selM.t) : [];
  const toggleTag = (x: string) => updatePose(pose.id, (p) => ({ ...p, tags: p.tags.includes(x) ? p.tags.filter((y) => y !== x) : [...p.tags, x] }));
  const del = () =>
    Alert.alert('Delete this pose?', 'Shots already saved to your ProPose album stay there.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { router.back(); deletePoses([pose.id]); toast('Pose deleted'); } },
    ]);

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas, paddingTop: insets.top }]}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <View style={styles.ehdr}>
        <RoundBtn icon={I.back} label="Back" onPress={() => router.back()} />
        <Text style={[styles.mid, { color: t.text }]}>Edit guide</Text>
        <RoundBtn icon={pose.fav ? I.heartFill : I.heart} color={pose.fav ? FAV : undefined} label="Favorite"
          onPress={() => { updatePose(pose.id, (p) => ({ ...p, fav: !p.fav })); toast(pose.fav ? 'Removed from favorites' : 'Added to favorites'); }} />
        <RoundBtn icon={I.overlay} on={data.settings.editGrid} label="Grid" onPress={() => setSettings({ editGrid: !data.settings.editGrid })} />
        <RoundBtn icon={I.trash} danger label="Delete pose" onPress={del} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }} scrollEnabled={!draft}>
        <TextInput
          value={pose.name}
          onChangeText={(v) => updatePose(pose.id, (p) => ({ ...p, name: v.slice(0, 40) }))}
          style={[styles.ename, { color: t.text }]}
          accessibilityLabel="Pose name"
          returnKeyType="done"
        />
        <View style={{ alignItems: 'center', paddingHorizontal: 20 }}>
          <View
            style={[styles.frame, { width: fw, height: fh, backgroundColor: t.raised }]}
            onStartShouldSetResponder={() => mode === 'markers'}
            onMoveShouldSetResponder={() => mode === 'markers'}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              const { locationX: x, locationY: y, pageX, pageY } = e.nativeEvent;
              const i = hitMarker(pose.markers, tpl, x, y, fw, fh);
              if (i == null) {
                drag.current = null;
                return setSel(null);
              }
              const m = pose.markers[i];
              drag.current = { i, ox: m.x, oy: m.y, px: pageX, py: pageY, moved: false };
              setSel(i);
            }}
            onResponderMove={(e) => {
              const d = drag.current;
              if (!d) return;
              const dx = e.nativeEvent.pageX - d.px;
              const dy = e.nativeEvent.pageY - d.py;
              if (!d.moved && Math.hypot(dx, dy) < 3) return;
              d.moved = true;
              const nx = clamp01(d.ox + dx / fw);
              const ny = clamp01(d.oy + dy / fh);
              setDraft(pose.markers.map((m, i) => (i === d.i ? { ...m, x: nx, y: ny } : m)));
            }}
            onResponderRelease={() => {
              if (draft) setMarkers(() => draft); // commit once, at the end of the drag
              setDraft(null);
              drag.current = null;
            }}
            onResponderTerminate={() => { setDraft(null); drag.current = null; }}
          >
            <Image source={{ uri: poseUri(pose) }} style={StyleSheet.absoluteFill} contentFit="cover" />
            {data.settings.editGrid && <Grid3 />}
            {mode === 'markers' && <MarkerLayer markers={markers} w={fw} h={fh} fine={{ ...fine, always: true }} tpl={tpl} selected={sel} />}
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Segmented options={[['markers', 'Markers'], ['tags', 'Tags']]} value={mode} onChange={(m) => { setMode(m); setSel(null); }} />
        </View>

        {mode === 'markers' ? (
          <>
            {selM ? (
              <View style={[styles.selm, { backgroundColor: t.card, borderColor: t.hair }, shadow(t)]}>
                <View style={styles.selRow}>
                  <Text style={{ flex: 1, color: t.text, fontWeight: '600', fontSize: 14.5 }} numberOfLines={1}>{markerLabel(markers, sel!, tpl)}</Text>
                  <Mini label="Remove" danger onPress={removeSel} />
                </View>
                {isLine(selM) && (
                  <View style={[styles.selRow, { marginTop: 8 }]}>
                    <Text style={[styles.ctlLbl, { color: t.text2 }]}>Length</Text>
                    <Mini label="−" onPress={() => resize(1 / LEN_STEP)} a11y="Shorter" />
                    {/* Tap the value to go back to the default length */}
                    <Pressable onPress={resetLen} accessibilityLabel="Reset length" hitSlop={4}>
                      <Text style={[styles.ctlVal, { color: t.text2 }]}>{selM.l == null ? 'Auto' : `${Math.round(lenShare(selM) * 100)}%`}</Text>
                    </Pressable>
                    <Mini label="+" onPress={() => resize(LEN_STEP)} a11y="Longer" />
                    {tpl(selM.t).kind === 'short' && (
                      <>
                        <View style={{ flex: 1 }} />
                        <Mini icon={I.rotl} label="5°" onPress={() => rotate(-5)} a11y="Rotate left 5 degrees" />
                        <Text style={[styles.ctlVal, { color: t.text2 }]}>{selM.a || 0}°</Text>
                        <Mini icon={I.rotr} label="5°" onPress={() => rotate(5)} a11y="Rotate right 5 degrees" />
                      </>
                    )}
                  </View>
                )}

                {/* All copies of this kind: tap to select, rename the selected one, delete any */}
                <Text style={[styles.lbl, { color: t.text2, marginTop: 12, marginBottom: 4 }]}>
                  {`All ${tpl(selM.t).name} markers · ${copies.length}`}
                </Text>
                {copies.map((idx) => {
                  const on = idx === sel;
                  return (
                    <View key={idx} style={[styles.copy, { borderColor: t.hair }, on && { backgroundColor: t.raised }]}>
                      <Pressable onPress={() => setSel(idx)} hitSlop={4} accessibilityLabel={`Select ${markerLabel(markers, idx, tpl)}`} accessibilityState={{ selected: on }} style={styles.copyPick}>
                        <View style={[styles.radio, { borderColor: on ? t.text : t.text2 }]}>{on && <View style={[styles.radioIn, { backgroundColor: t.text }]} />}</View>
                        {!on && <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={1}>{markerLabel(markers, idx, tpl)}</Text>}
                      </Pressable>
                      {on && (
                        <TextInput
                          value={markers[idx].name ?? ''}
                          onChangeText={(v) => rename(idx, v)}
                          placeholder={defaultLabel(idx)}
                          placeholderTextColor={t.text2}
                          style={[styles.copyInput, { color: t.text }]}
                          accessibilityLabel="Marker name"
                          returnKeyType="done"
                        />
                      )}
                      {!on && <View style={{ flex: 1 }} />}
                      <Pressable onPress={() => removeAt(idx)} hitSlop={6} accessibilityLabel={`Delete ${markerLabel(markers, idx, tpl)}`} style={styles.copyDel}>
                        <Icon name={I.trash} size={16} color={t.danger} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.hint, { color: t.text2 }]}>Tap a marker on the photo to select it. Drag to move it.</Text>
            )}
            <View style={styles.epanel}>
              <Text style={[styles.lbl, { color: t.text2 }]}>Add markers · tap again for another</Text>
              <View style={styles.chips}>
                {data.tpl.map((tp) => {
                  const n = pose.markers.filter((m) => m.t === tp.id).length;
                  return (
                    <Chip
                      key={tp.id}
                      on={n > 0}
                      onPress={() => addMarker(tp.id)}
                      label={tp.name}
                      left={tp.color !== 'white' ? <View style={[styles.dot, { backgroundColor: PAL[fine.palette][tp.color] }]} /> : undefined}
                      right={n > 1 ? <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>×{n}</Text> : n === 1 ? <Icon name={I.check} size={13} color={t.text} /> : undefined}
                    />
                  );
                })}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.epanel}>
            <Text style={[styles.lbl, { color: t.text2 }]}>Tags · tap to change</Text>
            {TAG_GROUPS.map(([g, ts]) => (
              <View key={g}>
                <Text style={[styles.lbl, { color: t.text2, fontSize: 10, marginTop: 10, marginBottom: 6 }]}>{g}</Text>
                <View style={styles.chips}>
                  {ts.map((x) => <Chip key={x} on={pose.tags.includes(x)} onPress={() => toggleTag(x)} label={cap(x)} />)}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.ebar, { borderColor: t.hair, backgroundColor: t.canvas, paddingBottom: insets.bottom + 10 }]}>
        <GhostBtn icon={I.check} label="Save" style={{ flex: 1 }} onPress={() => { router.back(); toast('Saved'); }} />
        <PrimaryBtn icon={I.camera} label="Shoot" style={{ flex: 1 }} onPress={() => router.push({ pathname: '/camera', params: { guide: pose.id } })} />
      </View>
    </View>
  );
}

function Mini({ label, icon, onPress, danger, a11y }: { label: string; icon?: Parameters<typeof Icon>[0]['name']; onPress: () => void; danger?: boolean; a11y?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="button" accessibilityLabel={a11y ?? label} style={({ pressed }) => [styles.mini, { backgroundColor: danger ? t.danger + '1F' : t.raised }, pressed && { opacity: 0.6 }]}>
      {icon && <Icon name={icon} size={14} color={t.text} />}
      <Text style={{ color: danger ? t.danger : t.text, fontSize: 12.5, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  ehdr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4 },
  mid: { flex: 1, textAlign: 'center', fontWeight: '600', fontSize: 16 },
  ename: { fontFamily: SERIF, fontSize: 32, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  frame: { borderRadius: 20, overflow: 'hidden' },
  selm: { marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 16, paddingVertical: 8, paddingLeft: 14, paddingRight: 8 },
  selRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderTopWidth: StyleSheet.hairlineWidth, paddingLeft: 4, paddingRight: 2, borderRadius: 10 },
  copyPick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, flexShrink: 1 },
  copyInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  copyDel: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioIn: { width: 8, height: 8, borderRadius: 4 },
  ctlLbl: { fontSize: 12, fontWeight: '500' },
  ctlVal: { fontSize: 12, minWidth: 38, textAlign: 'center', fontVariant: ['tabular-nums'] },
  mini: { height: 30, borderRadius: 15, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  hint: { fontSize: 12.5, textAlign: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2, minHeight: 20 },
  epanel: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 16 },
  lbl: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600', marginTop: 14, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  ebar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
