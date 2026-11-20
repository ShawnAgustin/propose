// VisionCameraTest.tsx — smoke test for VisionCamera v5 on Expo SDK 58 (dev build only, not Expo Go)
// Checks: permission, preview, tap-to-focus, exposure bias, zoom, flip, photo capture.
import React, { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  Pressable,
  Image,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  TextInput,
  Keyboard,
} from 'react-native';
import {
  Camera,
  useCameraPermission,
  usePhotoOutput,
  type CameraRef,
} from 'react-native-vision-camera';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LevelTool from './LevelTool';

type Info = Record<string, string | number | boolean>;
type Segment = { x1: number; y1: number; x2: number; y2: number };
type Marker = Segment & { id: number; label?: string };

export default function VisionCameraTest() {
  const camera = useRef<CameraRef>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const photoOutput = usePhotoOutput();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [position, setPosition] = useState<'back' | 'front'>('back');
  const [exposure, setExposure] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1); // display only; the controller owns the real zoom
  const [torch, setTorch] = useState(false);
  const [info, setInfo] = useState<Info>({});
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const [sliderEV, setSliderEV] = useState({ min: -2, max: 2 }); // captured on each focus tap
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // Photo overlay drawn on top of the preview (e.g. to line up a reference shot)
  const [overlayUri, setOverlayUri] = useState<string | null>(null);
  const [overlayOn, setOverlayOn] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  // Line markers: draw mode turns one-finger drags into lines, each optionally labeled
  const [drawMode, setDrawMode] = useState(false);
  const [lines, setLines] = useState<Marker[]>([]);
  const [draft, setDraft] = useState<Segment | null>(null); // line being dragged out
  const [editId, setEditId] = useState<number | null>(null); // line whose label is being typed inline
  const [labelText, setLabelText] = useState('');
  const drawStart = useRef<{ pageX: number; pageY: number; x: number; y: number } | null>(null);
  const swallowGesture = useRef(false); // a tap that only closes the label editor does nothing else
  // Endpoint drag: grabbing a line's end dot moves just that end
  const endDrag = useRef<{ id: number; end: 1 | 2; pageX: number; pageY: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState<{ id: number; end: 1 | 2 } | null>(null);
  // Body drag: grabbing a line away from its ends moves the whole line; a tap without moving edits its label
  const lineDrag = useRef<{ m: Marker; pageX: number; pageY: number; moved: boolean } | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [debugOn, setDebugOn] = useState(false); // capabilities + log panel
  const [levelOn, setLevelOn] = useState(false); // level tool (pitch/roll readout + centering guide)
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${msg}`, ...l].slice(0, 8));

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Read device capabilities once the session has started
  const onStarted = () => {
    const d = camera.current?.controller?.device;
    if (!d) return addLog('Started, but no controller/device yet');
    setInfo({
      supportsFocusMetering: d.supportsFocusMetering,
      supportsExposureMetering: d.supportsExposureMetering,
      supportsExposureBias: d.supportsExposureBias,
      minExposureBias: d.minExposureBias,
      maxExposureBias: d.maxExposureBias,
      minZoom: d.minZoom,
      maxZoom: d.maxZoom,
      hasFlash: d.hasFlash,
      hasTorch: d.hasTorch,
      supportsExposureLocking: d.supportsExposureLocking, // iOS pro mode; false on Android
    });
    setZoomLevel(camera.current?.controller?.zoom ?? 1);
    addLog(`Camera started (${position})`);
  };

  // Exposure range for the active camera (re-read each time so it survives a Flip).
  const evRange = () => {
    const d = camera.current?.controller?.device;
    return { min: d?.minExposureBias ?? -2, max: d?.maxExposureBias ?? 2 };
  };
  // The drag slider covers ±2 EV (clamped to what the device supports) so it stays usable;
  // some iPhones report ±8, which would make each pixel of drag far too coarse.
  const sliderRange = () => {
    const { min, max } = evRange();
    return { min: Math.max(min, -SLIDER_EV), max: Math.min(max, SLIDER_EV) };
  };

  const onTap = async (x: number, y: number) => {
    setFocus({ x, y });
    setSliderEV(sliderRange());
    setExposure(0); // new focus point starts from neutral exposure, like the system camera
    try {
      await camera.current?.focusTo({ x, y }, { modes: ['AF', 'AE'] });
      addLog(`focusTo OK at ${Math.round(x)},${Math.round(y)}`);
    } catch (e: any) {
      addLog(`focusTo FAILED: ${e?.message ?? e}`);
    }
  };

  const changeExposure = (delta: number) => {
    const { min, max } = evRange();
    const next = Math.min(max, Math.max(min, exposure + delta));
    setExposure(next);
    addLog(`exposure → ${next.toFixed(1)}`);
  };

  const changeZoom = async (factor: number) => {
    // Flipping creates a brand-new CameraController, so drive zoom imperatively on
    // whatever controller is current, starting from its live zoom value — no React
    // state that can go stale across a flip.
    const c = camera.current?.controller;
    if (!c) return addLog('zoom: camera not ready');
    const next = Math.min(c.maxZoom, Math.max(c.minZoom, c.zoom * factor));
    try {
      await c.setZoom(next);
      setZoomLevel(next);
      addLog(`zoom → ${next.toFixed(2)} (range ${c.minZoom.toFixed(2)}–${c.maxZoom.toFixed(2)})`);
    } catch (e: any) {
      addLog(`setZoom FAILED: ${e?.message ?? e}`);
    }
  };

  // Pinch: zoom scales with the distance between two fingers, relative to where the pinch started.
  const pinch = useRef<{ startDist: number; startZoom: number } | null>(null);
  const didPinch = useRef(false);
  const onPinchMove = (touches: readonly { pageX: number; pageY: number }[]) => {
    const c = camera.current?.controller;
    if (!c || touches.length < 2) {
      pinch.current = null; // re-base if a finger lifts and comes back
      return;
    }
    const dist = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
    if (!pinch.current) {
      pinch.current = { startDist: dist, startZoom: c.zoom };
      didPinch.current = true;
      return;
    }
    const next = Math.min(c.maxZoom, Math.max(c.minZoom, (pinch.current.startZoom * dist) / pinch.current.startDist));
    setZoomLevel(next);
    c.setZoom(next).catch((err: any) => addLog(`pinch setZoom FAILED: ${err?.message ?? err}`));
  };

  // Exposure drag: after a focus tap, a one-finger vertical slide anywhere adjusts EV
  // (up = brighter). Becomes a drag only once the finger moves past a small threshold,
  // so a plain tap still focuses.
  const evDrag = useRef<{ startY: number; startEV: number; active: boolean } | null>(null);
  const onExposureMove = (pageY: number) => {
    const d = evDrag.current;
    if (!d || !focus) return;
    const dy = pageY - d.startY;
    if (!d.active && Math.abs(dy) < DRAG_THRESHOLD) return;
    d.active = true;
    const { min, max } = sliderEV;
    const next = Math.min(max, Math.max(min, d.startEV - (dy / SLIDER_DRAG_PX) * (max - min)));
    setExposure(next);
  };

  // Tapping the zoom readout snaps back to 1× (or the nearest the camera allows)
  const resetZoom = async () => {
    const c = camera.current?.controller;
    if (!c) return;
    const next = Math.min(c.maxZoom, Math.max(c.minZoom, 1));
    try {
      await c.setZoom(next);
      setZoomLevel(next);
    } catch (e: any) {
      addLog(`setZoom FAILED: ${e?.message ?? e}`);
    }
  };

  const flip = () => {
    setPosition((p) => (p === 'back' ? 'front' : 'back'));
    setInfo({});
    setTorch(false);
    setFocus(null);
  };

  const toggleTorch = () => {
    const d = camera.current?.controller?.device;
    if (!d) return addLog('torch: camera not ready');
    if (!torch && !d.hasTorch) return addLog(`torch: ${position} camera has no torch`);
    setTorch(!torch);
    addLog(`torch → ${!torch ? 'on' : 'off'}`);
  };

  const pickOverlay = async () => {
    try {
      // Loaded lazily: expo-image-picker resolves its native module on import, so a
      // dev build made before it was added would otherwise crash this whole screen.
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 1 });
      if (result.canceled) return addLog('overlay: pick canceled');
      setOverlayUri(result.assets[0].uri);
      setOverlayOn(true);
      addLog('overlay: photo picked');
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      addLog(
        msg.includes('ExponentImagePicker')
          ? 'overlay: image picker not in this build — rebuild the dev client (npx expo run:ios|android)'
          : `overlay pick FAILED: ${msg}`,
      );
    }
  };

  // Corner toggle: with no photo yet, it opens the picker instead.
  const toggleOverlay = () => {
    if (!overlayUri) return pickOverlay();
    setOverlayOn((on) => !on);
  };

  // Inline label editing: the text field sits on the line itself; blank = no label.
  const commitLabel = () => {
    if (editId == null) return;
    const name = labelText.trim() || undefined;
    setLines((l) => l.map((m) => (m.id === editId ? { ...m, label: name } : m)));
    if (name) addLog(`line label "${name}"`);
    setEditId(null);
    Keyboard.dismiss();
  };

  // If the keyboard is dismissed any other way (Android back, iOS swipe-down), finish the
  // label too — otherwise the editor would stay open with no obvious way to close it.
  const commitRef = useRef(commitLabel);
  useEffect(() => {
    commitRef.current = commitLabel;
  });
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => commitRef.current());
    return () => sub.remove();
  }, []);

  const deleteLine = (id: number) => {
    setLines((l) => l.filter((m) => m.id !== id));
    setEditId(null);
    Keyboard.dismiss();
    addLog('line deleted');
  };

  // Returns the closest line endpoint within grab range of (x, y), topmost line first.
  const hitEndpoint = (x: number, y: number) => {
    let best: { m: Marker; end: 1 | 2; d: number } | undefined;
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i];
      for (const end of [1, 2] as const) {
        const d = Math.hypot(x - (end === 1 ? m.x1 : m.x2), y - (end === 1 ? m.y1 : m.y2));
        if (d <= END_HIT && (!best || d < best.d)) best = { m, end, d };
      }
    }
    return best;
  };

  // Returns the topmost line whose stroke or label is under (x, y), if any.
  const hitLine = (x: number, y: number): Marker | undefined => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i];
      if (distToSegment(x, y, m) <= LINE_HIT) return m;
      if (m.label) {
        // Hit-test the label in its own rotated frame
        const f = labelFrame(m);
        const rx = x - f.cx;
        const ry = y - f.cy;
        const along = rx * f.dirX + ry * f.dirY;
        const across = rx * f.nX + ry * f.nY;
        if (Math.abs(along) <= LABEL_HIT_W / 2 && Math.abs(across) <= LABEL_H / 2 + 4) return m;
      }
    }
    return undefined;
  };

  const openEdit = (m: Marker) => {
    setEditId(m.id);
    setLabelText(m.label ?? '');
  };

  const takePhoto = async () => {
    try {
      const { filePath } = await photoOutput.capturePhotoToFile({ flashMode: 'off' }, {});
      setPhotoUri(`file://${filePath}`);
      addLog('capturePhotoToFile OK');
    } catch (e: any) {
      addLog(`capture FAILED: ${e?.message ?? e}`);
    }
  };

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Icon name={{ ios: 'camera.fill', android: 'photo_camera' }} size={44} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>Allow camera access to use the viewfinder.</Text>
        <Pressable style={({ pressed }) => [styles.permBtn, pressed && styles.pressed]} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Allow camera</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        isActive={true}
        device={position}
        outputs={[photoOutput]}
        exposure={exposure}
        torchMode={torch ? 'on' : 'off'}
        onStarted={onStarted}
        onError={(e) => addLog(`onError: ${e.message}`)}
      />

      {/* Photo overlay (under the touch layer so focus/zoom/exposure gestures still work) */}
      {overlayUri && overlayOn && (
        <Image
          source={{ uri: overlayUri }}
          resizeMode="cover"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}
        />
      )}

      {/* Line markers (display only) */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {lines.map((m) => (
          <MarkerLine
            key={m.id}
            seg={m}
            label={m.id === editId ? undefined : m.label}
            selected={m.id === editId || m.id === movingId}
            activeEnd={dragging?.id === m.id ? dragging.end : undefined}
          />
        ))}
        {draft && <MarkerLine seg={draft} dashed />}
      </View>

      {/* Touch layer: tap → focus, vertical slide → exposure, two-finger pinch → zoom.
          In draw mode, a one-finger drag places a line instead of focus/exposure. */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          // While a label is being typed, a tap anywhere just finishes it.
          swallowGesture.current = editId != null;
          if (swallowGesture.current) return commitLabel();
          pinch.current = null;
          didPinch.current = false;
          const { pageX, pageY, locationX, locationY } = e.nativeEvent;
          // Grabbing an end dot (any mode) drags that endpoint and nothing else
          const end = hitEndpoint(locationX, locationY);
          if (end) {
            const { m } = end;
            endDrag.current = {
              id: m.id,
              end: end.end,
              pageX,
              pageY,
              x: end.end === 1 ? m.x1 : m.x2,
              y: end.end === 1 ? m.y1 : m.y2,
            };
            setDragging({ id: m.id, end: end.end });
            evDrag.current = null;
            drawStart.current = null;
            return;
          }
          endDrag.current = null;
          // Grabbing the line itself (or its label): drag to move it, tap to edit its label
          const onLine = hitLine(locationX, locationY);
          if (onLine) {
            lineDrag.current = { m: onLine, pageX, pageY, moved: false };
            evDrag.current = null;
            drawStart.current = null;
            return;
          }
          lineDrag.current = null;
          evDrag.current = drawMode ? null : { startY: pageY, startEV: exposure, active: false };
          // Track the drag as start position (layer coords) + page-coordinate delta, since
          // locationX/Y during a move can be relative to whatever view is under the finger.
          drawStart.current = drawMode ? { pageX, pageY, x: locationX, y: locationY } : null;
          setDraft(null);
        }}
        onResponderMove={(e) => {
          if (swallowGesture.current) return;
          const { touches, pageX, pageY } = e.nativeEvent;
          if (endDrag.current) {
            const d = endDrag.current;
            const nx = d.x + (pageX - d.pageX);
            const ny = d.y + (pageY - d.pageY);
            setLines((l) =>
              l.map((m) => (m.id !== d.id ? m : d.end === 1 ? { ...m, x1: nx, y1: ny } : { ...m, x2: nx, y2: ny })),
            );
            return;
          }
          if (lineDrag.current) {
            const d = lineDrag.current;
            const dx = pageX - d.pageX;
            const dy = pageY - d.pageY;
            if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            if (!d.moved) {
              d.moved = true;
              setMovingId(d.m.id);
            }
            const o = d.m; // translate from the line's position at grab time
            setLines((l) =>
              l.map((m) => (m.id !== o.id ? m : { ...m, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy })),
            );
            return;
          }
          if (touches.length >= 2) {
            if (evDrag.current) evDrag.current.active = false;
            if (drawStart.current) {
              drawStart.current = null; // second finger → this is a pinch, not a line
              setDraft(null);
            }
            onPinchMove(touches);
          } else if (didPinch.current) {
            onPinchMove(touches); // one finger left mid-pinch: re-base
          } else if (drawStart.current) {
            const s = drawStart.current;
            setDraft({ x1: s.x, y1: s.y, x2: s.x + (pageX - s.pageX), y2: s.y + (pageY - s.pageY) });
          } else {
            onExposureMove(pageY);
          }
        }}
        onResponderTerminate={() => {
          // The OS took the touch away (system gesture, alert…): drop any half-finished gesture
          // so no preview line or drag highlight is left stuck on screen.
          swallowGesture.current = false;
          endDrag.current = null;
          lineDrag.current = null;
          drawStart.current = null;
          evDrag.current = null;
          pinch.current = null;
          setDraft(null);
          setDragging(null);
          setMovingId(null);
        }}
        onResponderRelease={(e) => {
          if (swallowGesture.current) {
            swallowGesture.current = false;
            return;
          }
          if (endDrag.current) {
            endDrag.current = null;
            setDragging(null);
            return;
          }
          if (lineDrag.current) {
            const d = lineDrag.current;
            lineDrag.current = null;
            setMovingId(null);
            if (!d.moved) openEdit(d.m); // plain tap on a line → edit its label
            return;
          }
          if (didPinch.current) {
            const z = camera.current?.controller?.zoom;
            if (z != null) addLog(`pinch zoom → ${z.toFixed(2)}`);
          } else if (drawMode) {
            if (draft && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) >= MIN_LINE) {
              // Add the line and go straight into typing its label, right on the line
              const id = Date.now();
              setLines((l) => [...l, { ...draft, id }]);
              setEditId(id);
              setLabelText('');
              addLog('line added');
            }
            setDraft(null);
            drawStart.current = null;
          } else if (evDrag.current?.active) {
            addLog(`exposure slide → ${exposure.toFixed(2)}`);
          } else {
            onTap(e.nativeEvent.locationX, e.nativeEvent.locationY); // line taps were handled on grant
          }
          pinch.current = null;
          evDrag.current = null;
        }}
      />

      {/* Focus square + exposure slider beside it */}
      {focus && (
        <>
          <View pointerEvents="none" style={[styles.focusBox, { left: focus.x - FOCUS_HALF, top: focus.y - FOCUS_HALF }]} />
          <ExposureSlider
            x={focus.x + FOCUS_HALF + SLIDER_GAP > width - 30 ? focus.x - FOCUS_HALF - SLIDER_GAP : focus.x + FOCUS_HALF + SLIDER_GAP}
            centerY={focus.y}
            exposure={exposure}
            range={sliderEV}
          />
        </>
      )}

      {/* ── Top bar: debug toggle (left); the level card shows top centre when on ── */}
      <View pointerEvents="box-none" style={[styles.topBar, { top: insets.top + 6 }]}>
        <RoundButton
          size={36}
          iconSize={17}
          icon={{ ios: 'ladybug', android: 'bug_report' }}
          active={debugOn}
          onPress={() => setDebugOn((v) => !v)}
          label={debugOn ? 'Hide debug info' : 'Show debug info'}
        />
      </View>
      {debugOn && (
        <ScrollView style={[styles.panel, { top: insets.top + 50 }]} pointerEvents="none">
          {Object.entries(info).map(([k, v]) => (
            <Text key={k} style={styles.small}>{k}: {String(v)}</Text>
          ))}
          <Text style={[styles.small, { marginTop: 6 }]}>— log —</Text>
          {log.map((l, i) => <Text key={i} style={styles.small}>{l}</Text>)}
        </ScrollView>
      )}

      <LevelTool on={levelOn} front={position === 'front'} width={width} height={height} top={insets.top + 6} />

      {drawMode && editId == null && (
        <View pointerEvents="none" style={[styles.hint, { top: insets.top + (levelOn ? 64 : 10) }]}>
          <Icon name={{ ios: 'line.diagonal', android: 'draw' }} size={13} />
          <Text style={styles.hintText}>Drag to draw a line · tap a line to edit</Text>
        </View>
      )}

      {/* ── Bottom, anchored from the bottom up so rows that appear above never move the ones below:
            opacity slider (overlay on) › lines · zoom · exposure › tools › thumbnail · shutter · flip ── */}
      <View pointerEvents="box-none" style={[styles.bottom, { bottom: insets.bottom + BOTTOM_GAP }]}>
        {overlayUri && overlayOn && (
          <View style={styles.opacityRow}>
            <RoundButton
              size={32}
              iconSize={16}
              plain
              icon={{ ios: 'photo.on.rectangle', android: 'add_photo_alternate' }}
              onPress={pickOverlay}
              label="Change overlay photo"
            />
            <HSlider value={overlayOpacity} onChange={setOverlayOpacity} />
            <Text style={[styles.pillText, styles.opacityPct]}>{Math.round(overlayOpacity * 100)}%</Text>
          </View>
        )}

        <View style={styles.pillsRow}>
          <View style={styles.pillsSide}>
            {editId != null ? (
              <Pressable
                onPress={commitLabel}
                style={({ pressed }) => [styles.pill, styles.pillAccent, pressed && styles.pressed]}
                accessibilityLabel="Done editing label"
              >
                <Icon name={{ ios: 'checkmark', android: 'check' }} size={15} color="#000" />
                <Text style={[styles.pillText, { color: '#000' }]}>Done</Text>
              </Pressable>
            ) : lines.length > 0 ? (
              <View style={styles.pill}>
                <PillIcon icon={{ ios: 'arrow.uturn.backward', android: 'undo' }} label="Undo last line" onPress={() => setLines((l) => l.slice(0, -1))} />
                <View style={styles.pillDivider} />
                <PillIcon icon={{ ios: 'trash', android: 'delete' }} label="Clear all lines" onPress={() => { setLines([]); addLog('lines cleared'); }} />
              </View>
            ) : null}
          </View>
          <Stepper
            value={`${zoomLevel.toFixed(1)}×`}
            onMinus={() => changeZoom(1 / 1.5)}
            onPlus={() => changeZoom(1.5)}
            onValuePress={resetZoom}
            label="Zoom"
          />
          <View style={[styles.pillsSide, styles.pillsRight]}>
            <Stepper
              icon={{ ios: 'sun.max.fill', android: 'wb_sunny' }}
              value={`${exposure > 0 ? '+' : ''}${exposure.toFixed(1)}`}
              onMinus={() => changeExposure(-0.5)}
              onPlus={() => changeExposure(0.5)}
              onValuePress={() => setExposure(0)}
              label="Exposure"
              highlight={exposure !== 0}
            />
          </View>
        </View>

        <View style={styles.tools}>
          <Tool
            label="Torch"
            icon={torch ? { ios: 'flashlight.on.fill', android: 'flashlight_on' } : { ios: 'flashlight.off.fill', android: 'flashlight_off' }}
            active={torch}
            onPress={toggleTorch}
          />
          <Tool label="Level" icon={{ ios: 'level', android: 'straighten' }} active={levelOn} onPress={() => setLevelOn((v) => !v)} />
          <Tool
            label="Draw"
            icon={{ ios: 'line.diagonal', android: 'draw' }}
            active={drawMode}
            onPress={() => {
              setDrawMode(!drawMode);
              addLog(drawMode ? 'draw mode off' : 'draw mode on — drag to place a line');
            }}
          />
          {/* Rightmost and fixed, so it's always in the same spot; with no photo yet it opens the picker */}
          <Tool
            label={overlayUri ? 'Overlay' : 'Add overlay'}
            icon={overlayUri ? { ios: 'square.on.square', android: 'layers' } : { ios: 'plus.square.on.square', android: 'add_photo_alternate' }}
            active={overlayOn && !!overlayUri}
            onPress={toggleOverlay}
          />
        </View>

        <View style={styles.shutterRow}>
          <View style={styles.thumbSlot}>
            {photoUri ? <Image source={{ uri: photoUri }} style={styles.thumb} /> : <View style={styles.thumbEmpty} />}
          </View>
          <Pressable onPress={takePhoto} accessibilityLabel="Take photo" style={styles.shutter}>
            {({ pressed }) => <View style={[styles.shutterInner, pressed && styles.shutterPressed]} />}
          </Pressable>
          <RoundButton size={48} iconSize={22} icon={{ ios: 'arrow.triangle.2.circlepath', android: 'cameraswitch' }} onPress={flip} label="Flip camera" />
        </View>
      </View>

      {/* Inline label editor: a text field on the line, parallel to it, plus a ✕ to delete */}
      {(() => {
        const m = editId != null ? lines.find((l) => l.id === editId) : undefined;
        if (!m) return null;
        const f = labelFrame(m);
        return (
          <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
            <View style={[styles.labelBox, { left: f.cx - LABEL_W / 2, top: f.cy - LABEL_H / 2, transform: [{ rotate: `${f.angle}rad` }] }]}>
              <TextInput
                value={labelText}
                onChangeText={setLabelText}
                placeholder="Label (optional)"
                placeholderTextColor="rgba(255,255,255,0.6)"
                autoFocus
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={commitLabel}
                style={[styles.label, styles.labelInput]}
              />
            </View>
            {/* Fixed spot at middle right, so it's reachable wherever the line is */}
            <Pressable
              hitSlop={8}
              onPress={() => deleteLine(m.id)}
              style={({ pressed }) => [styles.pill, styles.deleteLineBtn, { top: height / 2 - 18 }, pressed && styles.pressed]}
              accessibilityLabel="Delete line"
            >
              <Icon name={{ ios: 'trash', android: 'delete' }} size={15} color={DANGER} />
              <Text style={[styles.pillText, { color: DANGER }]}>Delete</Text>
            </Pressable>
          </View>
        );
      })()}
    </View>
  );
}

