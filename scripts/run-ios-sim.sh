#!/usr/bin/env bash
# Runs iOS specs against a booted simulator.
#
# Auto-detects the booted iOS simulator and overrides the real-device .env values for this
# run only — your .env is not modified. That is the whole reason this script exists: one
# wdio.ios.conf.ts serves both targets instead of two configs that drift apart.
#
# Usage:
#   ./scripts/run-ios-sim.sh --spec test/ios/specs/login.spec.ts
#   ./scripts/run-ios-sim.sh                # the simulator-safe suite
#
# Overrides (shell env vars — read before .env loads, so export them in your shell rather
# than setting them in .env):
#   IOS_SIM_UDID   Target a specific booted simulator when several are booted
#   APP_NAME       Name of the .app under apps/ (default: read from .env, else "App")
set -euo pipefail
cd "$(dirname "$0")/.."

for cmd in xcrun python3 npx; do
    if ! command -v "$cmd" >/dev/null; then
        echo "❌ '$cmd' not found — install Xcode Command Line Tools / Node before running." >&2
        exit 1
    fi
done

# APP_NAME may live in .env, which has not been loaded yet. Read without sourcing (values
# may contain spaces), stripping any surrounding quotes and a trailing CR.
env_value() {
    grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- \
        | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/" || true
}

APP_NAME="${APP_NAME:-$(env_value APP_NAME)}"
APP_NAME="${APP_NAME:-App}"
APP_BUNDLE="apps/${APP_NAME}.app"

if [ ! -d "$APP_BUNDLE" ]; then
    echo "❌ $APP_BUNDLE not found — run ./scripts/refresh-ios-sim-app.sh first." >&2
    exit 1
fi
if [ -f "${APP_BUNDLE}.buildinfo" ]; then
    echo "App under test: $(tr '\n' ' ' < "${APP_BUNDLE}.buildinfo")"
else
    echo "⚠  No ${APP_BUNDLE}.buildinfo stamp — unknown build provenance."
fi

SIM_INFO=$(xcrun simctl list devices booted -j | python3 -c '
import json, os, sys
data = json.load(sys.stdin)
want = os.environ.get("IOS_SIM_UDID", "").upper()
booted = []
for runtime, devices in data["devices"].items():
    if ".SimRuntime.iOS-" not in runtime:
        continue
    tail = runtime.rsplit(".", 1)[-1]
    if tail.startswith("iOS-"):
        tail = tail[len("iOS-"):]
    version = tail.replace("-", ".")
    booted += [(d["udid"], version, d["name"]) for d in devices if d.get("state") == "Booted"]
if not booted:
    sys.exit("No booted iOS simulator found (watchOS/tvOS sims are ignored). Boot one in Simulator.app and retry.")
if want:
    booted = [b for b in booted if b[0].upper() == want] or sys.exit(f"IOS_SIM_UDID {want} is not a booted iOS simulator.")
elif len(booted) > 1:
    names = ", ".join(f"{b[2]} ({b[0]})" for b in booted)
    print(f"Multiple booted iOS simulators: {names} — picking the first; export IOS_SIM_UDID to choose.", file=sys.stderr)
print(*booted[0])
')
read -r UDID VERSION NAME <<< "$SIM_INFO"
echo "Running against: $NAME ($VERSION) [$UDID]"

# Blank the real-device-only vars so wdio.ios.conf.ts takes its simulator paths.
# Empty (not unset) is load-bearing: dotenv does not overwrite keys already present in
# process.env, so these blanks win over the .env real-device values.
export IOS_DEVICE_NAME="$NAME"
export IOS_UDID="$UDID"
export IOS_PLATFORM_VERSION="$VERSION"
export IOS_APP_PATH="./$APP_BUNDLE"
export IOS_XCODE_ORG_ID=
export IOS_XCODE_SIGNING_ID=
export IOS_USE_PREBUILT_WDA=
export IOS_USE_PREINSTALLED_WDA=
export IOS_NO_RESET=

if [ $# -eq 0 ]; then
    # A full spec list usually includes flows a simulator cannot run (Apple Pay sandbox,
    # push, camera). The `simulator` suite is the subset that can.
    echo "No spec given — running the simulator-safe suite (--suite simulator)."
    echo "   If wdio reports no specs, the 'simulator' suite in wdio.ios.conf.ts is empty."
    exec npx wdio run ./wdio.ios.conf.ts --suite simulator
fi
exec npx wdio run ./wdio.ios.conf.ts "$@"
