#!/bin/bash
# 푸시된 커밋 기준으로 iOS 앱을 빌드한다. 사용: scripts/ios-build.sh [simulator|archive]
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
MODE="${1:-simulator}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch -q origin "$BRANCH"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "커밋되지 않은 변경이 있습니다. 커밋 후 푸시하세요." >&2; exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH")" ]; then
  echo "HEAD가 origin/$BRANCH와 다릅니다. 푸시 후 다시 실행하세요." >&2; exit 1
fi
SHA="$(git rev-parse --short HEAD)"
WT="$(mktemp -d)/src"
git worktree add -q --detach "$WT" HEAD
trap 'git worktree remove --force "$WT"' EXIT
LOG="$(mktemp)"
echo "빌드 기준 커밋: $SHA ($MODE)"
if [ "$MODE" = "archive" ]; then
  ARGS=(-destination 'generic/platform=iOS' -archivePath "build/TextHighlighter-$SHA.xcarchive" archive)
else
  ARGS=(-destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build)
fi
xcodebuild -project "$WT/ios/TextHighlighter.xcodeproj" -scheme TextHighlighter -quiet "${ARGS[@]}" > "$LOG" 2>&1 \
  && echo "BUILD OK ($SHA)" || { grep -E "error:" "$LOG" | sort -u | head -20; exit 1; }
