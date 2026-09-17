#!/usr/bin/env bash
# Builds the app under test for the iOS simulator and copies it into apps/<APP_NAME>.app,
# stamping build provenance next to it so a surprising test result can be traced back to
# the binary that produced it.
#
# Usage:
#   ./scripts/refresh-ios-sim-app.sh
#
# Configuration (env vars, or .env):
#   APP_SOURCE_DIR   Path to the app's Xcode project/workspace repo  (required)
#   APP_SCHEME       Xcode scheme to build                           (default: APP_NAME)
#   APP_NAME         Output bundle name under apps/                  (default: App)
#   APP_CONFIGURATION  Build configuration                           (default: Debug)
#   APP_EXPECTED_BRANCH  Warn when the source repo is on another branch (default: main)
set -euo pipefail
cd "$(dirname "$0")/.."

for cmd in xcodebuild git plutil; do
    if ! command -v "$cmd" >/dev/null; then
        echo "❌ '$cmd' not found — install Xcode (the full app, not just CLT) before running." >&2
        exit 1
    fi
done

# Pull defaults out of .env without sourcing it, stripping surrounding quotes and a
# trailing CR so a quoted value does not arrive with its quotes attached.
env_value() {
    grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- \
        | sed -e 's/\r$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/" || true
}

APP_NAME="${APP_NAME:-$(env_value APP_NAME)}"
APP_NAME="${APP_NAME:-App}"
APP_SOURCE_DIR="${APP_SOURCE_DIR:-$(env_value APP_SOURCE_DIR)}"
SCHEME="${APP_SCHEME:-$(env_value APP_SCHEME)}"
SCHEME="${SCHEME:-$APP_NAME}"
CONFIG="${APP_CONFIGURATION:-Debug}"
EXPECTED_BRANCH="${APP_EXPECTED_BRANCH:-main}"

if [ -z "$APP_SOURCE_DIR" ] || [ ! -d "$APP_SOURCE_DIR" ]; then
    echo "❌ App source repo not found. Set APP_SOURCE_DIR to the app's repo path (got: '${APP_SOURCE_DIR:-unset}')." >&2
    exit 1
fi

BRANCH=$(git -C "$APP_SOURCE_DIR" rev-parse --abbrev-ref HEAD)
SHA=$(git -C "$APP_SOURCE_DIR" rev-parse --short HEAD)
echo "Building $SCHEME ($CONFIG) from $APP_SOURCE_DIR @ $BRANCH ($SHA)"
if [ "$BRANCH" != "$EXPECTED_BRANCH" ]; then
    echo "⚠  Source repo is on $BRANCH, not $EXPECTED_BRANCH — building $BRANCH anyway."
fi

build() {
    (cd "$APP_SOURCE_DIR" && xcodebuild -scheme "$SCHEME" -configuration "$CONFIG" \
        -destination 'generic/platform=iOS Simulator' build)
}

LOG=$(mktemp)
trap 'rm -f "$LOG"' EXIT

run_build() {
    # tee streams the log to the console; PIPESTATUS[0] is xcodebuild's own status, so a tee
    # failure (full /tmp) can't be mistaken for a build failure.
    build 2>&1 | tee "$LOG"
    return "${PIPESTATUS[0]}"
}

if ! run_build; then
    # Stale precompiled-module caches are common after SPM package updates; clear and retry once.
    if grep -q "has been modified since the module file" "$LOG"; then
        shopt -s nullglob
        CACHE_DIRS=("$HOME/Library/Developer/Xcode/DerivedData"/"$SCHEME"-*/Build/Intermediates.noindex/SwiftExplicitPrecompiledModules)
        shopt -u nullglob
        if [ ${#CACHE_DIRS[@]} -eq 0 ]; then
            echo "❌ Stale module cache detected but no SwiftExplicitPrecompiledModules dir found under ~/Library/Developer/Xcode/DerivedData/$SCHEME-* — clear it manually (custom DerivedData location?)." >&2
            exit 1
        fi
        echo "⚠  Stale module cache detected — clearing ${#CACHE_DIRS[@]} dir(s) and retrying..."
        rm -rf "${CACHE_DIRS[@]}"
        if ! run_build; then
            echo "❌ Build failed after cache-clear retry — see output above." >&2
            exit 1
        fi
    else
        echo "❌ Build failed — see output above." >&2
        exit 1
    fi
fi

if ! SETTINGS=$(cd "$APP_SOURCE_DIR" && xcodebuild -scheme "$SCHEME" -configuration "$CONFIG" \
    -destination 'generic/platform=iOS Simulator' -showBuildSettings 2>&1); then
    echo "❌ xcodebuild -showBuildSettings failed:" >&2
    echo "$SETTINGS" >&2
    exit 1
fi
BUILD_DIR=$(awk -F' = ' '/ TARGET_BUILD_DIR /{print $2; exit}' <<< "$SETTINGS")
PRODUCT=$(awk -F' = ' '/ FULL_PRODUCT_NAME /{print $2; exit}' <<< "$SETTINGS")

if [ -z "$BUILD_DIR" ] || [ -z "$PRODUCT" ]; then
    echo "❌ Could not read TARGET_BUILD_DIR / FULL_PRODUCT_NAME from -showBuildSettings (got BUILD_DIR='$BUILD_DIR', PRODUCT='$PRODUCT')." >&2
    exit 1
fi
if [ ! -f "$BUILD_DIR/$PRODUCT/Info.plist" ]; then
    echo "❌ Built app not found or not an app bundle: $BUILD_DIR/$PRODUCT" >&2
    exit 1
fi

mkdir -p apps
rm -rf "apps/${APP_NAME}.app"
cp -R "$BUILD_DIR/$PRODUCT" "apps/${APP_NAME}.app"
VERSION=$(plutil -extract CFBundleShortVersionString raw "apps/${APP_NAME}.app/Info.plist" 2>/dev/null || echo "unknown")
printf 'version=%s\nbranch=%s\nsha=%s\nbuilt=%s\n' "$VERSION" "$BRANCH" "$SHA" "$(date '+%Y-%m-%d %H:%M:%S')" \
    > "apps/${APP_NAME}.app.buildinfo"
echo "✅ apps/${APP_NAME}.app refreshed: $VERSION from $BRANCH ($SHA)"