const FOCUS_HALF = 35; // half of the 70px focus box
const SLIDER_GAP = 18; // distance from box edge to slider centerline
const SLIDER_HEIGHT = 140;
const SLIDER_EV = 2; // slider spans ±2 EV (clamped to device support)
const SLIDER_DRAG_PX = 220; // finger travel for the slider's full range
const DRAG_THRESHOLD = 8; // px before a touch counts as a slide instead of a tap
const SUN = 18;

// Vertical exposure track with a sun handle; handle sits higher for brighter exposure.
function ExposureSlider({ x, centerY, exposure, range }: {
  x: number; centerY: number; exposure: number; range: { min: number; max: number };
}) {
  const span = range.max - range.min || 1;
  const t = Math.min(1, Math.max(0, (exposure - range.min) / span)); // 0 = darkest (bottom), 1 = brightest (top)
  const top = centerY - SLIDER_HEIGHT / 2;
  const handleY = top + (1 - t) * SLIDER_HEIGHT;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Track, split around the sun like the system camera */}
      <View style={[styles.track, { left: x - 0.5, top, height: Math.max(0, handleY - SUN / 2 - 3 - top) }]} />
      <View style={[styles.track, { left: x - 0.5, top: handleY + SUN / 2 + 3, height: Math.max(0, top + SLIDER_HEIGHT - handleY - SUN / 2 - 3) }]} />
      <SunIcon cx={x} cy={handleY} />
    </View>
  );
}

