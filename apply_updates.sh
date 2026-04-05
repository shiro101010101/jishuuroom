#!/bin/bash
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

cp "$SCRIPT_DIR/RoomClient.tsx" components/room/RoomClient.tsx
cp "$SCRIPT_DIR/RoomClient.module.css" components/room/RoomClient.module.css
cp "$SCRIPT_DIR/TaskPanel.tsx" components/room/TaskPanel.tsx
cp "$SCRIPT_DIR/TaskPanel.module.css" components/room/TaskPanel.module.css
cp "$SCRIPT_DIR/SafetyPanel.tsx" components/room/SafetyPanel.tsx
cp "$SCRIPT_DIR/useTaskSharing.ts" hooks/useTaskSharing.ts

echo "✓ 全ファイル更新完了！"
echo "次に: git add . && git commit -m 'fix: UI updates' && git push"
