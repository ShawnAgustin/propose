// Gallery: your pose reference photos. Grid (masonry, each photo keeps its shape) or list,
// favorites, tag filters, long-press to select and delete, Add imports many photos at once.
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arNum, cap, ratioLabel, snapRatio, TAG_GROUPS, uid, type Pose } from '../model';
import { poseDir, poseUri, useStore } from '../store';
import { FAV, SERIF, useTheme } from '../theme';
import { Chip, I, Icon, PrimaryBtn, RoundBtn, TabPill, shadow, ui, useToast } from '../ui';

const GAP = 7;
const PAD = 14;

export default function Gallery() {
  const t = useTheme();
  const { data, update, updatePose, deletePoses } = useStore();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [tags, setTags] = useState<string[]>([]);
  const [favOnly, setFavOnly] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // A pose matches if it's a favorite (when that filter is on) and, in every tag group with picks,
  // has at least one of the picked tags. `skip` ignores one group, for that group's counts.
  const matches = (p: Pose, skip = -1) => {
    if (favOnly && !p.fav) return false;
    return TAG_GROUPS.every(([, ts], gi) => {
      if (gi === skip) return true;
      const sel = tags.filter((x) => ts.includes(x));
      return !sel.length || sel.some((x) => p.tags.includes(x));
    });
  };
  const poses = data.poses.filter((p) => matches(p));
  const nActive = tags.length + (favOnly ? 1 : 0);
  const toggleTag = (x: string) => setTags((ts) => (ts.includes(x) ? ts.filter((y) => y !== x) : [...ts, x]));
  const clearFilters = () => { setTags([]); setFavOnly(false); };

  const toggleFav = (p: Pose) => {
    updatePose(p.id, (q) => ({ ...q, fav: !q.fav }));
    Haptics.selectionAsync().catch(() => {});
    toast(p.fav ? 'Removed from favorites' : 'Added to favorites');
  };

  const addPoses = async () => {
    try {
      // Lazy so a build without the picker shows an error instead of crashing the screen
      const ImagePicker = await import('expo-image-picker');
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: true, selectionLimit: 0, quality: 1 });
      if (r.canceled || !r.assets.length) return;
      const dir = poseDir();
      const now = Date.now();
      const added: Pose[] = r.assets.map((a, i) => {
        const id = uid('p');
        const ext = (a.uri.split('?')[0].split('.').pop() || 'jpg').toLowerCase();
        const file = `${id}.${ext}`;
        new File(a.uri).copySync(new File(dir, file)); // keep our own copy
        return {
          id,
          name: (a.fileName?.replace(/\.[^.]+$/, '') || 'New pose').slice(0, 24),
          file,
          ratio: snapRatio(a.width, a.height),
          fav: false,
          tags: [],
          markers: [],
          createdAt: now + i,
        };
      });
      update((d) => ({ ...d, poses: [...added.reverse(), ...d.poses] }));
      toast(`${added.length} pose${added.length > 1 ? 's' : ''} added`);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      Alert.alert("Couldn't add photos", msg.includes('ExponentImagePicker') ? 'The photo picker is not in this build. Rebuild the app.' : msg);
    }
  };

  const openPose = (p: Pose) => {
    if (selecting) return setSelected((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]));
    router.push({ pathname: '/pose/[id]', params: { id: p.id } });
  };
  const startSelect = (p: Pose) => {
    if (selecting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelecting(true);
    setSelected([p.id]);
  };
  const deleteSelected = () => {
    const n = selected.length;
    Alert.alert(`Delete ${n} pose${n > 1 ? 's' : ''}?`, 'Shots already saved to your ProPose album stay there.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deletePoses(selected);
          setSelecting(false);
          setSelected([]);
          toast(`${n} pose${n > 1 ? 's' : ''} deleted`);
        },
      },
    ]);
  };

  // ── Empty gallery ──
  if (!data.poses.length) {
    return (
      <View style={[styles.screen, { backgroundColor: t.canvas, paddingTop: insets.top }]}>
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Header t={t} title="Poses" sub="No poses yet" right={<RoundBtn icon={I.plus} label="Add pose photos" onPress={addPoses} />} />
        <View style={styles.empty}>
          <View style={styles.fan}>
            {[-6, 6, 0].map((r, i) => (
              <View key={i} style={[styles.fanCard, { backgroundColor: t.raised, borderColor: t.card, transform: [{ rotate: `${r}deg` }], left: i === 0 ? 0 : i === 1 ? 140 : 70, top: i === 2 ? 22 : 10, zIndex: i === 2 ? 2 : 1 }, shadow(t)]}>
                <Icon name={i === 2 ? I.photo : I.gallery} size={34} color={t.muted} />
              </View>
            ))}
          </View>
          <Text style={[styles.emptyTitle, { color: t.text }]}>Start with a pose</Text>
          <Text style={[styles.emptyBody, { color: t.text2 }]}>
            Add photos you like, mark where the head, feet or horizon should sit, then shoot with the guide on your camera.
          </Text>
          <PrimaryBtn icon={I.gallery} label="Add pose photos" onPress={addPoses} />
        </View>
        <TabPill current="gallery" />
      </View>
    );
  }

  // ── Masonry: 3 columns, each tile placed in the shortest column ──
  const colW = (width - PAD * 2 - GAP * 2) / 3;
  const cols: Pose[][] = [[], [], []];
  const heights = [0, 0, 0];
  for (const p of poses) {
    const c = heights.indexOf(Math.min(...heights));
    cols[c].push(p);
    heights[c] += colW / arNum(p.ratio) + GAP;
  }

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas, paddingTop: insets.top }]}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {selecting ? (
        <View style={styles.selbar}>
          <Pressable onPress={() => { setSelecting(false); setSelected([]); }} hitSlop={8}>
            <Text style={{ color: t.text, fontSize: 15 }}>Cancel</Text>
          </Pressable>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{selected.length ? `${selected.length} selected` : 'Select poses'}</Text>
          <Pressable onPress={deleteSelected} disabled={!selected.length} accessibilityLabel="Delete" style={[styles.selDel, !selected.length && { opacity: 0.35 }]}>
            <Icon name={I.trash} size={20} color={t.danger} />
          </Pressable>
        </View>
      ) : (
        <>
          <Header
            t={t}
            title="Poses"
            sub={`${data.poses.length} pose${data.poses.length === 1 ? '' : 's'}${nActive ? ` · showing ${poses.length}` : ''}`}
            right={
              <>
                <RoundBtn icon={view === 'grid' ? I.list : I.grid} label={`Switch to ${view === 'grid' ? 'list' : 'grid'}`} onPress={() => setView(view === 'grid' ? 'list' : 'grid')} />
                <RoundBtn icon={I.plus} label="Add pose photos" onPress={addPoses} />
              </>
            }
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters} contentContainerStyle={styles.filtersIn}>
            <Chip
              onPress={() => setSheet(true)}
              on={nActive > 0}
              left={<Icon name={I.sliders} size={15} color={t.text} />}
              label="Filter"
              right={nActive ? <View style={[styles.badge, { backgroundColor: t.text }]}><Text style={{ color: t.canvas, fontSize: 10.5, fontWeight: '700' }}>{nActive}</Text></View> : undefined}
            />
            <Chip onPress={() => setFavOnly(!favOnly)} on={favOnly} left={<Icon name={favOnly ? I.heartFill : I.heart} size={16} color={favOnly ? FAV : t.text} />} />
            {tags.map((x) => (
              <Chip key={x} onPress={() => toggleTag(x)} on label={cap(x)} right={<Text style={{ color: t.text2, fontSize: 15 }}>×</Text>} />
            ))}
          </ScrollView>
        </>
      )}

      {nActive > 0 && !poses.length ? (
        <View style={[styles.empty, { paddingTop: 40 }]}>
          <Text style={[styles.emptyBody, { color: t.text2 }]}>
            {favOnly && !tags.length ? 'No favorites yet. Tap the heart on a pose to save it here.' : 'No poses match these filters.'}
          </Text>
          <Pressable onPress={clearFilters}><Text style={{ color: t.text, fontWeight: '600', textDecorationLine: 'underline' }}>Clear filters</Text></Pressable>
        </View>
      ) : view === 'grid' ? (
        <ScrollView contentContainerStyle={[styles.masonry, { paddingBottom: insets.bottom + 100 }]}>
          {cols.map((col, ci) => (
            <View key={ci} style={{ width: colW, gap: GAP }}>
              {col.map((p) => {
                const sel = selected.includes(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => openPose(p)}
                    onLongPress={() => startSelect(p)}
                    delayLongPress={450}
                    accessibilityLabel={p.name}
                    style={[styles.tile, { height: colW / arNum(p.ratio), backgroundColor: t.raised }, sel && { borderWidth: 3, borderColor: t.accent }]}
                  >
                    <Image source={{ uri: poseUri(p) }} style={[StyleSheet.absoluteFill, sel && { opacity: 0.82 }]} contentFit="cover" />
                    {selecting ? (
                      <View style={[styles.ck, sel && { backgroundColor: t.accent, borderColor: t.accent }]}>
                        {sel && <Icon name={I.check} size={13} color={t.on} />}
                      </View>
                    ) : (
                      <Pressable onPress={() => toggleFav(p)} hitSlop={6} style={styles.tileFav} accessibilityLabel={p.fav ? 'Remove from favorites' : 'Add to favorites'}>
                        <Icon name={p.fav ? I.heartFill : I.heart} size={20} color={p.fav ? FAV : '#fff'} />
                      </Pressable>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 100 }]}>
          {poses.map((p) => {
            const sel = selected.includes(p.id);
            return (
              <Pressable
                key={p.id}
                onPress={() => openPose(p)}
                onLongPress={() => startSelect(p)}
                delayLongPress={450}
                style={[styles.row, { backgroundColor: t.card, borderColor: sel ? t.accent : t.hair }, sel && { borderWidth: 2 }, shadow(t)]}
              >
                <Image source={{ uri: poseUri(p) }} style={styles.rowImg} contentFit="cover" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.text, fontWeight: '600', fontSize: 15.5 }} numberOfLines={1}>{p.name}</Text>
                  <Text style={{ color: t.text2, fontSize: 12.5, marginTop: 3 }}>
                    {ratioLabel(p.ratio)} · {p.markers.length} marker{p.markers.length === 1 ? '' : 's'}
                  </Text>
                </View>
                {selecting ? (
                  <View style={[styles.rdot, { borderColor: t.muted }, sel && { backgroundColor: t.accent, borderColor: t.accent }]}>
                    {sel && <Icon name={I.check} size={13} color={t.on} />}
                  </View>
                ) : (
                  <>
                    <Pressable onPress={() => toggleFav(p)} hitSlop={4} style={styles.rowFav} accessibilityLabel={p.fav ? 'Remove from favorites' : 'Add to favorites'}>
                      <Icon name={p.fav ? I.heartFill : I.heart} size={20} color={p.fav ? FAV : t.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => router.push({ pathname: '/camera', params: { guide: p.id } })}
                      style={({ pressed }) => [styles.go, { backgroundColor: t.accent }, pressed && ui.pressed]}
                      accessibilityLabel={`Shoot with ${p.name}`}
                    >
                      <Icon name={I.camera} size={18} color={t.on} />
                    </Pressable>
                  </>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {!selecting && <TabPill current="gallery" />}

      <FilterSheet
        visible={sheet && !selecting}
        onClose={() => setSheet(false)}
        poses={data.poses}
        matches={matches}
        tags={tags}
        toggleTag={toggleTag}
        favOnly={favOnly}
        setFavOnly={setFavOnly}
        clear={clearFilters}
        count={poses.length}
      />
    </View>
  );
}

export function Header({ t, title, sub, right }: { t: ReturnType<typeof useTheme>; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.hdr}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {sub ? <Text style={{ color: t.text2, fontSize: 13, marginTop: 4 }}>{sub}</Text> : null}
      </View>
      <View style={styles.hbtns}>{right}</View>
    </View>
  );
}

function FilterSheet({ visible, onClose, poses, matches, tags, toggleTag, favOnly, setFavOnly, clear, count }: {
  visible: boolean; onClose: () => void; poses: Pose[]; matches: (p: Pose, skip?: number) => boolean;
  tags: string[]; toggleTag: (t: string) => void; favOnly: boolean; setFavOnly: (v: boolean) => void; clear: () => void; count: number;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Only offer tags some pose actually has, so the sheet stays short
  const used = new Set(poses.flatMap((p) => p.tags));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close filters" />
      <View style={[styles.fsheet, { backgroundColor: t.canvas, paddingBottom: insets.bottom + 12 }]}>
        <Pressable onPress={onClose} style={[styles.grab, { backgroundColor: t.hair }]} accessibilityLabel="Close" />
        <View style={styles.fh}>
          <Text style={{ fontFamily: SERIF, fontSize: 26, color: t.text }}>Filter</Text>
          <Pressable onPress={clear} disabled={!tags.length && !favOnly}>
            <Text style={{ color: t.text2, fontSize: 14, opacity: tags.length || favOnly ? 1 : 0.35 }}>Clear all</Text>
          </Pressable>
        </View>
        <ScrollView style={{ paddingHorizontal: 20 }}>
          <View style={[styles.favrow, { borderColor: t.hair }]}>
            <Icon name={I.heartFill} size={18} color={FAV} />
            <Text style={{ flex: 1, color: t.text, fontSize: 15 }}>Favorites only</Text>
            <Switch value={favOnly} onValueChange={setFavOnly} />
          </View>
          {used.size === 0 && (
            <Text style={{ color: t.text2, fontSize: 13, lineHeight: 19, paddingVertical: 14 }}>
              No tags yet. Open a pose and use the Tags tab to tag it — then you can filter by people, pose, setting and framing here.
            </Text>
          )}
          {TAG_GROUPS.map(([g, ts], gi) => {
            const shown = ts.filter((x) => used.has(x));
            if (!shown.length) return null;
            const pool = poses.filter((p) => matches(p, gi));
            const k = tags.filter((x) => ts.includes(x)).length;
            return (
              <View key={g} style={[styles.fg, { borderColor: t.hair }]}>
                <View style={styles.fgl}>
                  <Text style={[styles.cap, { color: t.text2 }]}>{g}</Text>
                  {k > 1 && <Text style={{ color: t.muted, fontSize: 12 }}>Any of these</Text>}
                </View>
                <View style={styles.chips}>
                  {shown.map((x) => {
                    const on = tags.includes(x);
                    const c = pool.filter((p) => p.tags.includes(x)).length;
                    return (
                      <Chip key={x} big on={on} disabled={!on && !c} onPress={() => toggleTag(x)} label={cap(x)} count={c}
                        left={on ? <Icon name={I.check} size={13} color={t.text} /> : undefined} />
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
        <View style={[styles.ff, { borderColor: t.hair }]}>
          <PrimaryBtn label={count ? `Show ${count} pose${count === 1 ? '' : 's'}` : 'No poses match'} disabled={!count} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  hdr: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  title: { fontFamily: SERIF, fontSize: 38, lineHeight: 42, letterSpacing: -0.4 },
  hbtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  filters: { flexGrow: 0 },
  filtersIn: { paddingHorizontal: 20, paddingBottom: 10, gap: 6 },
  badge: { minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  masonry: { flexDirection: 'row', gap: GAP, paddingHorizontal: PAD },
  tile: { borderRadius: 18, overflow: 'hidden' },
  tileFav: { position: 'absolute', right: 6, bottom: 6, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 2, shadowOffset: { width: 0, height: 1 } },
  ck: { position: 'absolute', top: 7, right: 7, width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  list: { gap: 10, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 18, borderWidth: 1 },
  rowImg: { width: 54, height: 66, borderRadius: 12 },
  rowFav: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  rdot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  go: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  selbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10 },
  selDel: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingTop: 40, gap: 0 },
  fan: { width: 260, height: 200, marginTop: 10, marginBottom: 28 },
  fanCard: { position: 'absolute', width: 118, height: 156, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: SERIF, fontSize: 30, lineHeight: 34, marginBottom: 10, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 22 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  fsheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '82%', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  grab: { width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 8, marginBottom: 2 },
  fh: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  favrow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  fg: { paddingTop: 12, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  fgl: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cap: { fontSize: 12, fontWeight: '600', letterSpacing: 0.7, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ff: { paddingHorizontal: 20, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
