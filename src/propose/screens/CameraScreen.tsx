// ProPose camera. The frame takes the guide photo's shape (or a picked ratio in Free shoot), and
// shots are cropped to it. The guide photo fades over the live view; with Peek on, press and hold
// the Guide button to show it. Grid + markers, tap to focus with a brightness slider, pinch or
// lens buttons to zoom, flash, 3/10 s timer, flip, level, and a guide strip to switch poses.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput, type CameraRef } from 'react-native-vision-camera';
import { arNum, FREE_RATIOS, newShot, ratioLabel } from '../model';
import { poseUri, shotDir, shotUri, useStore } from '../store';
import { CREAM, SERIF, YELLOW } from '../theme';
import { I, Icon, Slider, type IconName } from '../ui';
import { Grid3, MarkerLayer, hitMarker } from '../markers';
import { cropToFrame, saveToAlbum } from '../capture';
import { File } from 'expo-file-system';
import LevelTool from '../../../LevelTool';

const FOCUS = 64;
const BRIGHT_H = 120;
const EV_RANGE = 2; // brightness slider spans ±2 EV (clamped to the device)
const EV_DRAG_PX = 220;
const DRAG_THRESHOLD = 8;
const TOP_H = 52;
const BOTTOM_H = 132;

// Ratios read as you see the frame: held sideways, the 3:4 frame is 4:3 to you (and so is the photo)
const flipRatio = (r: string) => r.split(':').reverse().join(':');
// 0.7 → ".7×", 1.6 → "1.6×", 3 → "3×"
const zoomLabel = (z: number) => {
  const t = (Math.round(z * 10) / 10).toString();
  return `${t.startsWith('0.') ? t.slice(1) : t}×`;
};

