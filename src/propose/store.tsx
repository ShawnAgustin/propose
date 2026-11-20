// App state for ProPose: poses, marker names, session shots and settings, kept in one JSON file
// in the app's documents folder. Photos are copied into that folder too, so poses survive the
// original being deleted from the photo library. Everything stays on the phone.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Directory, File, Paths } from 'expo-file-system';
import {
  CUSTOM_TPL, DEF_TPL, DEFAULT_SETTINGS, PRESETS,
  type Pose, type PresetKey, type Settings, type Shot, type Template,
} from './model';

type Data = { v: 1; poses: Pose[]; tpl: Template[]; shots: Shot[]; settings: Settings };

const freshData = (): Data => ({
  v: 1,
  poses: [],
  tpl: [...DEF_TPL, ...CUSTOM_TPL].map((t) => ({ ...t })),
  shots: [],
  settings: { ...DEFAULT_SETTINGS, fine: { ...DEFAULT_SETTINGS.fine } },
});

const dataFile = () => new File(Paths.document, 'propose.json');
export const poseDir = () => {
  const d = new Directory(Paths.document, 'poses');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
export const shotDir = () => {
  const d = new Directory(Paths.document, 'shots');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
export const poseUri = (p: Pose) => new File(poseDir(), p.file).uri;
export const shotUri = (s: Shot) => new File(shotDir(), s.file).uri;

function load(): Data {
  try {
    const f = dataFile();
    if (!f.exists) return freshData();
    const d = JSON.parse(f.textSync()) as Partial<Data>;
    const base = freshData();
    return {
      ...base,
      ...d,
      settings: { ...base.settings, ...d.settings, fine: { ...base.settings.fine, ...d.settings?.fine } },
    } as Data;
  } catch {
    return freshData();
  }
}

type Store = {
  data: Data;
  update: (fn: (d: Data) => Data) => void;
  updatePose: (id: string, fn: (p: Pose) => Pose) => void;
  deletePoses: (ids: string[]) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setFine: (patch: Partial<Settings['fine']>) => void;
  applyPreset: (k: PresetKey) => void;
  tpl: (id: string) => Template;
};

const Ctx = createContext<Store | null>(null);

export function ProPoseProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Data>(load);

  // Save shortly after the last change (drags update state many times a second)
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        dataFile().write(JSON.stringify(data));
      } catch (e) {
        console.warn('ProPose: could not save', e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data]);

  const store = useMemo<Store>(() => {
    const update = (fn: (d: Data) => Data) => setData(fn);
    return {
      data,
      update,
      updatePose: (id, fn) => update((d) => ({ ...d, poses: d.poses.map((p) => (p.id === id ? fn(p) : p)) })),
      deletePoses: (ids) => {
        for (const p of data.poses) {
          if (!ids.includes(p.id)) continue;
          try {
            const f = new File(poseDir(), p.file);
            if (f.exists) f.delete();
          } catch {}
        }
        update((d) => ({ ...d, poses: d.poses.filter((p) => !ids.includes(p.id)) }));
      },
      setSettings: (patch) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } })),
      setFine: (patch) =>
        update((d) => ({ ...d, settings: { ...d.settings, preset: 'custom', fine: { ...d.settings.fine, ...patch } } })),
      applyPreset: (k) => update((d) => ({ ...d, settings: { ...d.settings, preset: k, fine: { ...PRESETS[k].f } } })),
      tpl: (id) => data.tpl.find((t) => t.id === id) ?? { id, name: id, kind: 'circle', color: 'white' },
    };
  }, [data]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside ProPoseProvider');
  return s;
}
