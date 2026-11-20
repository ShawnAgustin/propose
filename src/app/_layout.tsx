import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ProPoseProvider } from '@/propose/store';
import { useTheme } from '@/propose/theme';
import { ToastProvider } from '@/propose/ui';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <ProPoseProvider>
      <Themed />
    </ProPoseProvider>
  );
}

// Inside the provider so the app's own Light/Dark/Automatic setting drives navigation colours
function Themed() {
  const t = useTheme();
  return (
    <ThemeProvider value={t.dark ? DarkTheme : DefaultTheme}>
      <ToastProvider>
        <AnimatedSplashOverlay />
        {/* Full-screen stack, no headers: each screen draws its own. Swipe-back is off: on iOS 26+ it
            works from anywhere on the screen, so it fought marker drags and sliders. Every screen
            has its own back button. */}
        <Stack screenOptions={{ headerShown: false, gestureEnabled: false, contentStyle: { backgroundColor: t.canvas } }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="settings/index" options={{ animation: 'none' }} />
          <Stack.Screen name="camera" options={{ animation: 'fade', contentStyle: { backgroundColor: '#0A0908' } }} />
          <Stack.Screen name="shots" options={{ contentStyle: { backgroundColor: '#14110F' } }} />
        </Stack>
      </ToastProvider>
    </ThemeProvider>
  );
}
