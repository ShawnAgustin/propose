// LevelTool.tsx — camera level: when on, a pitch/roll readout card (top centre) and a
// centre-screen leveling guide. Holding the phone upright, a horizon line tilts against fixed ticks
// (roll) and slides up/down (pitch). Pointing at the floor or ceiling, it switches to a bubble level.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

type Reading = {
  pitch: number; // back-camera elevation, deg: 0 = horizon, + = up, − = down (smoothed)
  roll: number; // screen rotation, deg: + = turned clockwise (smoothed)
  tiltX: number; // left/right tilt for the bubble, deg
  tiltY: number; // top/bottom tilt for the bubble, deg
  shownPitch: number; // whole degrees with a deadband, for the numbers
  shownRoll: number;
};

const INTERVAL_MS = 50; // 20 Hz
const SMOOTHING = 0.12; // 0–1 low-pass on the gravity vector; lower = steadier, slower
const DEADBAND = 0.8; // deg the angle must move before a shown number changes
const LEVEL_TOL = 1; // deg counted as level (turns green)
const FLAT_ANGLE = 55; // |pitch| beyond this → bubble mode (roll is meaningless pointing down/up)
const PX_PER_DEG = 4; // horizon line vertical travel per degree of pitch
const MAX_OFFSET = 140;
const TICK_GAP = 34; // fixed ticks start this far from the centre
const TICK_W = 70;
// Moving line spans both ticks end to end, so when level it joins them into one continuous line
const HORIZON_W = 2 * (TICK_GAP + TICK_W);
const RING = 84; // bubble mode ring diameter
const BUBBLE = 22;
const BUBBLE_PX_PER_DEG = 3;

const GREEN = '#30D158';
const YELLOW = '#FFD60A';

