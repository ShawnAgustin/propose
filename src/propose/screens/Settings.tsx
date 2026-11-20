// Settings: appearance, marker names, guide and camera defaults, accessibility presets, AI, about.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  COLORS, CUSTOM_TPL, DASH, DEF_TPL, KINDS, PAL, PRESETS, uid,
  type ColorKey, type MarkerKind, type PaletteKey, type PlacedMarker, type PresetKey,
} from '../model';
import { useStore } from '../store';
import { SERIF, useTheme, type Theme } from '../theme';
import { I, Icon, PrimaryBtn, RoundBtn, Segmented, Slider, TabPill, shadow, useToast, type IconName } from '../ui';
import { MarkerLayer } from '../markers';
import { Header } from './Gallery';

const VERSION = '0.4';

export function SettingsRoot() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = useStore();
  const s = data.settings;
  const rows: [string, IconName, string, string][] = [
    ['appearance', I.contrast, 'Appearance', { light: 'Light', dark: 'Dark', auto: 'Automatic' }[s.theme]],
    ['markers', I.marker, 'Marker names', String(data.tpl.length)],
    ['guides', I.layers, 'Guides and camera', ''],
    ['a11y', I.a11y, 'Accessibility', s.preset === 'custom' ? 'Custom' : PRESETS[s.preset].name],
    ['ai', I.spark, 'AI features', 'Off'],
    ['about', I.info, 'About ProPose', `v${VERSION}`],
  ];
  const group = (rs: typeof rows) => (
    <Group t={t}>
      {rs.map(([k, icon, name, v], i) => (
        <Pressable key={k} onPress={() => router.push({ pathname: '/settings/[page]', params: { page: k } })}
          style={({ pressed }) => [styles.srw, { borderColor: t.hair }, i === rs.length - 1 && { borderBottomWidth: 0 }, pressed && { backgroundColor: t.raised }]}>
          <View style={[styles.sq, { backgroundColor: t.raised }]}><Icon name={icon} size={17} color={t.text} /></View>
          <Text style={[styles.rowText, { color: t.text }]}>{name}</Text>
          <Text style={{ marginLeft: 'auto', color: t.text2, fontSize: 14 }}>{v}</Text>
          <Icon name={I.chev} size={14} color={t.muted} />
        </Pressable>
      ))}
    </Group>
  );
  return (
    <View style={[styles.screen, { backgroundColor: t.canvas, paddingTop: insets.top }]}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <Header t={t} title="Settings" />
        {group(rows.slice(0, 3))}
        {group(rows.slice(3, 5))}
        {group(rows.slice(5))}
        <Text style={[styles.foot, { color: t.muted }]}>ProPose keeps poses, shots and settings on this phone only.</Text>
      </ScrollView>
      <TabPill current="settings" />
    </View>
  );
}

export function SettingsPage({ page }: { page: string }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const titles: Record<string, string> = {
    appearance: 'Appearance', markers: 'Marker names', guides: 'Guides and camera', a11y: 'Accessibility', ai: 'AI features', about: 'About ProPose',
  };
  const title = titles[page] ?? 'Settings';
  return (
    <View style={[styles.screen, { backgroundColor: t.canvas, paddingTop: insets.top }]}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <View style={styles.shdr}>
        <RoundBtn icon={I.back} label="Back" onPress={() => router.back()} />
        <Text style={[styles.shdrMid, { color: t.text }]}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}>
        <Text style={[styles.stitle, { color: t.text }]}>{title}</Text>
        {page === 'appearance' && <Appearance t={t} />}
        {page === 'markers' && <Markers t={t} />}
        {page === 'guides' && <Guides t={t} />}
        {page === 'a11y' && <A11y t={t} />}
        {page === 'ai' && <Ai t={t} />}
        {page === 'about' && <About t={t} />}
      </ScrollView>
    </View>
  );
}

// ── Pages ────────────────────────────────────────────────────────────────

