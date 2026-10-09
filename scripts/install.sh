#!/usr/bin/env bash
# Install claude-ui CLI + "Claude UI.app" (native WKWebView launcher) for claude-code-agents-ui.
# Idempotent. Needs: macOS, Xcode Command Line Tools (swiftc), bun, git clone of the repo.
# Usage: ./scripts/install.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="$HOME/Applications/Claude UI.app"
BIN_DIR="$HOME/.local/bin"
# Derive repo root from script location (scripts/ lives one level inside the repo)
REPO="${CLAUDE_UI_DIR:-$(cd "$HERE/.." && pwd)}"

[ "$(uname)" = "Darwin" ] || { echo "macOS only" >&2; exit 1; }
for t in swiftc qlmanage sips iconutil codesign; do
  command -v "$t" >/dev/null || { echo "missing tool: $t (run: xcode-select --install)" >&2; exit 1; }
done

# 1. CLI: symlink so edits in this dir apply live
mkdir -p "$BIN_DIR"
ln -sf "$HERE/claude-ui" "$BIN_DIR/claude-ui"
chmod +x "$HERE/claude-ui"
echo "linked $BIN_DIR/claude-ui -> $HERE/claude-ui"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "WARN: $BIN_DIR not on PATH" >&2 ;; esac

# 2. quit running app so binary can be replaced
if pgrep -f "Claude UI.app/Contents/MacOS/launch" >/dev/null; then
  osascript -e 'tell application "Claude UI" to quit' >/dev/null 2>&1 || true
  sleep 3
fi

# 3. icon: svg -> png -> iconset -> icns
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/AppIcon.iconset"
qlmanage -t -s 1024 -o "$TMP" "$HERE/icon.svg" >/dev/null 2>&1
[ -f "$TMP/icon.svg.png" ] || { echo "icon render failed" >&2; exit 1; }
for sz in 16 32 128 256 512; do
  sips -z "$sz" "$sz" "$TMP/icon.svg.png" --out "$TMP/AppIcon.iconset/icon_${sz}x${sz}.png" >/dev/null
  sips -z $((sz * 2)) $((sz * 2)) "$TMP/icon.svg.png" --out "$TMP/AppIcon.iconset/icon_${sz}x${sz}@2x.png" >/dev/null
done
iconutil -c icns "$TMP/AppIcon.iconset" -o "$TMP/AppIcon.icns"

# 4. app bundle
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$HERE/Info.plist" "$APP/Contents/Info.plist"
cp "$TMP/AppIcon.icns" "$APP/Contents/Resources/AppIcon.icns"
swiftc -O -swift-version 5 "$HERE/main.swift" -o "$APP/Contents/MacOS/launch"
codesign --force --deep --sign - "$APP"
touch "$APP"
echo "built $APP"

# 5. repo deps hint
if [ ! -d "$REPO/node_modules" ]; then
  echo "NOTE: run 'bun install' in $REPO (claude-ui also does it on first start)"
fi

echo "done. Drag '$APP' to the Dock, or run: claude-ui"