const deg = (r: number) => (r * 180) / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const angDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180; // signed, wraps at ±180
const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}°`;

export default function LevelTool({ on, front, width, height, top }: {
  on: boolean;
  top: number; // y of the readout card (below the status bar)
  front: boolean; // front camera faces the other way, so pitch flips
  width: number;
  height: number;
}) {
  const [r, setR] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Subscribe only while shown, so the sensor is off when the tool is hidden
  useEffect(() => {
    if (!on) return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    let u: { x: number; y: number; z: number } | null = null; // smoothed unit gravity
    let shownPitch: number | null = null;
    let shownRoll: number | null = null;
    (async () => {
      try {
        // Lazy so a dev build without expo-sensors doesn't crash the screen
        const { DeviceMotion } = await import('expo-sensors');
        if (!(await DeviceMotion.isAvailableAsync())) return setError('no motion sensor');
        if (cancelled) return;
        DeviceMotion.setUpdateInterval(INTERVAL_MS);
        // accelerationIncludingGravity points toward the ground in device axes (iOS and Android):
        // x = right, y = up the screen, z = out of the screen.
        sub = DeviceMotion.addListener(({ accelerationIncludingGravity: g }) => {
          const mag = Math.hypot(g.x, g.y, g.z);
          if (!mag) return;
          const n = { x: g.x / mag, y: g.y / mag, z: g.z / mag };
          // Smoothing the vector (not the angles) avoids jumps where roll wraps at ±180°
          u = u == null ? n : {
            x: u.x + SMOOTHING * (n.x - u.x),
            y: u.y + SMOOTHING * (n.y - u.y),
            z: u.z + SMOOTHING * (n.z - u.z),
          };
          const m = Math.hypot(u.x, u.y, u.z) || 1;
          const pitch = deg(Math.asin(clamp(u.z / m, -1, 1)));
          const roll = deg(Math.atan2(u.x, -u.y));
          if (shownPitch == null || Math.abs(pitch - shownPitch) > DEADBAND) shownPitch = Math.round(pitch);
          if (shownRoll == null || Math.abs(angDiff(roll, shownRoll)) > DEADBAND) shownRoll = Math.round(roll);
          setR({
            pitch,
            roll,
            tiltX: deg(Math.asin(clamp(u.x / m, -1, 1))),
            tiltY: deg(Math.asin(clamp(u.y / m, -1, 1))),
            shownPitch,
            shownRoll: shownRoll === -180 ? 180 : shownRoll,
          });
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        setError(msg.includes('ExponentDeviceMotion') || msg.includes('native module') ? 'Rebuild dev client' : msg);
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
      setR(null);
    };
  }, [on]);

  const flat = r != null && Math.abs(r.pitch) > FLAT_ANGLE;
  const pitch = r ? (front ? -r.shownPitch : r.shownPitch) : 0;
  const pitchLevel = r != null && !flat && Math.abs(pitch) <= LEVEL_TOL;
  const rollLevel = r != null && !flat && Math.abs(r.shownRoll) <= LEVEL_TOL;
  const tilt = r ? Math.round(Math.hypot(r.tiltX, r.tiltY)) : 0;
  const flatLevel = flat && tilt <= LEVEL_TOL;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {on && r && <Guide r={r} flat={flat} front={front} cx={width / 2} cy={height / 2} rollLevel={rollLevel} pitchLevel={pitchLevel} flatLevel={flatLevel} />}

      {/* Readout card, top centre (the toggle lives in the screen's bottom controls) */}
      <View pointerEvents="none" style={[styles.top, { top }]}>
        {on && (
          <View pointerEvents="none" style={styles.card}>
            {!r ? (
              <Text style={styles.cardHint}>{error ?? 'Reading sensors…'}</Text>
            ) : flat ? (
              <Stat label={pitch < 0 ? 'Facing down' : 'Facing up'} value={`${tilt}° off`} level={flatLevel} />
            ) : (
              <>
                <Stat label="Pitch" value={fmt(pitch)} level={pitchLevel} />
                <View style={styles.divider} />
                <Stat label="Roll" value={fmt(r.shownRoll)} level={rollLevel} />
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function Stat({ label, value, level }: { label: string; value: string; level: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, level && { color: GREEN }]}>{value}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

// Centre-screen guide
function Guide({ r, flat, front, cx, cy, rollLevel, pitchLevel, flatLevel }: {
  r: Reading; flat: boolean; front: boolean; cx: number; cy: number;
  rollLevel: boolean; pitchLevel: boolean; flatLevel: boolean;
}) {
  if (flat) {
    // Bubble level: the bubble floats to the high side, like a real one; centre it in the ring
    const max = RING / 2 - BUBBLE / 2;
    let bx = -r.tiltX * BUBBLE_PX_PER_DEG;
    let by = r.tiltY * BUBBLE_PX_PER_DEG;
    const d = Math.hypot(bx, by);
    if (d > max) { bx = (bx / d) * max; by = (by / d) * max; }
    const c = flatLevel ? GREEN : '#fff';
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.ring, { left: cx - RING / 2, top: cy - RING / 2, borderColor: c }]} />
        <View style={[styles.cross, { left: cx - 8, top: cy - 0.5, width: 16, height: 1, backgroundColor: c }]} />
        <View style={[styles.cross, { left: cx - 0.5, top: cy - 8, width: 1, height: 16, backgroundColor: c }]} />
        <View
          style={[
            styles.bubble,
            { left: cx + bx - BUBBLE / 2, top: cy + by - BUBBLE / 2 },
            flatLevel && { backgroundColor: 'rgba(48,209,88,0.5)', borderColor: GREEN },
          ]}
        />
      </View>
    );
  }

  // Horizon mode: fixed ticks mark level; the moving line is the real horizon.
  // It counter-rotates against roll and slides with pitch (camera up → horizon drops).
  const pitch = front ? -r.pitch : r.pitch;
  const offset = clamp(pitch * PX_PER_DEG, -MAX_OFFSET, MAX_OFFSET);
  const level = rollLevel && pitchLevel;
  const fixed = rollLevel ? GREEN : 'rgba(255,255,255,0.85)';
  const moving = rollLevel ? GREEN : YELLOW;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.tick, { left: cx - TICK_GAP - TICK_W, top: cy - 1, backgroundColor: fixed }]} />
      <View style={[styles.tick, { left: cx + TICK_GAP, top: cy - 1, backgroundColor: fixed }]} />
      <View
        style={[
          styles.horizon,
          {
            left: cx - HORIZON_W / 2,
            top: cy + offset - 1,
            backgroundColor: moving,
            transform: [{ rotate: `${-r.roll}deg` }],
          },
        ]}
      />
      <View style={[styles.centerDot, { left: cx - 5, top: cy - 5 }, level && { backgroundColor: GREEN, borderColor: GREEN }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7,
  },
  cardHint: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  stat: { alignItems: 'center', minWidth: 52 },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 9, fontWeight: '600', letterSpacing: 0.8, marginTop: 1 },
  divider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 10 },
  tick: { position: 'absolute', width: TICK_W, height: 2, borderRadius: 1 },
  horizon: { position: 'absolute', width: HORIZON_W, height: 2, borderRadius: 1 },
  centerDot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff' },
  ring: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2 },
  cross: { position: 'absolute' },
  bubble: {
    position: 'absolute', width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
    backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 2, borderColor: '#fff',
  },
});