function SunIcon({ cx, cy }: { cx: number; cy: number }) {
  return (
    <View style={{ position: 'absolute', left: cx - SUN / 2, top: cy - SUN / 2, width: SUN, height: SUN, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 45, 90, 135].map((deg) => (
        <View key={deg} style={[styles.sunRay, { transform: [{ rotate: `${deg}deg` }] }]} />
      ))}
      <View style={styles.sunCore} />
    </View>
  );
}

const MIN_LINE = 12; // px; shorter drags are treated as accidental and dropped
const LINE_COLOR = '#32D2FF';
const LINE_W = 3;
const DOT = 9;
const DOT_ACTIVE = 20; // end dot size while being dragged
const END_HIT = 26; // px from an end dot that grabs it (checked before line taps)
const LINE_HIT = 22; // px from the stroke that still counts as tapping the line
const LABEL_W = 220; // label box width (text is centered in it)
const LABEL_H = 26;
const LABEL_OFFSET = 17; // label center distance above the line
const LABEL_HIT_W = 140; // approx tappable width around a label's center

// Where a line's label goes: centered above the midpoint, rotated parallel to the line.
// The angle is folded into -90°…90° so text always reads left-to-right, never upside down;
// (nX, nY) is the unit normal pointing to the label's "up" side.
function labelFrame(s: Segment) {
  let angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  if (angle > Math.PI / 2) angle -= Math.PI;
  else if (angle < -Math.PI / 2) angle += Math.PI;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const nX = dirY;
  const nY = -dirX;
  const mx = (s.x1 + s.x2) / 2;
  const my = (s.y1 + s.y2) / 2;
  return { angle, dirX, dirY, nX, nY, mx, my, cx: mx + nX * LABEL_OFFSET, cy: my + nY * LABEL_OFFSET };
}

