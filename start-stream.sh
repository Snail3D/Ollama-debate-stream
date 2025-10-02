#!/bin/bash

# Start the debate server
cd /root/ollama-debate-stream
node server.js > /var/log/eternal-debate.log 2>&1 &
SERVER_PID=$!
echo "Server started (PID: $SERVER_PID)"

sleep 5

# Start Xvfb
Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
XVFB_PID=$!
echo "Xvfb started (PID: $XVFB_PID)"
export DISPLAY=:99

sleep 3

# Start Chromium directly (simpler than Puppeteer)
chromium-browser --no-sandbox --disable-dev-shm-usage --disable-gpu --kiosk --start-fullscreen --window-size=1920,1080 --force-device-scale-factor=1 --disable-infobars --no-first-run http://localhost:3000 > /tmp/chromium.log 2>&1 &
CHROME_PID=$!
echo "Chromium started (PID: $CHROME_PID)"

sleep 8

# Build music playlist
MUSIC_LIST=$(find music -name "*.mp3" -not -name "._*" | shuf | paste -sd "|")

# Start ffmpeg stream
ffmpeg -f x11grab -video_size 1920x1080 -framerate 30 -i :99.0 \
  -stream_loop -1 -i "concat:$MUSIC_LIST" \
  -filter_complex "[1:a]volume=0.3[a]" \
  -map 0:v -map "[a]" \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -b:v 2500k -maxrate 2500k -bufsize 10000k \
  -pix_fmt yuv420p -g 60 -keyint_min 60 \
  -c:a aac -b:a 128k -ar 44100 \
  -f flv "rtmp://a.rtmp.youtube.com/live2/xtbe-xjkv-1gsc-x4js-5m35" \
  > /tmp/ffmpeg.log 2>&1 &
FFMPEG_PID=$!
echo "ffmpeg started (PID: $FFMPEG_PID)"

echo "All processes started!"
echo "Server: $SERVER_PID | Xvfb: $XVFB_PID | Chrome: $CHROME_PID | ffmpeg: $FFMPEG_PID"
