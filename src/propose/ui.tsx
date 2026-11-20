// Shared ProPose UI pieces: icons, round buttons, chips, segmented control, slider, toast, tab pill.
import React, { createContext, useCallback, useContext, useRef, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type Theme } from './theme';

export type IconName = ComponentProps<typeof SymbolView>['name'];

// SF Symbol on iOS, Material Symbol on Android
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return <SymbolView name={name} size={size} tintColor={color} style={{ width: size, height: size }} />;
}

export const I = {
  back: { ios: 'chevron.left', android: 'arrow_back' },
  plus: { ios: 'plus', android: 'add' },
  list: { ios: 'list.bullet', android: 'view_list' },
  grid: { ios: 'square.grid.2x2', android: 'grid_view' },
  heart: { ios: 'heart', android: 'favorite_border' },
  heartFill: { ios: 'heart.fill', android: 'favorite' },
  check: { ios: 'checkmark', android: 'check' },
  trash: { ios: 'trash', android: 'delete' },
  camera: { ios: 'camera.fill', android: 'photo_camera' },
  gallery: { ios: 'photo.on.rectangle', android: 'photo_library' },
  gear: { ios: 'gearshape', android: 'settings' },
  sliders: { ios: 'slider.horizontal.3', android: 'tune' },
  chev: { ios: 'chevron.right', android: 'chevron_right' },
  down: { ios: 'chevron.down', android: 'expand_more' },
  up: { ios: 'chevron.up', android: 'expand_less' },
  bolt: { ios: 'bolt.fill', android: 'flash_on' },
  boltOff: { ios: 'bolt.slash', android: 'flash_off' },
  timer: { ios: 'timer', android: 'timer' },
  overlay: { ios: 'squareshape.split.3x3', android: 'grid_on' },
  flip: { ios: 'arrow.triangle.2.circlepath.camera', android: 'cameraswitch' },
  layers: { ios: 'square.3.layers.3d', android: 'layers' },
  eye: { ios: 'eye', android: 'visibility' },
  sun: { ios: 'sun.max.fill', android: 'wb_sunny' },
  compare: { ios: 'rectangle.split.2x1', android: 'compare' },
  contrast: { ios: 'circle.lefthalf.filled', android: 'contrast' },
  marker: { ios: 'mappin', android: 'place' },
  a11y: { ios: 'accessibility', android: 'accessibility_new' },
  spark: { ios: 'sparkles', android: 'auto_awesome' },
  info: { ios: 'info.circle', android: 'info' },
  rotl: { ios: 'rotate.left', android: 'rotate_left' },
  rotr: { ios: 'rotate.right', android: 'rotate_right' },
  level: { ios: 'level', android: 'straighten' },
  lab: { ios: 'flask', android: 'science' },
  photo: { ios: 'photo', android: 'image' },
} satisfies Record<string, IconName>;

// Round header button (40px card circle)
export function RoundBtn({ icon, onPress, label, on, danger, color, size = 40, style }: {
  icon: IconName; onPress: () => void; label: string; on?: boolean; danger?: boolean; color?: string; size?: number; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.accent : t.card, borderWidth: StyleSheet.hairlineWidth, borderColor: on ? t.accent : t.hair },
        shadow(t),
        pressed && ui.pressed,
        style,
      ]}
    >
      <Icon name={icon} size={18} color={color ?? (on ? t.on : danger ? t.danger : t.text)} />
    </Pressable>
  );
}

export function Chip({ label, on, onPress, left, right, disabled, big, count }: {
  label?: string; on?: boolean; onPress: () => void; left?: React.ReactNode; right?: React.ReactNode; disabled?: boolean; big?: boolean; count?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled: !!disabled }}
      style={({ pressed }) => [
        ui.chip,
        big && ui.chipBig,
        { backgroundColor: on ? t.tint : t.card, borderColor: on ? t.text2 + '55' : t.hair },
        disabled && { opacity: 0.35 },
        pressed && ui.pressed,
      ]}
    >
      {left}
      {label != null && <Text style={[{ color: t.text, fontSize: big ? 14 : 12.5, fontWeight: on ? '600' : '400' }]}>{label}</Text>}
      {count != null && <Text style={{ color: t.muted, fontSize: 12 }}>{count}</Text>}
      {right}
    </Pressable>
  );
}

export function PrimaryBtn({ label, icon, onPress, style, disabled }: { label: string; icon?: IconName; onPress: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [ui.pbtn, { backgroundColor: t.accent }, disabled && { opacity: 0.4 }, pressed && ui.pressed, style]}>
      {icon && <Icon name={icon} size={17} color={t.on} />}
      <Text style={[ui.pbtnText, { color: t.on }]}>{label}</Text>
    </Pressable>
  );
}

