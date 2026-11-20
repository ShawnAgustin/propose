// ProPose data model: marker templates, palettes, accessibility presets, tags and frame ratios.
// Mirrors the ProPose v0.4 design prototype.

export type MarkerKind = 'long' | 'short' | 'circle' | 'eye';
export type ColorKey = 'white' | 'yellow' | 'orange' | 'green' | 'blue' | 'pink';
export type PaletteKey = 'standard' | 'cb' | 'hc';
export type PresetKey = 'standard' | 'cb' | 'easy' | 'big';

export type Template = { id: string; name: string; kind: MarkerKind; color: ColorKey; angle?: number; custom?: boolean };
// x, y: 0–1 of the frame; a: degrees; l: line length as a share of the frame width (short and long
// lines only; unset = the default, 40 pt for a short line and the full width for a long one);
// k: copy number among markers of the same kind (1, 2, 3…; never reused while the pose has them);
// name: your own label for this copy (unset = the marker's name, numbered when there are copies)
export type PlacedMarker = { t: string; x: number; y: number; a: number; l?: number; k?: number; name?: string };
export type Pose = {
  id: string;
  name: string;
  file: string; // file name inside the app's pose folder (absolute paths change between installs)
  ratio: string; // "4:5", or "w:h" when it doesn't snap to a common shape
  fav: boolean;
  tags: string[];
  markers: PlacedMarker[];
  createdAt: number;
};
// ar: the saved photo's shape (width / height, upright). rot: how the photo sat on the portrait screen
// when it was taken (0, or ±90 when the phone was held sideways), so it can be shown the same way.
export type Shot = { id: string; file: string; guideId: string | null; ar: number; createdAt: number; rot?: number };
export type Fine = {
  w: number; // marker line thickness, px
  lbl: number; // label size, pt
  always: boolean; // always show labels
  dash: boolean; // dash patterns + shape badges, so colour is never the only cue
  outline: boolean; // black outline under markers
  big: boolean; // larger camera buttons, fewer options
  hold: boolean; // press and hold a marker on the camera to enlarge its label
  palette: PaletteKey;
};
export type Settings = {
  theme: 'light' | 'dark' | 'auto';
  preset: PresetKey | 'custom';
  fine: Fine;
  defOp: number; // default guide photo opacity, %
  showOverlay: boolean; // grid and markers start on in the camera
  editGrid: boolean; // grid in Edit guide
  saveToAlbum: boolean;
  quality: 'standard' | 'high';
};

export const PAL: Record<PaletteKey, Record<ColorKey, string>> = {
  standard: { white: '#FFFFFF', yellow: '#FFD60A', orange: '#FF9F0A', green: '#30D158', blue: '#64D2FF', pink: '#FF375F' },
  // Okabe-Ito
  cb: { white: '#D55E00', yellow: '#E69F00', orange: '#F0E442', green: '#009E73', blue: '#56B4E9', pink: '#CC79A7' },
  hc: { white: '#FFFFFF', yellow: '#FFD60A', orange: '#FFFFFF', green: '#FFD60A', blue: '#FFFFFF', pink: '#FFD60A' },
};
export type DashStyle = 'solid' | 'dashed' | 'dotted';
export const DASH: Record<ColorKey, DashStyle> = { white: 'solid', yellow: 'dashed', orange: 'dotted', green: 'dashed', blue: 'dashed', pink: 'solid' };
export const BADGE: Record<ColorKey, string> = { white: '●', yellow: '▲', orange: '■', green: '◆', blue: '★', pink: '✚' };
export const COLORS: ColorKey[] = ['white', 'yellow', 'orange', 'green', 'blue', 'pink'];
export const KINDS: Record<MarkerKind, string> = { long: 'Long line', short: 'Short line', circle: 'Circle', eye: 'Eye icon' };

