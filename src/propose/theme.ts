// ProPose colours: warm off-white light theme, warm near-black dark theme with a cream accent.
// The camera is always dark.
import { Platform, useColorScheme } from 'react-native';
import { useStore } from './store';

export type Theme = {
  dark: boolean;
  canvas: string; card: string; raised: string; hair: string;
  text: string; text2: string; muted: string;
  accent: string; on: string; tint: string; danger: string;
};

export const LIGHT: Theme = {
  dark: false,
  canvas: '#F6F4F0', card: '#FFFFFF', raised: '#EFEBE4', hair: '#E4DFD6',
  text: '#1C1917', text2: '#6B655C', muted: '#8F897F',
  accent: '#2B221C', on: '#F6F4F0', tint: '#F1E2C6', danger: '#C93C3C',
};
export const DARK: Theme = {
  dark: true,
  canvas: '#14110F', card: '#1E1A17', raised: '#28231F', hair: '#2E2924',
  text: '#F3EEE6', text2: '#A8A196', muted: '#7E776C',
  accent: '#F3E3C3', on: '#14110F', tint: '#3A3128', danger: '#FF7A70',
};
export const CREAM = '#F3E3C3';
export const FAV = '#FF5A5F';
export const YELLOW = '#FFD60A';

export const SERIF = Platform.select({ ios: 'Iowan Old Style', android: 'serif', default: 'Georgia' });

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const { data } = useStore();
  const t = data.settings.theme;
  return t === 'dark' || (t === 'auto' && scheme === 'dark') ? DARK : LIGHT;
}
