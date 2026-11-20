# ProPose

ProPose is a camera app that helps you recreate a pose or shot. Pick a reference photo, place markers on it (top of head, eyes, horizon, table edge…), then shoot with that photo faded over the live camera so you can line everything up.

## Features

- **Pose gallery:** import reference photos, organize them with favorites and tags (people, pose, setting, framing), and switch between grid and list views.
- **Guide editor:** drag markers onto a photo, rotate lines, name the pose, and add tags.
- **Camera:** the guide photo is shown over the live view with adjustable opacity, or press and hold to peek at it. Also includes a grid, markers, tap to focus with brightness control, pinch to zoom, lens switching, flash, a 3 s or 10 s timer, front/back flip, and a level.
- **Shots:** photos are cropped to the guide's shape and saved to a "ProPose" album in Photos. **Compare** shows the guide and your shot side by side.
- **Accessibility:** colorblind-safe and high-contrast palettes, dashed lines and shape badges so color is never the only cue, larger labels and buttons, and light/dark themes.

Everything stays on your device. The app has no account and makes no network calls.

Built with [Expo](https://expo.dev) (SDK 58), React Native, Expo Router and [Vision Camera](https://react-native-vision-camera.com).

---

## Running it on your phone

> **Expo Go will not work.** ProPose uses native camera modules that aren't included in the Expo Go app. You need to build the app yourself, which takes about 15 minutes the first time. Build it either on your own computer (below), or [in the cloud with EAS](#building-in-the-cloud-with-eas-no-android-studio-xcode-or-emulator), which needs no Android Studio, Xcode or emulator.

### 1. Install the basics (all platforms)

- [Node.js](https://nodejs.org) (current LTS)
- [Git](https://git-scm.com)

Then get the code:

```bash
git clone https://github.com/ShawnAgustin/propose.git
cd propose
npm install
```

### 2a. Android

Works on macOS, Windows or Linux.

1. Install [Android Studio](https://developer.android.com/studio). Its first-run setup installs the Android SDK and Java (JDK).
2. On your phone, turn on **Developer options** (Settings → About phone → tap **Build number** 7 times), then turn on **USB debugging** in Settings → System → Developer options.
3. Plug the phone into your computer with USB and accept the "Allow USB debugging?" prompt.
4. Build and install:

   ```bash
   npx expo run:android --device
   ```

   Pick your phone from the list. The app installs and opens, connected to the dev server on your computer.

**No cable:** on Android 11+ you can pair over Wi-Fi in Android Studio (Device Manager → Pair devices using Wi-Fi), then run the same command.

### 2b. iPhone

**You need a Mac.** Apple only allows iOS apps to be built in Xcode, which runs on macOS.

1. Install **Xcode** from the Mac App Store, open it once, and let it install its extra components.
2. In Xcode → Settings → Accounts, sign in with your Apple ID. A free account works.
3. **Change the bundle ID.** Each Apple ID needs its own app ID, and the one in this repo is already taken. In `app.json`, change:

   ```json
   "bundleIdentifier": "com.sagustin.propose"
   ```

   to something unique, such as `com.yourname.propose`.

4. Plug in your iPhone, unlock it, and tap **Trust This Computer**.
5. Build and install:

   ```bash
   npx expo prebuild -p ios --clean
   npx expo run:ios --device
   ```

   Pick your iPhone from the list.

   **If you see a signing error** such as "No team selected", run `xed ios` to open the project in Xcode. Select the **ProPose** target → **Signing & Capabilities**, set **Team** to your Apple ID, and leave "Automatically manage signing" on. Then run `npx expo run:ios --device` again.

6. On the iPhone:
   - **Developer Mode:** iOS asks you to turn it on the first time. Go to Settings → Privacy & Security → Developer Mode, turn it on, and let the phone restart.
   - **"Untrusted Developer":** go to Settings → General → VPN & Device Management, tap your Apple ID, then tap **Trust**.

**No cable:** with the phone plugged in once, open Xcode → Window → Devices and Simulators, select your iPhone, and check **Connect via network**. After that, `npx expo run:ios --device` works over Wi-Fi when the phone is unlocked and on the same network as your Mac.

**Standalone install, no dev server:** to put a self-contained copy on your iPhone (JS bundled in, opens like a normal app with no computer needed), run:

```bash
npm run install:iphone
```

This builds in Release mode, signs it with the Apple ID you're signed in to in Xcode, and installs it on your paired iPhone (cable or Wi-Fi). Add `-- --clean` after changing `app.json` or native packages. You can set `DEVICE=<name or udid>` or `APPLE_TEAM_ID=<id>` to override what it picks.

> **Free Apple account limits:** the app stops opening after **7 days**. Run `npx expo run:ios --device` again to refresh it. A free account can also only have 3 sideloaded apps installed at once. A paid Apple Developer account ($99/yr) removes these limits.

### 3. Every day after that

After the app is installed, you don't have to rebuild it. Start the dev server and open ProPose on your phone:

```bash
npx expo start
```

Your phone and computer need to be on the same Wi-Fi network. Code changes reload instantly.

Rebuild with `npx expo run:android --device` or `npx expo run:ios --device` only after you:
- add or update a package that has native code,
- change `app.json`, or
- change icons or the splash screen.

---

## Building a standalone APK (Android)

To get an APK that runs without a computer, for example to share with friends:

```bash
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease
```

The APK is at `android/app/build/outputs/apk/release/app-release.apk`. To install it, copy it to the phone and allow "Install unknown apps", or run `adb install app-release.apk`.

This build is signed with a debug key. That's fine for sideloading, but not for Google Play.

To skip Android Studio, build in the cloud instead, as described in the next section.

## Building in the cloud with EAS (no Android Studio, Xcode or emulator)

[EAS Build](https://docs.expo.dev/build/introduction/) builds the app on Expo's servers and gives you a link or QR code to install it on your phone. If `npx expo run:android` keeps asking for an emulator, use this instead.

### One-time setup

1. Create a free account at [expo.dev](https://expo.dev), then log in:

   ```bash
   npx eas-cli@latest login
   ```

2. Link the project to your account. This adds an EAS project ID to `app.json`:

   ```bash
   npx eas-cli@latest init
   ```

   > **Cloned someone else's copy?** If `app.json` already has an `extra.eas.projectId` (or an `owner`) that belongs to another account, delete those fields first. Then run `npx eas-cli@latest init` to create your own project.

The build profiles are already set up in [`eas.json`](eas.json):

| Profile | What you get | Needs a dev server? |
|---|---|---|
| `development` | Dev build that live-reloads from `npx expo start` | Yes |
| `preview` | Standalone app with the JS bundled in, good for sharing | No |
| `production` | Store build (`.aab` for Google Play, App Store build for iOS) | No |

### Android

```bash
# Dev build (live reload)
npx eas-cli@latest build -p android --profile development

# Standalone APK (no server)
npx eas-cli@latest build -p android --profile preview
```

The build takes about 10–20 minutes. When it finishes, open the link or scan the QR code on your phone and install the APK. You may need to allow "Install unknown apps" for your browser. For a dev build, then run `npx expo start` on your computer and open ProPose on the phone.

### iPhone

> **Cloud builds for iPhone need a paid [Apple Developer account](https://developer.apple.com/programs/) ($99/yr).** With a free Apple ID, build on a Mac instead, using the iPhone steps above or `npm run install:iphone`.

1. Register each iPhone that should run the build (once per device). Open the link it gives you on the iPhone and install the profile:

   ```bash
   npx eas-cli@latest device:create
   ```

2. Build (EAS walks you through signing with your Apple account the first time):

   ```bash
   # Dev build (live reload)
   npx eas-cli@latest build -p ios --profile development

   # Standalone (no server)
   npx eas-cli@latest build -p ios --profile preview
   ```

3. Open the link on the iPhone and tap **Install**. Turn on Developer Mode if iOS asks.

To add a new iPhone later, register it with `device:create`, then build again.

### Both phones at once

One `npx expo start` serves every dev build at the same time, so an Android phone and an iPhone can both live-reload together. If a phone isn't on the same Wi-Fi as your computer, use `npx expo start --tunnel`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Expo Go shows an error or a blank screen | Expected. Build the app with `npx expo run:…` or EAS as described above. |
| `npx expo run:android` asks for an emulator | No phone was detected. Plug it in with USB debugging on, or build in the cloud with EAS. |
| EAS: "You don't have permission to access this project" | `app.json` is linked to someone else's EAS project. Remove `extra.eas.projectId` and `owner`, then run `npx eas-cli@latest init`. |
| Phone doesn't appear in the device list | Android: check USB debugging and accept the prompt on the phone. iPhone: unlock the phone and tap Trust. |
| App opens but says it can't connect to the dev server | Run `npx expo start`, and check that the phone and computer are on the same Wi-Fi. |
| iOS: "Failed to register bundle identifier" | The bundle ID is taken. Change `ios.bundleIdentifier` in `app.json` (step 3 of the iPhone setup). |
| iOS: app won't open after a week | Your free signing expired. Run `npx expo run:ios --device` again. |
| Strange native build errors after pulling changes | Run `npm install`, then `npx expo prebuild --clean`, then build again. |

## Project structure

```
src/app/          Screens and routes (Expo Router: each file is a screen)
src/propose/      App logic: data model, store, camera capture, theme, shared UI
src/propose/screens/   Camera, Gallery, Edit guide, Shots, Settings
src/components/   Shared components
assets/           Icons and splash images (assets/icon-source has the generator)
```

The `android/` and `ios/` folders aren't committed. They're generated from `app.json` by `npx expo prebuild`.

Before committing, run:

```bash
npx expo lint
npx tsc --noEmit
```

## License

[MIT](LICENSE)