// Shortest distance from point (px, py) to the segment.
function distToSegment(px: number, py: number, s: Segment) {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / len2));
  return Math.hypot(px - (s.x1 + t * dx), py - (s.y1 + t * dy));
}

// A straight line between two points: one View sized to the segment length,
// centered on the midpoint and rotated to the segment's angle, plus end dots and an optional label.
function MarkerLine({ seg, label, dashed, selected, activeEnd }: {
  seg: Segment; label?: string; dashed?: boolean; selected?: boolean; activeEnd?: 1 | 2;
}) {
  const dot = (x: number, y: number, active: boolean) => {
    const size = active ? DOT_ACTIVE : DOT;
    return (
      <View
        style={[
          styles.dot,
          selected && styles.lineSelected,
          active && styles.dotActive,
          { left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2 },
        ]}
      />
    );
  };
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy);
  const mx = (seg.x1 + seg.x2) / 2;
  const my = (seg.y1 + seg.y2) / 2;
  return (
    <>
      <View
        style={[
          styles.line,
          dashed && styles.lineDraft,
          selected && styles.lineSelected,
          { left: mx - len / 2, top: my - LINE_W / 2, width: len, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] },
        ]}
      />
      {dot(seg.x1, seg.y1, activeEnd === 1)}
      {dot(seg.x2, seg.y2, activeEnd === 2)}
      {label ? <LineLabel seg={seg} text={label} /> : null}
    </>
  );
}

