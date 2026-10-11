#!/bin/zsh
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print "请先安装 Node.js 22.12 或更新版本，然后重新启动。"
  read "?按回车退出…"
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci --cache "${TMPDIR:-/tmp}/inkbridge-npm-cache" || exit 1
fi
inkbridge_port=$(node --input-type=module -e "import 'dotenv/config'; console.log(process.env.PORT || 3210)")
if curl --max-time 2 -fsS "http://localhost:$inkbridge_port/api/status" >/dev/null 2>&1; then
  open "http://localhost:$inkbridge_port"
  exit 0
fi
npm run build || exit 1
(sleep 2; open "http://localhost:$inkbridge_port") &
npm start
