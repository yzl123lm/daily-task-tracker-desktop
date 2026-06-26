#!/usr/bin/env bash
# macOS 本地打包（需在 Mac 上执行；Windows 无法交叉编译 DMG）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "(build-mac) npm install (if needed)..."
npm install

echo "(build-mac) electron-builder --mac ..."
npm run build:mac

echo "(build-mac) Done. Artifacts:"
ls -la dist/*.dmg dist/*.zip 2>/dev/null || ls -la dist/ || true