export default function CameraScreen() {
  const params = useLocalSearchParams<{ guide?: string }>();
  const { data, update, tpl } = useStore();
  const fine = data.settings.fine;
  const big = fine.big;
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const focused = useIsFocused();
  const { hasPermission, requestPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput();
  // The combined multi-lens back camera (ultra-wide + wide + telephoto where the phone has them),
  // so pinching switches lenses like the built-in Camera app. Plain 'back' is only the main lens.
  const backCam = useCameraDevice('back', { physicalDevices: ['ultra-wide-angle', 'wide-angle', 'telephoto'] });
  const camera = useRef<CameraRef>(null);

  const [guideId, setGuideId] = useState<string | null>(
    params.guide === 'free' ? null : (params.guide ?? data.poses[0]?.id ?? null),
  );
  const pose = guideId ? data.poses.find((p) => p.id === guideId) : undefined;
  const free = !pose;
  const [ratio, setRatio] = useState('3:4');
  const [guideOn, setGuideOn] = useState(true);
  const [peek, setPeek] = useState(false);
  const [holding, setHolding] = useState(false);
  const [op, setOp] = useState(data.settings.defOp);
  const [showOv, setShowOv] = useState(data.settings.showOverlay);
  const [flash, setFlash] = useState(false);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [front, setFront] = useState(false);
  const [levelOn, setLevelOn] = useState(false);
  const [sheet, setSheet] = useState<'guide' | 'strip' | null>(null);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const [exposure, setExposure] = useState(0);
  const [evRange, setEvRange] = useState({ min: -EV_RANGE, max: EV_RANGE });
  const [zoom, setZoomState] = useState(1);
  // Camera zoom values are raw (on a multi-lens iPhone, raw 1 is the ultra-wide and the main lens is
  // at the first switch point, e.g. 2). zoomK turns them into the Camera app's numbers, where the main
  // lens is 1× (.5×, 1×, 5×). Lens switch points are kept in those display units; iOS reports them,
  // Android (in this camera library) doesn't yet, and there raw zoom already matches the Camera app.
  const [zoomK, setZoomK] = useState(1);
  const lensSwitches = useRef<number[]>([]);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bigMarker, setBigMarker] = useState<number | null>(null);

  // ── The screen stays portrait; when the phone turns sideways the controls turn to stay upright,
  //    dipping out and back in as they go. The camera reports how far to turn them (0 / ±90 / 180). ──
  const [rot] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const rotDeg = useRef(0);
  // Wide controls (guide name, ratio pills, zoom, notices) can't spin in place without hitting
  // their neighbours, so they fade out, jump to your top/bottom edge of the frame, and fade back in
  const [turn, setTurn] = useState(0);
  const uiRot = useRef(0); // the camera's latest reading, without waiting for the fade
  const onUIRotation = (deg: number) => {
    uiRot.current = deg;
    // Take the short way round (e.g. 90 → -90 goes through 0, not a full spin)
    let to = deg;
    while (to - rotDeg.current > 180) to -= 360;
    while (to - rotDeg.current < -180) to += 360;
    if (to === rotDeg.current) return;
    rotDeg.current = to;
    const ease = Easing.inOut(Easing.cubic);
    Animated.timing(rot, { toValue: to, duration: 320, easing: ease, useNativeDriver: true }).start();
    Animated.timing(fade, { toValue: 0.15, duration: 140, easing: ease, useNativeDriver: true }).start(() => {
      setTurn((((to % 360) + 540) % 360) - 180); // −180…180
      Animated.timing(fade, { toValue: 1, duration: 180, easing: ease, useNativeDriver: true }).start();
    });
  };
  const sideways = turn === 90 || turn === -90;
  const spin = {
    opacity: fade,
    transform: [{ rotate: rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) }],
  };

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };
  const focusHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdown = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      if (focusHide.current) clearTimeout(focusHide.current);
      if (countdown.current) clearInterval(countdown.current);
    },
    [],
  );

  // ── Frame: the guide's shape, as large as fits between the top and bottom bars. A landscape
  //    guide is shown turned on its side so it fills the tall frame: you hold the phone sideways
  //    to shoot it, and the shot comes out landscape. `ar` is the frame's shape on the screen. ──
  const guideAr = free ? arNum(ratio) : arNum(pose.ratio);
  const landGuide = !free && guideAr > 1.01;
  const ar = landGuide ? 1 / guideAr : guideAr;
  const availH = H - insets.top - TOP_H - BOTTOM_H - insets.bottom;
  const fw = Math.min(W, availH * ar);
  const fh = fw / ar;
  // How far the sideways guide is turned: with you when the phone is sideways, a quarter turn
  // when it's upright (so it already reads correctly once you turn the phone that way)
  const gTurn = sideways ? turn : 90;
  // Frame point → point on the turned guide (for markers you press and hold)
  const toGuide = (x: number, y: number) => {
    if (!landGuide) return { gx: x, gy: y, gw: fw, gh: fh };
    const r = (-gTurn * Math.PI) / 180;
    const dx = x - fw / 2;
    const dy = y - fh / 2;
    return { gx: fh / 2 + dx * Math.cos(r) - dy * Math.sin(r), gy: fw / 2 + dx * Math.sin(r) + dy * Math.cos(r), gw: fh, gh: fw };
  };

  const lastShot = data.shots[data.shots.length - 1];
  const say = (m: string, ms = 2200) => {
    setNotice(m);
    later(() => setNotice(null), ms);
  };

  const onStarted = () => {
    const c = camera.current?.controller;
    if (!c) return;
    const d = c.device;
    const switches = d.zoomLensSwitchFactors;
    const hasUltraWide = d.physicalDevices.some((p) => p.type === 'ultra-wide-angle');
    const mainLens = hasUltraWide && switches.length ? switches[0] : 1; // raw zoom of the 1× lens
    const k = 1 / mainLens;
    setZoomK(k);
    lensSwitches.current = switches.map((f) => f * k);
    // Open on the main lens (1×), not the ultra-wide
    const start = Math.min(c.maxZoom, Math.max(c.minZoom, mainLens));
    setZoomState(start);
    if (Math.abs(c.zoom - start) > 0.01) c.setZoom(start).catch(() => {});
    setEvRange({ min: Math.max(d.minExposureBias, -EV_RANGE), max: Math.min(d.maxExposureBias, EV_RANGE) });
  };

  const setZoom = (z: number) => {
    const c = camera.current?.controller;
    if (!c) return;
    const next = Math.min(c.maxZoom, Math.max(c.minZoom, z));
    // A light tick each time a pinch crosses onto another lens, like the built-in Camera app
    const from = zoom * zoomK;
    const to = next * zoomK;
    if (lensSwitches.current.some((s) => from < s !== to < s)) Haptics.selectionAsync().catch(() => {});
    setZoomState(next);
    c.setZoom(next).catch(() => {});
  };

  const showFocusFor3s = () => {
    if (focusHide.current) clearTimeout(focusHide.current);
    focusHide.current = setTimeout(() => setFocus(null), 3000);
  };
  const onTap = (x: number, y: number) => {
    setSheet(null);
    setFocus({ x, y });
    setExposure(0);
    showFocusFor3s();
    camera.current?.focusTo({ x, y }, { modes: ['AF', 'AE'] }).catch(() => {});
  };

  // Gesture state for the frame
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const didPinch = useRef(false);
  const ev = useRef<{ y: number; e: number; active: boolean } | null>(null);
  const holdingMarker = useRef(false);

  const shutter = () => {
    if (count || busy) return;
    setSheet(null);
    if (!timer) return void fire();
    let n: number = timer;
    setCount(n);
    countdown.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        if (countdown.current) clearInterval(countdown.current);
        setCount(0);
        fire();
      } else {
        setCount(n);
        Haptics.selectionAsync().catch(() => {});
      }
    }, 1000);
  };

  const fire = async () => {
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFlashing(true);
    later(() => setFlashing(false), 300);
    try {
      const hasFlash = camera.current?.controller?.device.hasFlash ?? false;
      const photo = await photoOutput.capturePhotoToFile({ flashMode: flash && hasFlash ? 'on' : 'off' }, {});
      // Crop to the frame (turned, if the photo shows the phone was sideways). The photo's own
      // orientation tag isn't used: on iPhone it's relative to the landscape sensor.
      const { file, ar: shotAr, sideways } = await cropToFrame(photo.filePath, ar, data.settings.quality);
      // How it sat on the portrait screen, for showing it the same way in Shots: the turn the
      // controls had (±90) when sideways, else upright
      const held = uiRot.current === 90 || uiRot.current === -90 ? uiRot.current : 90;
      const shot = newShot(file, pose?.id ?? null, shotAr, sideways ? held : 0);
      update((d) => ({ ...d, shots: [...d.shots, shot] }));
      const err = data.settings.saveToAlbum ? await saveToAlbum(new File(shotDir(), file).uri) : null;
      say(err ?? (data.settings.saveToAlbum ? 'Saved to ProPose' : 'Saved'), err ? 3500 : 2200);
    } catch (e: any) {
      say(`Couldn't take the photo: ${e?.message ?? e}`, 3500);
    } finally {
      setBusy(false);
    }
  };

  const toggleFlash = () => {
    const d = camera.current?.controller?.device;
    if (!flash && d && !d.hasFlash) return say(`The ${front ? 'front' : 'back'} camera has no flash`);
    setFlash(!flash);
  };
  const flip = () => {
    setFront((f) => !f);
    setFocus(null);
    setFlash(false);
  };
  const pick = (id: string | null) => {
    setGuideId(id);
    setGuideOn(true);
  };
  const back = () => (router.canDismiss() ? router.dismissTo('/') : router.replace('/'));

  if (!hasPermission) {
    return (
      <View style={[styles.screen, styles.center, { paddingHorizontal: 32 }]}>
        <StatusBar style="light" />
        <Icon name={I.camera} size={44} color={CREAM} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>ProPose needs the camera to shoot with your pose guides.</Text>
        <Pressable onPress={requestPermission} style={({ pressed }) => [styles.permBtn, pressed && styles.pressed]}>
          <Text style={styles.permBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={back} style={{ marginTop: 14 }}><Text style={{ color: '#A8A196' }}>Back to poses</Text></Pressable>
      </View>
    );
  }

  const guideVisible = !!pose && guideOn && (!peek || holding);

  const glabel = !pose ? 'No guide' : !guideOn ? 'Guide off' : peek ? (holding ? 'Peeking' : 'Hold to peek') : `Photo ${op}%`;
  const peekArmed = !!pose && guideOn && peek;
  // Guide name / Free shoot: in the top bar when upright, along your top edge of the frame when
  // sideways. Over the live image it gets a dark backing (like the ratio pills) so it stays readable.
  const guidePill = (
    <Pressable onPress={() => setSheet(sheet === 'strip' ? null : 'strip')} style={({ pressed }) => [styles.gname, sideways && styles.gnameOnFrame, pressed && styles.pressed]} accessibilityLabel="Choose a guide">
      <Text style={styles.gnameText} numberOfLines={1}>{pose ? pose.name : 'Free shoot'}</Text>
      <Icon name={I.down} size={14} color="#F3EEE6" />
    </Pressable>
  );
  const nextTimer = ({ 0: 3, 3: 10, 10: 0 } as const)[timer];
  const evSpan = evRange.max - evRange.min || 1;
  const evT = Math.min(1, Math.max(0, (exposure - evRange.min) / evSpan));

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      {/* ── Top bar ── */}
      <View style={[styles.ctop, { marginTop: insets.top }]}>
        <TopBtn icon={I.back} label="Back to poses" onPress={back} big={big} spin={spin} />
        {/* Takes the leftover width and lets the name shorten, so every button fits on narrow phones */}
        <Animated.View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start', opacity: fade }}>{!sideways && guidePill}</Animated.View>
        <TopBtn icon={flash ? I.bolt : I.boltOff} label="Flash" on={flash} onPress={toggleFlash} big={big} spin={spin} />
        <TopBtn icon={timer ? null : I.timer} text={timer ? `${timer}s` : undefined} label={timer ? `Timer ${timer} seconds` : 'Timer off'} on={timer > 0} onPress={() => setTimer(nextTimer)} big={big} spin={spin} />
        {!big && (
          <>
            <TopBtn icon={I.overlay} label="Grid and markers" on={showOv} onPress={() => setShowOv(!showOv)} spin={spin} />
            <TopBtn icon={I.level} label="Level" on={levelOn} onPress={() => setLevelOn(!levelOn)} spin={spin} />
          </>
        )}
      </View>

      {/* ── Frame ── */}
      <View style={styles.cmain}>
        <View style={{ width: fw, height: fh, overflow: 'hidden', backgroundColor: '#111' }}>
          <Camera
            ref={camera}
            style={StyleSheet.absoluteFill}
            isActive={focused}
            device={front ? 'front' : (backCam ?? 'back')}
            outputs={[photoOutput]}
            exposure={exposure}
            onStarted={onStarted}
            onUIRotationChanged={onUIRotation}
            onError={(e) => say(e.message, 3500)}
          />
          {landGuide && pose ? (
            // Landscape guide: photo + markers on one layer, turned to fill the tall frame
            <Animated.View
              pointerEvents="none"
              style={{ position: 'absolute', width: fh, height: fw, left: (fw - fh) / 2, top: (fh - fw) / 2, opacity: fade, transform: [{ rotate: `${gTurn}deg` }] }}
            >
              {guideVisible && <Image source={{ uri: poseUri(pose) }} style={[StyleSheet.absoluteFill, { opacity: op / 100 }]} contentFit="cover" />}
              {showOv && <MarkerLayer markers={pose.markers} w={fh} h={fw} fine={fine} tpl={tpl} big={bigMarker} />}
            </Animated.View>
          ) : (
            <>
              {pose && guideVisible && (
                <Image source={{ uri: poseUri(pose) }} style={[StyleSheet.absoluteFill, { opacity: op / 100 }]} contentFit="cover" />
              )}
              {showOv && pose && <MarkerLayer markers={pose.markers} w={fw} h={fh} fine={fine} tpl={tpl} big={bigMarker} />}
            </>
          )}
          {showOv && <Grid3 />}

          {/* Touch layer: tap = focus, slide up/down after a tap = brightness, pinch = zoom,
              hold a marker = enlarge its label (accessibility) */}
          <View
            style={StyleSheet.absoluteFill}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              const { locationX: x, locationY: y, pageY } = e.nativeEvent;
              pinch.current = null;
              didPinch.current = false;
              holdingMarker.current = false;
              if (fine.hold && showOv && pose) {
                const { gx, gy, gw, gh } = toGuide(x, y);
                const i = hitMarker(pose.markers, tpl, gx, gy, gw, gh);
                if (i != null) {
                  holdingMarker.current = true;
                  setBigMarker(i);
                  return;
                }
              }
              ev.current = { y: pageY, e: exposure, active: false };
            }}
            onResponderMove={(e) => {
              if (holdingMarker.current) return;
              const { touches, pageY } = e.nativeEvent;
              if (touches.length >= 2) {
                const c = camera.current?.controller;
                if (!c) return;
                const d = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
                if (!pinch.current) {
                  pinch.current = { d, z: c.zoom };
                  didPinch.current = true;
                  return;
                }
                setZoom((pinch.current.z * d) / pinch.current.d);
                return;
              }
              if (didPinch.current) {
                pinch.current = null;
                return;
              }
              const g = ev.current;
              if (!g || !focus) return;
              const dy = pageY - g.y;
              if (!g.active && Math.abs(dy) < DRAG_THRESHOLD) return;
              g.active = true;
              showFocusFor3s();
              setExposure(Math.min(evRange.max, Math.max(evRange.min, g.e - (dy / EV_DRAG_PX) * evSpan)));
            }}
            onResponderRelease={(e) => {
              if (holdingMarker.current) {
                holdingMarker.current = false;
                setBigMarker(null);
                return;
              }
              if (!didPinch.current && !ev.current?.active) onTap(e.nativeEvent.locationX, e.nativeEvent.locationY);
              ev.current = null;
              pinch.current = null;
            }}
            onResponderTerminate={() => {
              holdingMarker.current = false;
              setBigMarker(null);
              ev.current = null;
              pinch.current = null;
            }}
          />

          {focus && (
            <>
              <View pointerEvents="none" style={[styles.fsq, { left: focus.x - FOCUS / 2, top: focus.y - FOCUS / 2 }]} />
              <View pointerEvents="none" style={[styles.bright, { left: focus.x > fw * 0.75 ? focus.x - FOCUS / 2 - 34 : focus.x + FOCUS / 2 + 10, top: focus.y - BRIGHT_H / 2 }]}>
                <Icon name={I.sun} size={16} color={YELLOW} />
                <View style={styles.brightTrack}>
                  <View style={[styles.brightKnob, { top: `${(1 - evT) * 100}%` }]} />
                </View>
              </View>
            </>
          )}

          {/* Upright layer: the frame as you see it. Same as the frame when the phone is upright;
              turned with you (and sized to match) when it's sideways. */}
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              width: sideways ? fh : fw,
              height: sideways ? fw : fh,
              left: sideways ? (fw - fh) / 2 : 0,
              top: sideways ? (fh - fw) / 2 : 0,
              opacity: fade,
              transform: [{ rotate: `${turn}deg` }],
            }}
          >
            <View pointerEvents="box-none" style={styles.upTop}>
              {sideways && guidePill}
              {free && (
                <View style={styles.ratios}>
                  {FREE_RATIOS.map((r) => (
                    <Pressable key={r} onPress={() => setRatio(r)} style={[styles.ratioBtn, ratio === r && styles.ratioOn]}>
                      <Text style={[styles.ratioText, ratio === r && { color: '#14110F' }]}>{sideways ? flipRatio(r) : r}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {notice && (
                <View pointerEvents="none" style={styles.ctoast}>
                  <Icon name={I.check} size={14} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 12.5 }} numberOfLines={2}>{notice}</Text>
                </View>
              )}
            </View>

            {/* Current zoom (pinch to change; reaches ultra-wide on phones that have it) */}
            <View pointerEvents="none" style={styles.lens} accessibilityLabel={`Zoom ${zoomLabel(zoom * zoomK)}`}>
              <Text style={styles.lensText}>{zoomLabel(zoom * zoomK)}</Text>
            </View>
          </Animated.View>

          {count > 0 && (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
              <Animated.Text style={[styles.count, spin]}>{count}</Animated.Text>
            </View>
          )}
          {flashing && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: 0.85 }]} />}
        </View>
      </View>

      {/* ── Bottom bar: last shot + flip (selfie) · shutter · guide ── */}
      <View style={[styles.cbot, { paddingBottom: insets.bottom + 16 }]}>
        <View style={[styles.side, styles.sideRow]}>
          <Pressable
            onPress={() => (data.shots.length ? router.push('/shots') : say('No shots yet'))}
            style={styles.lshot}
            accessibilityLabel="Your shots"
          >
            {lastShot && (
              <Animated.View style={[StyleSheet.absoluteFill, spin]}>
                <Image source={{ uri: shotUri(lastShot) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </Animated.View>
            )}
          </Pressable>
          <Pressable
            onPress={flip}
            hitSlop={6}
            accessibilityLabel={front ? 'Switch to back camera' : 'Switch to selfie camera'}
            style={({ pressed }) => [styles.flipBtn, big && styles.flipBig, pressed && styles.pressed]}
          >
            <Animated.View style={spin}>
              <Icon name={I.flip} size={big ? 22 : 19} color="#F3EEE6" />
            </Animated.View>
          </Pressable>
        </View>

        <Pressable onPress={shutter} accessibilityLabel="Take photo" style={[styles.shut, big && styles.shutBig]}>
          {({ pressed }) => <View style={[styles.shutIn, (pressed || busy) && { transform: [{ scale: 0.9 }] }]} />}
        </Pressable>

        <Animated.View style={[styles.side, spin]}>
          <Pressable
            disabled={!pose}
            accessibilityLabel={peekArmed ? 'Hold to show the guide' : 'Guide on or off'}
            onPress={() => { if (!peek || !guideOn) setGuideOn(!guideOn); }}
            onPressIn={() => {
              if (!peekArmed) return;
              setHolding(true);
              Haptics.selectionAsync().catch(() => {});
            }}
            onPressOut={() => setHolding(false)}
            hitSlop={8}
            style={[
              styles.gcirc,
              pose && guideOn && (peek ? (holding ? styles.gcircHold : styles.gcircPeek) : styles.gcircOn),
              !pose && { opacity: 0.4 },
            ]}
          >
            <Icon
              name={peekArmed ? I.eye : I.layers}
              size={22}
              color={pose && guideOn && (!peek || holding) ? '#14110F' : '#F3EEE6'}
            />
          </Pressable>
          <Pressable onPress={() => pose && setSheet(sheet === 'guide' ? null : 'guide')} style={[styles.glab, holding && styles.glabHold]} hitSlop={6}>
            <Text style={[styles.glabText, holding && { color: '#14110F' }]} numberOfLines={1}>{glabel}</Text>
            {pose && <Icon name={I.up} size={10} color={holding ? '#14110F' : '#F3EEE6'} />}
          </Pressable>
        </Animated.View>
      </View>

      {/* ── Sheets ── */}
      {sheet && <Pressable style={StyleSheet.absoluteFill} onPress={() => setSheet(null)} accessibilityLabel="Close" />}
      {sheet === 'guide' && pose && (
        <View style={[styles.sheet, { bottom: insets.bottom + 8 }]}>
          <Pressable onPress={() => setSheet(null)} style={styles.grab} accessibilityLabel="Close" />
          <Text style={styles.sheetTitle}>Photo guide</Text>
          <View style={styles.gsRow}>
            <Slider value={op} min={10} max={100} step={1} onChange={(v) => { setOp(v); setGuideOn(true); }} color={CREAM} track="#4a423a" />
            <Text style={styles.gsPct}>{op}%</Text>
            <Pressable onPress={() => { setPeek(!peek); setGuideOn(true); }} style={[styles.pp, peek && styles.ppOn]} accessibilityRole="switch" accessibilityState={{ checked: peek }}>
              <Icon name={I.eye} size={15} color={peek ? '#14110F' : '#A8A196'} />
              <Text style={[styles.ppText, peek && { color: '#14110F' }]}>Peek</Text>
            </Pressable>
          </View>
          <Text style={styles.sheetNote} numberOfLines={2}>
            {peek ? 'Peek is on: the guide stays hidden. Press and hold the Guide button to see it.' : 'Above about 40% the photo reads as a muddy double exposure.'}
          </Text>
        </View>
      )}
      {sheet === 'strip' && (
        <View style={[styles.sheet, { bottom: insets.bottom + 8 }]}>
          <View style={styles.grab} />
          <View style={styles.shH}>
            <Text style={styles.sheetTitle}>Choose a guide</Text>
            {pose && (
              <Pressable onPress={() => { setSheet(null); router.push({ pathname: '/pose/[id]', params: { id: pose.id } }); }}>
                <Text style={{ color: CREAM, fontSize: 14 }}>Edit</Text>
              </Pressable>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 6, paddingHorizontal: 2 }}>
            <StripCard label="Free shoot" on={free} tilt={-3} onPress={() => pick(null)}>
              <Icon name={I.camera} size={22} color="#A8A196" />
            </StripCard>
            {data.poses.map((q, i) => (
              <StripCard key={q.id} label={q.name} on={q.id === pose?.id} tilt={i % 2 ? -3 : 3} onPress={() => pick(q.id)}>
                <Image source={{ uri: poseUri(q) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </StripCard>
            ))}
          </ScrollView>
          <Text style={styles.sheetNote}>
            {pose ? `${pose.name} · ${ratioLabel(pose.ratio)} · ${pose.markers.length} marker${pose.markers.length === 1 ? '' : 's'}` : 'Free shoot: grid and a frame ratio, no guide'}
          </Text>
        </View>
      )}

      <LevelTool on={levelOn} front={front} width={W} height={H} top={insets.top + TOP_H + 8} />
    </View>
  );
}

type Spin = React.ComponentProps<typeof Animated.View>['style'];

function TopBtn({ icon, text, label, on, onPress, big, spin }: { icon: IconName | null; text?: string; label: string; on?: boolean; onPress: () => void; big?: boolean; spin?: Spin }) {
  const s = big ? 44 : 34;
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityLabel={label} accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [{ width: s, height: s, borderRadius: s / 2, alignItems: 'center', justifyContent: 'center' }, on && { backgroundColor: CREAM }, pressed && styles.pressed]}>
      <Animated.View style={spin}>
        {icon ? <Icon name={icon} size={big ? 22 : 18} color={on ? '#14110F' : '#F3EEE6'} /> : <Text style={{ fontSize: 12, fontWeight: '700', color: on ? '#14110F' : '#F3EEE6' }}>{text}</Text>}
      </Animated.View>
    </Pressable>
  );
}