export function GhostBtn({ label, icon, onPress, style }: { label: string; icon?: IconName; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [ui.pbtn, { backgroundColor: t.card, borderWidth: 1, borderColor: t.hair }, pressed && ui.pressed, style]}>
      {icon && <Icon name={icon} size={17} color={t.text} />}
      <Text style={[ui.pbtnText, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<K extends string>({ options, value, onChange, dark }: {
  options: [K, string][]; value: K | null; onChange: (k: K) => void; dark?: boolean;
}) {
  const t = useTheme();
  const bg = dark ? '#28231F' : t.raised;
  const onBg = dark ? CREAM_ON : t.card;
  return (
    <View style={[ui.seg, { backgroundColor: bg }]}>
      {options.map(([k, n]) => {
        const on = value === k;
        return (
          <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[ui.segBtn, on && { backgroundColor: onBg }, on && !dark && ui.segShadow]}>
            <Text style={{ fontSize: 13, color: on ? (dark ? '#14110F' : t.text) : dark ? '#A8A196' : t.text2, fontWeight: on ? '600' : '400' }}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const CREAM_ON = '#F3E3C3';

// Horizontal slider using the responder system (no extra dependency). Value in [min, max].
export function Slider({ value, min = 0, max = 1, step = 0, onChange, color, track }: {
  value: number; min?: number; max?: number; step?: number; onChange: (v: number) => void; color: string; track: string;
}) {
  const [width, setWidth] = useState(0);
  const originX = useRef(0);
  const update = (pageX: number) => {
    if (width <= 0) return;
    let v = min + Math.min(1, Math.max(0, (pageX - originX.current) / width)) * (max - min);
    if (step) v = Math.round(v / step) * step;
    onChange(Number(v.toFixed(3)));
  };
  const x = ((value - min) / (max - min || 1)) * width;
  return (
    <View
      style={ui.slider}
      hitSlop={{ top: 12, bottom: 12 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        originX.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        update(e.nativeEvent.pageX);
      }}
      onResponderMove={(e) => update(e.nativeEvent.pageX)}
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
    >
      <View pointerEvents="none" style={[ui.sliderTrack, { backgroundColor: track }]} />
      <View pointerEvents="none" style={[ui.sliderTrack, ui.sliderFill, { width: x, backgroundColor: color }]} />
      <View pointerEvents="none" style={[ui.sliderThumb, { left: x - 12 }]} />
    </View>
  );
}

export function shadow(t: Theme): ViewStyle {
  return t.dark ? {} : { shadowColor: '#3C2814', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 };
}

// ── Toast ────────────────────────────────────────────────────────────────
const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 1900);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <View pointerEvents="none" style={[ui.toast, { bottom: insets.bottom + 92 }]}>
          <Icon name={I.check} size={15} color="#F6F4F0" />
          <Text style={ui.toastText}>{msg}</Text>
        </View>
      )}
    </ToastCtx.Provider>
  );
}

// ── Floating tab pill (Gallery · Camera · Settings) ─────────────────────
export function TabPill({ current }: { current: 'gallery' | 'settings' }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabs: ['gallery' | 'camera' | 'settings', IconName][] = [['gallery', I.gallery], ['camera', I.camera], ['settings', I.gear]];
  return (
    <View style={[ui.tabs, { bottom: insets.bottom + 10, backgroundColor: t.card, borderColor: t.hair }, shadow(t)]}>
      {tabs.map(([k, icon]) => {
        const on = k === current;
        return (
          <Pressable
            key={k}
            accessibilityLabel={k}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (on) return;
              if (k === 'camera') router.push('/camera');
              else router.replace(k === 'gallery' ? '/' : '/settings');
            }}
            style={({ pressed }) => [ui.tab, on && { backgroundColor: t.accent }, pressed && ui.pressed]}
          >
            <Icon name={icon} size={k === 'camera' ? 23 : 20} color={on ? t.on : t.text2} />
          </Pressable>
        );
      })}
    </View>
  );
}

export const ui = StyleSheet.create({
  pressed: { opacity: 0.6 },
  chip: { height: 28, paddingHorizontal: 11, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  chipBig: { height: 34, paddingHorizontal: 14, borderRadius: 17 },
  pbtn: { height: 48, borderRadius: 24, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pbtnText: { fontWeight: '600', fontSize: 15 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3, gap: 2 },
  segBtn: { flex: 1, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segShadow: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  slider: { flex: 1, height: 24, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 2 },
  sliderFill: { position: 'absolute', left: 0 },
  sliderThumb: { position: 'absolute', top: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  toast: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1C1917', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22 },
  toastText: { color: '#F6F4F0', fontSize: 13.5 },
  tabs: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', gap: 6, padding: 6, borderRadius: 30, borderWidth: StyleSheet.hairlineWidth },
  tab: { width: 58, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
