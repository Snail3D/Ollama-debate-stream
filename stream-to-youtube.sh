#!/bin/bash

YOUTUBE_KEY="xtbe-xjkv-1gsc-x4js-5m35"
URL="http://localhost:3000"

# Kill old processes
pkill -9 Xvfb
pkill -9 firefox
pkill -9 chromium
pkill -9 ffmpeg
pkill -f puppeteer-capture.cjs

sleep 2

# Start virtual display at 720p for better performance
Xvfb :99 -screen 0 1920x1080x24 > /dev/null 2>&1 &
export DISPLAY=:99

sleep 3

# Start Puppeteer browser (much more stable than raw Chromium)
cd /root/ollama-debate-stream
node puppeteer-capture.cjs > /tmp/puppeteer.log 2>&1 &

sleep 12

# Build music file list with randomized order
MUSIC_LIST=$(find music -name "*.mp3" -not -name "._*" -not -name "._*" | shuf | paste -sd "|")

# Capture screen + loop music at 60% volume with lower bitrate for stability
ffmpeg -f x11grab -video_size 1920x1080 -framerate 30 -i :99.0 -stream_loop -1 -i "concat:$MUSIC_LIST" -filter_complex "[1:a]volume=0.6[a]" -map 0:v -map "[a]" -c:v libx264 -preset ultrafast -tune zerolatency -b:v 2500k -maxrate 2500k -bufsize 10000k -pix_fmt yuv420p -g 60 -keyint_min 60 -c:a aac -b:a 128k -ar 44100 -f flv "rtmp://a.rtmp.youtube.com/live2/$YOUTUBE_KEY"