function StripCard({ label, on, tilt, onPress, children }: { label: string; on: boolean; tilt: number; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={styles.scard} accessibilityLabel={label} accessibilityState={{ selected: on }}>
      <View style={[styles.scardTh, { transform: on ? [{ translateY: -3 }] : [{ rotate: `${tilt}deg` }] }, on && { borderColor: CREAM }]}>{children}</View>
      <Text style={[styles.scardText, on && { color: '#F3EEE6' }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0908' },
  center: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  permTitle: { color: '#F3EEE6', fontSize: 22, fontFamily: SERIF, marginTop: 12 },
  permBody: { color: '#A8A196', fontSize: 15, textAlign: 'center', marginTop: 6 },
  permBtn: { marginTop: 18, backgroundColor: CREAM, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  permBtnText: { color: '#14110F', fontWeight: '700', fontSize: 15 },
  ctop: { height: TOP_H, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  gname: { height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', paddingLeft: 13, paddingRight: 10, flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: 130 },
  gnameOnFrame: { backgroundColor: 'rgba(0,0,0,0.45)' },
  gnameText: { color: '#F3EEE6', fontSize: 13.5, fontWeight: '500', flexShrink: 1 },
  cmain: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fsq: { position: 'absolute', width: FOCUS, height: FOCUS, borderWidth: 1.5, borderColor: YELLOW },
  bright: { position: 'absolute', width: 24, height: BRIGHT_H, alignItems: 'center', gap: 4 },
  brightTrack: { flex: 1, width: 2, backgroundColor: 'rgba(255,214,10,0.5)' },
  brightKnob: { position: 'absolute', left: -6, width: 14, height: 14, marginTop: -7, borderRadius: 7, backgroundColor: YELLOW },
  upTop: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center', gap: 6 },
  ratios: { flexDirection: 'row', gap: 2, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, padding: 3 },
  ratioBtn: { height: 26, paddingHorizontal: 9, borderRadius: 13, justifyContent: 'center' },
  ratioOn: { backgroundColor: CREAM },
  ratioText: { color: '#fff', fontSize: 11.5, fontWeight: '600' },
  lens: { position: 'absolute', bottom: 10, alignSelf: 'center', minWidth: 44, height: 28, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  lensText: { color: YELLOW, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  count: { fontFamily: SERIF, fontSize: 150, color: '#fff', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 30, textShadowOffset: { width: 0, height: 4 } },
  ctoast: { maxWidth: '90%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(20,17,15,0.8)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
  cbot: { minHeight: BOTTOM_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 18 },
  lshot: { width: 50, height: 50, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#F3EEE6', backgroundColor: '#28231F' },
  shut: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: CREAM, padding: 4 },
  shutBig: { width: 92, height: 92, borderRadius: 46 },
  shutIn: { flex: 1, borderRadius: 999, backgroundColor: CREAM },
  // Equal-width sides keep the shutter centred whatever the guide label says
  // (104 each still fits 360-wide phones with the big shutter).
  side: { width: 104, alignItems: 'center' },
  sideRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  flipBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  flipBig: { width: 44, height: 44, borderRadius: 22 },
  gcirc: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1.5, borderColor: 'transparent' },
  gcircOn: { backgroundColor: CREAM },
  gcircPeek: { borderColor: CREAM, borderStyle: 'dashed' },
  gcircHold: { backgroundColor: CREAM, borderColor: CREAM, transform: [{ scale: 1.1 }], shadowColor: CREAM, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  glab: { marginTop: 8, height: 22, minWidth: 84, paddingHorizontal: 8, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.1)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  glabHold: { backgroundColor: CREAM },
  glabText: { color: '#F3EEE6', fontSize: 11, fontWeight: '500' },
  sheet: { position: 'absolute', left: 8, right: 8, backgroundColor: '#1E1A17', borderRadius: 30, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 22, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20 },
  grab: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#4a423a', alignSelf: 'center', marginBottom: 10 },
  sheetTitle: { color: '#F3EEE6', fontWeight: '600', fontSize: 15 },
  shH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  // Fixed two-line height so toggling Peek (which swaps this text) never resizes the sheet.
  sheetNote: { color: '#7E776C', fontSize: 11.5, lineHeight: 16, height: 32, marginTop: 10 },
  gsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  gsPct: { color: '#F3EEE6', width: 40, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] },
  pp: { height: 32, borderRadius: 16, paddingHorizontal: 12, backgroundColor: '#28231F', flexDirection: 'row', alignItems: 'center', gap: 5 },
  ppOn: { backgroundColor: CREAM },
  ppText: { color: '#A8A196', fontSize: 13, fontWeight: '600' },
  scard: { width: 66, alignItems: 'center', gap: 6 },
  scardTh: { width: 62, height: 82, borderRadius: 14, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', backgroundColor: '#28231F', alignItems: 'center', justifyContent: 'center' },
  scardText: { color: '#A8A196', fontSize: 10.5, textAlign: 'center' },
});
