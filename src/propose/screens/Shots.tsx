// Your shots, newest selected. Compare puts the guide and the shot side by side so you can see
// whether the pose matched before you leave. Shots appear the way they were taken: one taken with
// the phone sideways shows turned on its side (upright once you turn the phone), like the camera.
import React, { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arNum } from '../model';
import { poseUri, shotDir, shotUri, useStore } from '../store';
import { CREAM } from '../theme';
import { I, Icon } from '../ui';

export default function Shots() {
  const { data, update } = useStore();
  const insets = useSafeAreaInsets();
  const shots = data.shots;
  const [idx, setIdx] = useState(Math.max(0, shots.length - 1));
  const [cmp, setCmp] = useState(true);
  const i = Math.min(idx, shots.length - 1);
  const s = shots[i];
  const g = s?.guideId ? data.poses.find((p) => p.id === s.guideId) : undefined;
  // One rule for the guide and the shot: wide photos are shown on their side (so they fill the tall
  // view and read upright once you turn the phone), tall ones upright. Both turn the same way: the
  // way the phone was held for this shot, else a quarter turn like the camera's landscape guides.
  const held = s?.rot === 90 || s?.rot === -90 ? s.rot : 90;
  const turnFor = (ar: number) => (ar > 1.01 ? held : 0);
  const gAr = g ? arNum(g.ratio) : 1;
  const gRot = turnFor(gAr);
  const sRot = s ? turnFor(s.ar) : 0;

  const del = () =>
    Alert.alert('Delete this shot?', 'This removes it from ProPose. A copy saved to your Photos album stays there.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            const f = new File(shotDir(), s.file);
            if (f.exists) f.delete();
          } catch {}
          if (shots.length <= 1) router.back();
          update((d) => ({ ...d, shots: d.shots.filter((x) => x.id !== s.id) }));
          setIdx(Math.max(0, i - 1));
        },
      },
    ]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <StatusBar style="light" />
      <View style={styles.hdr}>
        <HBtn icon={I.back} label="Back to camera" onPress={() => router.back()} />
        <Text style={styles.mid}>
          Shots <Text style={{ color: '#A8A196', fontWeight: '400' }}>{s ? `${i + 1} of ${shots.length}` : ''}</Text>
        </Text>
        {g && <HBtn icon={I.compare} label="Compare with guide" on={cmp} onPress={() => setCmp(!cmp)} />}
        {s && <HBtn icon={I.trash} label="Delete shot" danger onPress={del} />}
      </View>

      {!s ? (
        <View style={[styles.main, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ color: '#A8A196' }}>No shots yet</Text>
        </View>
      ) : (
        <View style={styles.main}>
          {cmp && g ? (
            <>
              <Fig uri={poseUri(g)} ar={gAr} rot={gRot} caption={`Guide · ${g.name}`} />
              <Fig uri={shotUri(s)} ar={s.ar} rot={sRot} caption="Your shot" />
            </>
          ) : (
            <Fig uri={shotUri(s)} ar={s.ar} rot={sRot} caption={`${g ? g.name : 'Free shoot'}${data.settings.saveToAlbum ? ' · saved in your ProPose album' : ''}`} />
          )}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 6, paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 20, flexGrow: 1, justifyContent: 'center' }}>
        {shots.map((x, k) => (
          <Pressable key={x.id} onPress={() => setIdx(k)} style={[styles.sth, k === i && styles.sthOn]} accessibilityLabel={`Shot ${k + 1}`}>
            <Image source={{ uri: shotUri(x) }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// A photo of shape `ar` (upright), shown turned by `rot` degrees; turned a quarter, its box is tall
function Fig({ uri, ar, rot = 0, caption }: { uri: string; ar: number; rot?: number; caption: string }) {
  const side = rot === 90 || rot === -90;
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  // The photo's own width and height before turning (its box's sides swap when it's on its side)
  const iw = side ? box.h : box.w;
  const ih = side ? box.w : box.h;
  return (
    <View style={styles.fig}>
      <View onLayout={onLayout} style={{ width: '100%', aspectRatio: side ? 1 / ar : ar, maxHeight: 560, borderRadius: 16, overflow: 'hidden' }}>
        {box.w > 0 && (
          <Image
            source={{ uri }}
            style={{ position: 'absolute', width: iw, height: ih, left: (box.w - iw) / 2, top: (box.h - ih) / 2, transform: [{ rotate: `${rot}deg` }] }}
            contentFit="cover"
          />
        )}
      </View>
      <Text style={styles.cap} numberOfLines={2}>{caption}</Text>
    </View>
  );
}

function HBtn({ icon, label, onPress, on, danger }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onPress: () => void; on?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityLabel={label} style={({ pressed }) => [styles.hbtn, on && { backgroundColor: CREAM }, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={18} color={on ? '#14110F' : danger ? '#FF7A70' : '#F3EEE6'} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#14110F' },
  hdr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4 },
  mid: { flex: 1, textAlign: 'center', color: '#F3EEE6', fontWeight: '600', fontSize: 16 },
  hbtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1E1A17', borderWidth: StyleSheet.hairlineWidth, borderColor: '#2E2924' },
  main: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  fig: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8 },
  cap: { color: '#A8A196', fontSize: 12, textAlign: 'center' },
  sth: { width: 46, height: 58, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', opacity: 0.55 },
  sthOn: { borderColor: CREAM, opacity: 1 },
});
