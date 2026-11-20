// After a capture: crop the photo to the guide frame's shape, keep a copy for the Shots view,
// and save it to the "ProPose" album in Photos.
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { uid } from './model';
import { shotDir } from './store';

export const ALBUM = 'ProPose';

// Crops a fresh photo to the camera frame and keeps it. `frameAr` is the frame's width / height on
// the (portrait) screen. Whether the phone was sideways is read from the photo itself: once loaded
// upright, a wide photo was taken sideways (the sensor is landscape, so upright shots come out
// tall), and then the frame was seen turned, so the crop is the frame's turned shape (4:5 → 5:4).
// Returns the kept file and its shape (width / height).
export async function cropToFrame(path: string, frameAr: number, quality: 'standard' | 'high') {
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  // Loading applies the EXIF orientation, so width/height are as the photo is viewed
  const img = await ImageManipulator.manipulate(uri).renderAsync();
  const { width: w, height: h } = img;
  const sideways = w > h;
  const ar = sideways ? 1 / frameAr : frameAr;
  let cw = w;
  let ch = h;
  if (w / h > ar) cw = Math.round(h * ar);
  else ch = Math.round(w / ar);
  const cropped = await ImageManipulator.manipulate(img)
    .crop({ originX: Math.round((w - cw) / 2), originY: Math.round((h - ch) / 2), width: cw, height: ch })
    .renderAsync();
  const saved = await cropped.saveAsync({ format: SaveFormat.JPEG, compress: quality === 'high' ? 1 : 0.85 });
  const file = `${uid('s')}.jpg`;
  new File(saved.uri).moveSync(new File(shotDir(), file));
  return { file, ar, sideways };
}

// Returns an error message, or null when saved
export async function saveToAlbum(fileUri: string): Promise<string | null> {
  try {
    const ML = await import('expo-media-library');
    const perm = await ML.requestPermissionsAsync();
    if (!perm.granted) return 'Photos access is off, so the shot was kept in ProPose only.';
    const album = await ML.Album.get(ALBUM);
    if (album) await ML.Asset.create(fileUri, album);
    else await ML.Album.create(ALBUM, [await ML.Asset.create(fileUri)], false);
    return null;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    return msg.includes('ExpoMediaLibrary') || msg.includes('native module') ? 'Rebuild the app to save to Photos.' : msg;
  }
}