export const DEF_TPL: Template[] = [
  { id: 'head', name: 'Top of head', kind: 'short', color: 'white' },
  { id: 'eyes', name: 'Eyes', kind: 'eye', color: 'white' },
  { id: 'waist', name: 'Waist', kind: 'short', color: 'white' },
  { id: 'feet', name: 'Feet', kind: 'short', color: 'white' },
  { id: 'table', name: 'Table edge', kind: 'long', color: 'white' },
  { id: 'horizon', name: 'Horizon', kind: 'long', color: 'white' },
  { id: 'sun', name: 'Sun', kind: 'circle', color: 'yellow' },
  { id: 'lean', name: 'Lean', kind: 'short', color: 'white', angle: 60 },
];
export const CUSTOM_TPL: Template[] = [{ id: 'hand', name: 'Hand', kind: 'circle', color: 'blue', custom: true }];
export const DEF_POS: Record<string, [number, number]> = {
  head: [0.5, 0.2], eyes: [0.5, 0.3], waist: [0.5, 0.6], feet: [0.5, 0.88],
  table: [0.5, 0.72], horizon: [0.5, 0.45], sun: [0.8, 0.14], lean: [0.5, 0.5],
};
export const MAX_MARKERS = 16; // the same marker can be placed more than once

export const TAGS: Record<string, string[]> = {
  People: ['solo', 'duo', 'couple', 'group'],
  Pose: ['standing', 'sitting', 'squat', 'lean', 'lying', 'walking', 'jumping', 'mirror selfie'],
  Setting: ['travel', 'beach', 'city street', 'nature', 'restaurant table', 'cafe', 'home', 'gym', 'night'],
  Framing: ['full body', 'half body', 'close-up'],
};
export const TAG_GROUPS = Object.entries(TAGS);

export const PRESETS: Record<PresetKey, { name: string; helps: string; f: Fine }> = {
  standard: { name: 'Standard', helps: 'Original colors and sizes', f: { w: 2.5, lbl: 10, always: true, dash: false, outline: false, big: false, hold: false, palette: 'standard' } },
  cb: { name: 'Color-blind safe', helps: 'Safe colors, dashes and shapes', f: { w: 3, lbl: 11, always: true, dash: true, outline: false, big: false, hold: false, palette: 'cb' } },
  easy: { name: 'Easy to see', helps: 'Thick lines, large labels', f: { w: 5, lbl: 14, always: true, dash: false, outline: true, big: false, hold: true, palette: 'hc' } },
  big: { name: 'Big and simple', helps: 'Large buttons, fewer options', f: { w: 5, lbl: 16, always: true, dash: false, outline: true, big: true, hold: true, palette: 'hc' } },
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  preset: 'standard',
  fine: { ...PRESETS.standard.f },
  defOp: 35,
  showOverlay: true,
  editGrid: true,
  saveToAlbum: true,
  quality: 'standard',
};

export const RATIOS: [number, number][] = [[9, 16], [2, 3], [3, 4], [4, 5], [1, 1], [5, 4], [4, 3], [3, 2], [16, 9]];
// Portrait shapes only: turn the phone sideways for landscape (the camera reads these as 16:9, 4:3)
export const FREE_RATIOS = ['9:16', '3:4', '1:1'];

// Snap a photo's shape to the nearest common frame ratio (within 4%), else keep it as is.
export function snapRatio(w: number, h: number) {
  const r = w / h;
  for (const [a, b] of RATIOS) if (Math.abs(r / (a / b) - 1) < 0.04) return `${a}:${b}`;
  return `${Math.round(w)}:${Math.round(h)}`;
}
export const arNum = (r: string) => {
  const [a, b] = r.split(':').map(Number);
  return a > 0 && b > 0 ? a / b : 1;
};
export const ratioLabel = (r: string) => (RATIOS.some(([a, b]) => `${a}:${b}` === r) ? r : 'Original shape');
export const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const newShot = (file: string, guideId: string | null, ar: number, rot = 0): Shot => ({ id: uid('s'), file, guideId, ar, createdAt: Date.now(), rot });
export const uid = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
