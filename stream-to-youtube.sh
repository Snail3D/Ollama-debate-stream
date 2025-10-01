#!/bin/bash

YOUTUBE_KEY="141r-gbas-m3f6-x9xm-fdpj"
URL="http://localhost:3000"

# Kill old processes
pkill -9 Xvfb
pkill -9 firefox
pkill -9 chromium
pkill -9 ffmpeg

sleep 2

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
export DISPLAY=:99

sleep 3

# Open browser in kiosk mode with stability flags
chromium-browser --no-sandbox --disable-dev-shm-usage --disable-software-rasterizer --disable-gpu --disable-extensions --disable-background-networking --disable-sync --disable-translate --metrics-recording-only --no-first-run --safebrowsing-disable-auto-update --window-size=1920,1080 --kiosk $URL > /tmp/chromium.log 2>&1 &

sleep 8

# Build music file list
cd /root/ollama-debate-stream
MUSIC_LIST=$(ls music/*.mp3 | tr '\n' '|' | sed 's/|$//')

# Capture screen + loop music at 60% volume
ffmpeg -f x11grab -video_size 1920x1080 -framerate 30 -i :99.0 -stream_loop -1 -i "concat:$MUSIC_LIST" -filter_complex "[1:a]volume=0.6[a]" -map 0:v -map "[a]" -c:v libx264 -preset ultrafast -tune zerolatency -b:v 4500k -maxrate 4500k -bufsize 9000k -pix_fmt yuv420p -g 60 -keyint_min 60 -c:a aac -b:a 128k -ar 44100 -f flv "rtmp://a.rtmp.youtube.com/live2/$YOUTUBE_KEY"