function LineLabel({ seg, text }: { seg: Segment; text: string }) {
  const f = labelFrame(seg);
  return (
    <View style={[styles.labelBox, { left: f.cx - LABEL_W / 2, top: f.cy - LABEL_H / 2, transform: [{ rotate: `${f.angle}rad` }] }]}>
      <Text style={styles.label} numberOfLines={1}>{text}</Text>
    </View>
  );
}

// Minimal horizontal 0–1 slider (no extra dependency). Tap or drag anywhere on the track.
function HSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const originX = useRef(0); // track's left edge in page coordinates, captured on touch start
  const update = (pageX: number) => {
    if (width > 0) onChange(Math.min(1, Math.max(0, (pageX - originX.current) / width)));
  };
  const x = value * width;
  return (
    <View
      style={styles.hslider}
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
    >
      <View pointerEvents="none" style={styles.hsliderTrack} />
      <View pointerEvents="none" style={[styles.hsliderFill, { width: x }]} />
      <View pointerEvents="none" style={[styles.hsliderThumb, { left: x - HTHUMB / 2 }]} />
    </View>
  );
}

const HTHUMB = 22;

const ACCENT = '#FFD60A';
const DANGER = '#FF6B61';
const GLASS = 'rgba(18,18,18,0.6)';
const BOTTOM_GAP = 12; // space above the home indicator / nav bar
const SHUTTER = 72;

