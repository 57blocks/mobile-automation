#!/usr/bin/env bash
# Launches the official Appium MCP server (github.com/appium/appium-mcp) for this project.
#
# Referenced by .mcp.json rather than calling npx directly, so the committed config carries
# no machine-specific absolute paths and the capabilities stay generated from .env.
#
# Overrides (export in your shell before starting Claude Code):
#   APPIUM_MCP_VERSION   pin a different server version
#   MCP_INSTALL_APP      =true to install the binary instead of attaching to what is on the
#                        device (see scripts/write-mcp-capabilities.ts)
set -euo pipefail
cd "$(dirname "$0")/.."

# Pinned, not @latest: the case-implementer agent names its tools explicitly, and a silent
# upgrade that renames one leaves the agent with a tool that no longer resolves.
VERSION="${APPIUM_MCP_VERSION:-1.94.0}"

# Regenerated every launch so it cannot drift from .env. Non-fatal: the server still starts
# without it, you just have to pass capabilities by hand.
npx tsx scripts/write-mcp-capabilities.ts || echo "[appium-mcp] could not write capabilities — continuing without them" >&2

export CAPABILITIES_CONFIG="$PWD/test/fixtures/mcp/capabilities.json"

# Deliberately NOT test-results/: cleanArtefacts() wipes that in onPrepare, and inspection
# captures are taken *before* the run they inform — pointing them there means the first wdio
# run silently deletes the screenshots you were working from.
export SCREENSHOTS_DIR="$PWD/mcp-captures"
mkdir -p "$SCREENSHOTS_DIR"

# This repo's guardrail is to keep bulky output out of the model's context; NO_UI drops the
# server's HTML component from every response.
export NO_UI="${NO_UI:-true}"

# Leaving an MCP session alive on a real device holds the device's only XCTest session, and
# the next wdio run then fails with XCTDaemonErrorDomain Code=41. Default is delete_all;
# named here so nobody turns it off without reading test/helpers/wdaCleanup.ts.
export APPIUM_MCP_ON_CLIENT_DISCONNECT="${APPIUM_MCP_ON_CLIENT_DISCONNECT:-delete_all}"

# Reuse the runner this repo already points at, so prepare_ios_simulator skips the GitHub
# download.
if [ -n "${IOS_PREBUILT_WDA_PATH:-}" ]; then
    export APPIUM_MCP_WDA_APP_PATH="$IOS_PREBUILT_WDA_PATH"
fi

exec npx -y "appium-mcp@${VERSION}"
