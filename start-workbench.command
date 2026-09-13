#!/bin/zsh

/bin/zsh -lc '
cd "/Users/ray/Projects/NovelWorkbench" || exit 1
export NOVEL_WORKBENCH_DATA_DIR="/Users/ray/Documents/NovelWorkbenchData"
export PORT=3007
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"
node scripts/start-workbench.mjs
'

echo
echo "按回车关闭窗口。"
read
