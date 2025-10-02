#!/bin/bash

# Watchdog script for eternal-debate stream
LOG="/var/log/watchdog.log"

echo "[$(date)] Watchdog check starting..." >> "$LOG"

# 1. Check if server is responding
if ! curl -s --max-time 5 http://localhost:3000 > /dev/null; then
  echo "[$(date)] Server not responding, restarting..." >> "$LOG"
  killall -9 node
  sleep 3
  cd /root/ollama-debate-stream
  node server.js >> /var/log/eternal-debate.log 2>&1 &
  sleep 5
fi

# 2. Check if Ollama is running and responsive
if ! pgrep -x "ollama" > /dev/null; then
  echo "[$(date)] Ollama not running, restarting..." >> "$LOG"
  systemctl restart ollama
  sleep 5
elif ! timeout 10 curl -s http://localhost:11434/api/tags > /dev/null; then
  echo "[$(date)] Ollama not responding, restarting..." >> "$LOG"
  systemctl restart ollama
  sleep 5
fi

# 3. Check if Xvfb is running
if ! pgrep -x "Xvfb" > /dev/null; then
  echo "[$(date)] Xvfb not running, restarting stream..." >> "$LOG"
  cd /root/ollama-debate-stream
  bash stream-to-youtube.sh > /tmp/stream.log 2>&1 &
  sleep 10
fi

# 4. Check if ffmpeg is streaming
if ! pgrep -f "ffmpeg.*rtmp" > /dev/null; then
  echo "[$(date)] ffmpeg not streaming, restarting..." >> "$LOG"
  killall -9 ffmpeg Xvfb chrome
  cd /root/ollama-debate-stream
  bash stream-to-youtube.sh > /tmp/stream.log 2>&1 &
  sleep 10
fi

echo "[$(date)] Watchdog complete" >> "$LOG"