function Appearance({ t }: { t: Theme }) {
  const { data, setSettings } = useStore();
  const opts: ['light' | 'dark' | 'auto', string][] = [['light', 'Light'], ['dark', 'Dark'], ['auto', 'Automatic']];
  return (
    <>
      <Group t={t} pad>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {opts.map(([k, n]) => {
            const on = data.settings.theme === k;
            const dk = k === 'dark';
            const card = dk ? '#28231F' : '#fff';
            return (
              <Pressable key={k} onPress={() => setSettings({ theme: k })} style={styles.th3} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                <View style={[styles.pv, { borderColor: t.hair, backgroundColor: dk ? '#14110F' : '#F6F4F0' }]}>
                  {k === 'auto' && <View style={[StyleSheet.absoluteFill, { left: '50%', backgroundColor: '#14110F' }]} />}
                  <Text style={{ fontFamily: SERIF, fontSize: 13, color: dk ? '#F3EEE6' : '#1C1917' }}>Poses</Text>
                  <View style={[styles.pvBar, { backgroundColor: card }]} />
                  <View style={[styles.pvBar, { backgroundColor: card }]} />
                  <View style={[styles.pvPill, { backgroundColor: dk ? '#F3E3C3' : '#2B221C' }]} />
                </View>
                <Text style={{ color: t.text, fontSize: 13 }}>{n}</Text>
                <View style={[styles.rd, { borderColor: t.muted }, on && { backgroundColor: t.accent, borderColor: t.accent }]}>
                  {on && <Icon name={I.check} size={11} color={t.on} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Group>
      <Group t={t}>
        <Row t={t} title="Camera screen" sub="Always dark, so the preview and markers stay easy to read." last />
      </Group>
    </>
  );
}

function Markers({ t }: { t: Theme }) {
  const { data, update } = useStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MarkerKind>('short');
  const [color, setColor] = useState<ColorKey>('blue');
  const add = () => {
    const n = name.trim();
    if (!n) return toast('Type a name first');
    update((d) => ({ ...d, tpl: [...d.tpl, { id: uid('c'), name: n, kind, color, custom: true }] }));
    setName('');
    toast(`${n} added`);
  };
  const restore = () => {
    update((d) => {
      const own = d.tpl.filter((x) => x.custom && !CUSTOM_TPL.some((c) => c.id === x.id));
      return { ...d, tpl: [...DEF_TPL, ...CUSTOM_TPL, ...own].map((x) => ({ ...x })) };
    });
    toast('Default names restored');
  };
  return (
    <>
      <Label t={t}>Your markers</Label>
      <Group t={t}>
        {data.tpl.map((x, i) => (
          <View key={x.id} style={[styles.srw, { borderColor: t.hair }, i === data.tpl.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ width: 26, alignItems: 'center' }}>
              <KindGlyph kind={x.kind} color={x.color === 'white' ? t.text : PAL.standard[x.color]} />
            </View>
            <Text style={[styles.rowText, { color: t.text, flex: 1 }]} numberOfLines={1}>{x.name}</Text>
            <Text style={{ color: t.text2, fontSize: 13 }}>{KINDS[x.kind]}</Text>
            <Pressable hitSlop={8} accessibilityLabel={`Delete ${x.name}`} style={{ marginLeft: 8 }}
              onPress={() => update((d) => ({ ...d, tpl: d.tpl.filter((y) => y.id !== x.id) }))}>
              <Icon name={I.trash} size={17} color={t.danger} />
            </Pressable>
          </View>
        ))}
      </Group>
      <Label t={t}>New marker name</Label>
      <Group t={t} pad>
        <View style={{ gap: 12 }}>
          <TextInput value={name} onChangeText={setName} placeholder="Bag strap" placeholderTextColor={t.muted}
            style={[styles.tinput, { backgroundColor: t.raised, color: t.text }]} returnKeyType="done" onSubmitEditing={add} />
          <Segmented options={Object.entries(KINDS).map(([k, n]) => [k as MarkerKind, n.replace(' icon', '')])} value={kind} onChange={setKind} />
          <Text style={{ color: t.text2, fontSize: 13 }}>Color</Text>
          <View style={styles.colors}>
            {COLORS.map((c) => (
              <Pressable key={c} onPress={() => setColor(c)} accessibilityLabel={c} accessibilityState={{ selected: color === c }}
                style={[styles.color, { backgroundColor: PAL.standard[c] }, color === c && { borderWidth: 3, borderColor: t.accent }]} />
            ))}
          </View>
          <PrimaryBtn label="Add marker name" onPress={add} />
        </View>
      </Group>
      <Pressable onPress={restore} style={{ alignSelf: 'center', padding: 8 }}>
        <Text style={{ color: t.text, textDecorationLine: 'underline', fontWeight: '500' }}>Restore default names</Text>
      </Pressable>
    </>
  );
}

function Guides({ t }: { t: Theme }) {
  const { data, setSettings } = useStore();
  const s = data.settings;
  return (
    <>
      <Label t={t}>Default opacity</Label>
      <Group t={t}>
        <View style={styles.slide}>
          <View style={styles.slideTop}>
            <Text style={{ color: t.text, fontSize: 15 }}>Photo overlay</Text>
            <Text style={{ color: t.text2, fontSize: 13 }}>{s.defOp}%</Text>
          </View>
          <Slider value={s.defOp} min={10} max={100} step={1} onChange={(v) => setSettings({ defOp: v })} color={t.accent} track={t.hair} />
        </View>
      </Group>
      <Label t={t}>Photo quality</Label>
      <Group t={t} pad>
        <Segmented options={[['standard', 'Standard'], ['high', 'High detail']]} value={s.quality} onChange={(q) => setSettings({ quality: q })} />
      </Group>
      <Group t={t}>
        <Row t={t} title="Show grid and markers" sub="You can also toggle this on the camera" right={<Switch value={s.showOverlay} onValueChange={(v) => setSettings({ showOverlay: v })} />} />
        <Row t={t} title="Grid in Edit guide" right={<Switch value={s.editGrid} onValueChange={(v) => setSettings({ editGrid: v })} />} />
        <Row t={t} title="Save shots to album" sub="Copies each shot to a ProPose album in Photos" right={<Switch value={s.saveToAlbum} onValueChange={(v) => setSettings({ saveToAlbum: v })} />} last />
      </Group>
      <Text style={[styles.foot, { color: t.muted, paddingBottom: 0 }]}>High detail saves at full quality and uses more space.</Text>
    </>
  );
}

function A11y({ t }: { t: Theme }) {
  const { data, setFine, applyPreset, tpl } = useStore();
  const { width } = useWindowDimensions();
  const f = data.settings.fine;
  const pw = width - 32;
  const ph = pw / 1.9;
  const sample: PlacedMarker[] = [
    { t: 'head', x: 0.42, y: 0.16, a: 0 },
    { t: 'eyes', x: 0.6, y: 0.42, a: 0 },
    { t: 'horizon', x: 0.5, y: 0.72, a: 0 },
    { t: 'sun', x: 0.86, y: 0.3, a: 0 },
  ];
  const palettes: [PaletteKey, string][] = [['standard', 'Standard'], ['cb', 'Color-blind safe'], ['hc', 'High contrast']];
  const toggles: [keyof typeof f, string, string][] = [
    ['always', 'Always show labels', ''],
    ['dash', 'Dashes and shapes', 'Color is never the only cue'],
    ['outline', 'Black outline', ''],
    ['hold', 'Hold to enlarge labels', 'Press and hold a marker on the camera to grow its label'],
    ['big', 'Larger buttons', 'Bigger shutter, fewer options on the camera'],
  ];
  return (
    <>
      <View style={[styles.preview, { width: pw, height: ph }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#5B4A3C' }]} />
        <View style={[StyleSheet.absoluteFill, { top: '62%', backgroundColor: '#3A3128' }]} />
        <MarkerLayer markers={sample} w={pw} h={ph} fine={f} tpl={tpl} />
      </View>
      <Label t={t}>Presets</Label>
      <View style={styles.presets}>
        {(Object.keys(PRESETS) as PresetKey[]).map((k) => {
          const on = data.settings.preset === k;
          return (
            <Pressable key={k} onPress={() => applyPreset(k)} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={[styles.pre, { backgroundColor: t.card, borderColor: on ? t.accent : t.hair }, on && { borderWidth: 2 }]}>
              <Text style={{ color: t.text, fontWeight: '600', fontSize: 14 }}>{PRESETS[k].name}</Text>
              <Text style={{ color: t.text2, fontSize: 11.5, lineHeight: 15 }}>{PRESETS[k].helps}</Text>
            </Pressable>
          );
        })}
      </View>
      <Label t={t}>Marker colors</Label>
      <Group t={t}>
        {palettes.map(([k, n], i) => (
          <Pressable key={k} onPress={() => setFine({ palette: k })} style={[styles.pal, { borderColor: t.hair }, i === palettes.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: t.text, fontWeight: '600', fontSize: 14 }}>{n}</Text>
              <View style={[styles.rd, { borderColor: t.muted }, f.palette === k && { backgroundColor: t.accent, borderColor: t.accent }]}>
                {f.palette === k && <Icon name={I.check} size={11} color={t.on} />}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {COLORS.map((c) => (
                <View key={c} style={{ flex: 1, alignItems: 'center', gap: 5 }}>
                  <View style={[styles.swatch, { backgroundColor: PAL[k][c] }]} />
                  <View style={{ width: '100%', borderTopWidth: 3, borderColor: PAL[k][c], borderStyle: k === 'cb' ? DASH[c] : 'solid' }} />
                </View>
              ))}
            </View>
          </Pressable>
        ))}
      </Group>
      <Label t={t}>Fine controls</Label>
      <Group t={t}>
        <View style={[styles.slide, { borderColor: t.hair, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.slideTop}>
            <Text style={{ color: t.text, fontSize: 15 }}>Line thickness</Text>
            <Text style={{ color: t.text2, fontSize: 13 }}>{f.w}px</Text>
          </View>
          <Slider value={f.w} min={1.5} max={6} step={0.5} onChange={(v) => setFine({ w: v })} color={t.accent} track={t.hair} />
        </View>
        <View style={[styles.slide, { borderColor: t.hair, borderBottomWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.slideTop}>
            <Text style={{ color: t.text, fontSize: 15 }}>Label size</Text>
            <Text style={{ color: t.text2, fontSize: 13 }}>{f.lbl}pt</Text>
          </View>
          <Slider value={f.lbl} min={9} max={18} step={1} onChange={(v) => setFine({ lbl: v })} color={t.accent} track={t.hair} />
        </View>
        {toggles.map(([k, n, sub], i) => (
          <Row key={k} t={t} title={n} sub={sub} last={i === toggles.length - 1}
            right={<Switch value={!!f[k]} onValueChange={(v) => setFine({ [k]: v })} />} />
        ))}
      </Group>
      <Text style={[styles.foot, { color: t.muted, paddingBottom: 0 }]}>The color-blind palette is approximate until it is checked with color-blind users.</Text>
    </>
  );
}

function Ai({ t }: { t: Theme }) {
  return (
    <>
      <Group t={t}>
        <Row t={t} title="Use AI features" sub="Not available in this build yet. When it is, it will send a small copy of a photo to a cloud model, and only when you turn it on." right={<Switch value={false} disabled />} />
        <Row t={t} title="Pose tagging" sub="Would tag every pose on import: squat, couple, cafe and more. For now, tag poses yourself in Edit guide › Tags." right={<Switch value={false} disabled />} last />
      </Group>
      <Text style={[styles.foot, { color: t.muted, paddingBottom: 0 }]}>Tags power the filters at the top of the gallery. Pick several to narrow down.</Text>
    </>
  );
}

function About({ t }: { t: Theme }) {
  return (
    <>
      <Group t={t}>
        <Row t={t} title="Version" right={<Text style={{ color: t.text2 }}>{VERSION}</Text>} />
        <Row t={t} title="Storage" right={<Text style={{ color: t.text2 }}>On this phone only</Text>} last />
      </Group>
      <Group t={t}>
        <Pressable onPress={() => router.push('/lab')} style={({ pressed }) => [styles.srw, { borderBottomWidth: 0 }, pressed && { backgroundColor: t.raised }]}>
          <View style={[styles.sq, { backgroundColor: t.raised }]}><Icon name={I.lab} size={17} color={t.text} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowText, { color: t.text }]}>Camera lab</Text>
            <Text style={{ color: t.text2, fontSize: 12.5, marginTop: 3 }}>The earlier test camera: free-drawn lines, overlay, debug log</Text>
          </View>
          <Icon name={I.chev} size={14} color={t.muted} />
        </Pressable>
      </Group>
    </>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────

function Group({ t, children, pad }: { t: Theme; children: React.ReactNode; pad?: boolean }) {
  return <View style={[styles.grp, { backgroundColor: t.card, borderColor: t.hair }, pad && { padding: 14 }, shadow(t)]}>{children}</View>;
}
function Label({ t, children }: { t: Theme; children: React.ReactNode }) {
  return <Text style={[styles.slbl, { color: t.text2 }]}>{children}</Text>;
}
function Row({ t, title, sub, right, last }: { t: Theme; title: string; sub?: string; right?: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.srw, { borderColor: t.hair }, sub ? { paddingVertical: 13 } : null, last && { borderBottomWidth: 0 }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowText, { color: t.text }]}>{title}</Text>
        {sub ? <Text style={{ color: t.text2, fontSize: 12.5, lineHeight: 18, marginTop: 4 }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}
function KindGlyph({ kind, color }: { kind: MarkerKind; color: string }) {
  if (kind === 'eye') return <Icon name={I.eye} size={18} color={color} />;
  if (kind === 'circle') return <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: color }} />;
  return <View style={{ width: kind === 'long' ? 22 : 14, height: 2.5, borderRadius: 2, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  grp: { marginHorizontal: 16, marginBottom: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  srw: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14, paddingVertical: 10, minHeight: 50, borderBottomWidth: StyleSheet.hairlineWidth },
  sq: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  rowText: { fontSize: 15 },
  shdr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 48 },
  shdrMid: { flex: 1, textAlign: 'center', fontWeight: '600', fontSize: 16 },
  stitle: { fontFamily: SERIF, fontSize: 32, lineHeight: 36, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14 },
  slbl: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: '600', marginHorizontal: 32, marginTop: 6, marginBottom: 8 },
  foot: { fontSize: 12.5, textAlign: 'center', paddingHorizontal: 30, paddingTop: 14, paddingBottom: 20, lineHeight: 19 },
  th3: { flex: 1, alignItems: 'center', gap: 8 },
  pv: { width: '100%', aspectRatio: 0.62, borderRadius: 14, borderWidth: 1, overflow: 'hidden', padding: 8, gap: 5 },
  pvBar: { height: 16, borderRadius: 5 },
  pvPill: { marginTop: 'auto', height: 8, width: '50%', alignSelf: 'center', borderRadius: 4 },
  rd: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tinput: { height: 44, borderRadius: 12, paddingHorizontal: 14, fontSize: 15 },
  colors: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, paddingVertical: 4 },
  color: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  slide: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  slideTop: { flexDirection: 'row', justifyContent: 'space-between' },
  preview: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', marginBottom: 14 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginHorizontal: 16, marginBottom: 14 },
  pre: { width: '48%', flexGrow: 1, borderWidth: 1.5, borderRadius: 16, padding: 12, gap: 3 },
  pal: { paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
});
