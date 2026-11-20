#!/usr/bin/env bash
# Build ProPose in Release mode and install it on a connected iPhone.
# The JS is bundled into the app, so it runs on its own with no dev server.
#
# Usage:
#   scripts/install-iphone.sh            # first paired iPhone, team from your keychain
#   scripts/install-iphone.sh --clean    # regenerate ios/ first (after app.json or native package changes)
#
# Optional env vars:
#   DEVICE=<udid or name>      pick a specific iPhone (see: xcrun devicectl list devices)
#   APPLE_TEAM_ID=<team id>    signing team, if auto-detect picks the wrong one
#
# With a free Apple ID the app stops opening after 7 days. Run this again to refresh it.

set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ "$(uname)" == "Darwin" ]] || die "iOS builds need a Mac."
command -v xcodebuild >/dev/null || die "Xcode isn't installed (or xcode-select points elsewhere)."

# 1. Native project
if [[ "${1:-}" == "--clean" || ! -d ios ]]; then
  say "Generating the iOS project"
  npx expo prebuild -p ios --clean
fi

WORKSPACE=$(ls -d ios/*.xcworkspace 2>/dev/null | head -1)
[[ -n "$WORKSPACE" ]] || die "No Xcode workspace in ios/. Run: scripts/install-iphone.sh --clean"
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")

# 2. Signing team
if [[ -z "${APPLE_TEAM_ID:-}" ]]; then
  APPLE_TEAM_ID=$(security find-certificate -c "Apple Development" -p 2>/dev/null \
    | openssl x509 -noout -subject 2>/dev/null \
    | sed -n 's/.*OU *= *\([A-Z0-9]\{10\}\).*/\1/p')
fi
[[ -n "$APPLE_TEAM_ID" ]] || die "No Apple Development certificate found. Sign in to Xcode → Settings → Accounts with your Apple ID, build once from Xcode, then rerun. Or set APPLE_TEAM_ID."

# 3. Device
DEVICES_JSON=$(mktemp)
trap 'rm -f "$DEVICES_JSON"' EXIT
xcrun devicectl list devices --json-output "$DEVICES_JSON" >/dev/null 2>&1 || die "Couldn't list devices (devicectl needs Xcode 15+)."
read -r UDID DEVICE_NAME < <(node -e '
  const want = process.argv[2] || "";
  const ds = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result.devices.filter(d =>
    d.hardwareProperties?.reality === "physical" &&
    d.hardwareProperties?.platform === "iOS" &&
    d.connectionProperties?.pairingState === "paired");
  const d = want ? ds.find(d => d.hardwareProperties.udid === want || d.deviceProperties.name === want) : ds[0];
  if (d) console.log(d.hardwareProperties.udid, d.deviceProperties.name);
' "$DEVICES_JSON" "${DEVICE:-}")
[[ -n "${UDID:-}" ]] || die "No paired iPhone found. Plug it in once, unlock it and tap Trust (or set up Connect via network in Xcode)."

say "Building $SCHEME ($BUNDLE_ID) for $DEVICE_NAME, team $APPLE_TEAM_ID"
DERIVED=ios/build/install
xcodebuild \
  -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
  -destination "id=$UDID" -derivedDataPath "$DERIVED" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Automatic \
  -allowProvisioningUpdates -quiet build

APP="$DERIVED/Build/Products/Release-iphoneos/$SCHEME.app"
[[ -d "$APP" ]] || die "Build finished but $APP is missing."

# 4. Install and launch
say "Installing on $DEVICE_NAME"
xcrun devicectl device install app --device "$UDID" "$APP" >/dev/null

say "Launching"
if ! xcrun devicectl device process launch --device "$UDID" "$BUNDLE_ID" >/dev/null 2>&1; then
  echo "Installed, but iOS wouldn't open it yet. On the iPhone:"
  echo "  • Settings → Privacy & Security → Developer Mode → On (first time only)"
  echo "  • Settings → General → VPN & Device Management → your Apple ID → Trust"
  echo "Then open ProPose from the home screen."
  exit 0
fi

printf '\n\033[32m✓ ProPose is installed and running on %s. No dev server needed.\033[0m\n' "$DEVICE_NAME"
