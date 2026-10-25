#!/bin/sh
# Local test helper: (re)start the server detached with a throwaway data dir.
cd "$(dirname "$0")/.."
[ -f /tmp/dh.pid ] && kill "$(cat /tmp/dh.pid)" 2>/dev/null; sleep 0.5
rm -rf /tmp/dh
DATA_DIR=/tmp/dh ADMIN_PASSWORD='test-pass-12345' PORT=3111 setsid nohup node server.js > /tmp/server.log 2>&1 &
echo $! > /tmp/dh.pid
sleep 1.5
curl -s -m 3 localhost:3111/healthz; echo