type IconName = ComponentProps<typeof SymbolView>['name'];

// SF Symbol on iOS, Material Symbol on Android
function Icon({ name, size = 22, color = '#fff' }: { name: IconName; size?: number; color?: string }) {
  return <SymbolView name={name} size={size} tintColor={color} style={{ width: size, height: size }} />;
}

function RoundButton({ icon, onPress, label, size = 44, iconSize = 22, active, plain }: {
  icon: IconName; onPress: () => void; label: string; size?: number; iconSize?: number; active?: boolean; plain?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.round,
        { width: size, height: size, borderRadius: size / 2 },
        plain && styles.roundPlain,
        active && styles.roundActive,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={iconSize} color={active ? '#000' : '#fff'} />
    </Pressable>
  );
}

// Toggle in the tools bar: icon circle (yellow when on) with a caption
function Tool({ label, icon, active, onPress }: { label: string; icon: IconName; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
    >
      <View style={[styles.toolIcon, active && styles.roundActive]}>
        <Icon name={icon} size={20} color={active ? '#000' : '#fff'} />
      </View>
      <Text style={[styles.toolLabel, active && { color: ACCENT }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// − value + pill; tapping the value resets it
function Stepper({ value, onMinus, onPlus, onValuePress, label, icon, highlight }: {
  value: string; onMinus: () => void; onPlus: () => void; onValuePress: () => void; label: string; icon?: IconName; highlight?: boolean;
}) {
  return (
    <View style={styles.pill}>
      <PillIcon icon={{ ios: 'minus', android: 'remove' }} label={`${label} down`} onPress={onMinus} />
      <Pressable onPress={onValuePress} accessibilityLabel={`${label} ${value}, tap to reset`} style={styles.stepperValue}>
        {icon && <Icon name={icon} size={13} color={highlight ? ACCENT : '#fff'} />}
        <Text style={[styles.pillText, styles.tabular, highlight && { color: ACCENT }]}>{value}</Text>
      </Pressable>
      <PillIcon icon={{ ios: 'plus', android: 'add' }} label={`${label} up`} onPress={onPlus} />
    </View>
  );
}

function PillIcon({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} accessibilityLabel={label} style={({ pressed }) => [styles.pillIcon, pressed && styles.pressed]}>
      <Icon name={icon} size={16} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 10, padding: 32 },
  text: { color: '#fff', fontWeight: '600' },
  small: { color: '#fff', fontSize: 11 },
  line: { position: 'absolute', height: LINE_W, borderRadius: LINE_W / 2, backgroundColor: LINE_COLOR },
  lineDraft: { opacity: 0.6 },
  lineSelected: { backgroundColor: '#FFD60A' },
  dotActive: { backgroundColor: '#FFD60A', borderWidth: 2 },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: LINE_COLOR, borderWidth: 1.5, borderColor: '#fff' },
  labelBox: { position: 'absolute', width: LABEL_W, height: LABEL_H, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#fff', fontWeight: '700', fontSize: 13, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  labelInput: { minWidth: 110, maxWidth: LABEL_W, textAlign: 'center', borderWidth: 1, borderColor: '#FFD60A' },
  pressed: { opacity: 0.55 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 6 },
  permBody: { color: 'rgba(255,255,255,0.7)', fontSize: 15, textAlign: 'center' },
  permBtn: { marginTop: 10, backgroundColor: ACCENT, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24 },
  permBtnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  topBar: { position: 'absolute', left: 12 },
  panel: { position: 'absolute', left: 12, maxHeight: 260, maxWidth: 260, backgroundColor: GLASS, padding: 10, borderRadius: 12 },
  hint: { position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: GLASS, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  hintText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  bottom: { position: 'absolute', left: 12, right: 12, gap: 12 },
  round: { alignItems: 'center', justifyContent: 'center', backgroundColor: GLASS, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  roundPlain: { backgroundColor: 'transparent', borderWidth: 0 },
  roundActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  opacityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GLASS, borderRadius: 22, paddingLeft: 6, paddingRight: 14, paddingVertical: 4 },
  opacityPct: { width: 38, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pillsRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  pillsSide: { flex: 1, alignItems: 'flex-start' },
  pillsRight: { alignItems: 'flex-end' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 6, borderRadius: 18, backgroundColor: GLASS },
  pillAccent: { backgroundColor: ACCENT, paddingHorizontal: 14 },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pillIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pillDivider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: 'rgba(255,255,255,0.3)' },
  stepperValue: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 44, justifyContent: 'center' },
  tabular: { fontVariant: ['tabular-nums'] },
  tools: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: GLASS, borderRadius: 22, paddingVertical: 8 },
  tool: { alignItems: 'center', gap: 4, width: 72 },
  toolIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  toolLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600' },
  shutterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  thumbSlot: { width: 48, height: 48 },
  thumb: { width: 48, height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: '#fff' },
  thumbEmpty: { width: 48, height: 48, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(0,0,0,0.3)' },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: SHUTTER - 14, height: SHUTTER - 14, borderRadius: (SHUTTER - 14) / 2, backgroundColor: '#fff' },
  shutterPressed: { transform: [{ scale: 0.88 }], backgroundColor: 'rgba(255,255,255,0.75)' },
  deleteLineBtn: { position: 'absolute', right: 12, paddingHorizontal: 14 },
  hslider: { flex: 1, height: HTHUMB, justifyContent: 'center' },
  hsliderTrack: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  hsliderFill: { position: 'absolute', left: 0, height: 3, borderRadius: 2, backgroundColor: '#FFD60A' },
  hsliderThumb: { position: 'absolute', top: 0, width: HTHUMB, height: HTHUMB, borderRadius: HTHUMB / 2, backgroundColor: '#fff' },
  focusBox: { position: 'absolute', width: 70, height: 70, borderWidth: 1.5, borderColor: '#FFD60A', borderRadius: 4 },
  track: { position: 'absolute', width: 1, backgroundColor: '#FFD60A' },
  // Rays: a full-width bar with a gap in the middle (core covers it), rotated 4 ways = 8 rays
  sunRay: { position: 'absolute', width: SUN, height: 2, backgroundColor: '#FFD60A', borderRadius: 1 },
  sunCore: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFD60A', borderWidth: 2, borderColor: '#000' },
});
