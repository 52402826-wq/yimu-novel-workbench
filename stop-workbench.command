#!/bin/zsh

/bin/zsh -lc '
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:$PATH"
pid="$(lsof -tiTCP:3007 -sTCP:LISTEN | head -n 1)"

if [ -z "$pid" ]; then
  echo "乙木没有在 3007 端口运行。"
  exit 0
fi

echo "正在停止乙木，进程 PID：$pid"
kill "$pid"
sleep 1

if lsof -tiTCP:3007 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "普通停止失败，尝试强制停止。"
  kill -9 "$pid"
  sleep 1
fi

if lsof -tiTCP:3007 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "仍未停止。请打开“活动监视器”，搜索 node，并结束对应乙木进程。"
else
  echo "乙木已停止。"
fi
'

echo
echo "按回车关闭窗口。"
read
