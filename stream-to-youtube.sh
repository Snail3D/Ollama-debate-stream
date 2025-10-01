#!/bin/bash

YOUTUBE_KEY="141r-gbas-m3f6-x9xm-fdpj"
URL="http://localhost:3000"

# Kill old processes
pkill -f Xvfb
pkill -f chromium
pkill -f ffmpeg

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

sleep 2

# Open browser in kiosk mode
chromium-browser --no-sandbox --window-size=1920,1080 --kiosk --disable-gpu $URL &

sleep 5

# Build music file list
cd /root/ollama-debate-stream
MUSIC_LIST=$(ls music/*.mp3 | tr '\n' '|' | sed 's/$//')

# Capture screen + loop music at 60% volume and stream to YouTube with CONSTANT bitrate
ffmpeg -f x11grab -video_size 1920x1080 -framerate 30 -i :99.0   -stream_loop -1 -i "concat:$MUSIC_LIST"   -filter_complex "[1:a]volume=0.6[a]"   -map 0:v -map "[a]"   -c:v libx264 -preset veryfast -b:v 6800k -minrate 6800k -maxrate 6800k -bufsize 13600k   -pix_fmt yuv420p -g 60 -keyint_min 60   -c:a aac -b:a 160k -ar 44100   -f flv "rtmp://a.rtmp.youtube.com/live2/$YOUTUBE_KEY"
