#\!/bin/bash

# Watchdog script for eternal-debate stream
# Checks server, Ollama, streaming components and restarts if needed

LOG="/var/log/watchdog.log"

echo "[$(date)] Watchdog check starting..." >> "$LOG"

# 1. Check if eternal-debate service is running
if \! systemctl is-active --quiet eternal-debate; then
  echo "[$(date)] eternal-debate service is down, restarting..." >> "$LOG"
  systemctl restart eternal-debate
  sleep 5
fi

# 2. Check if server is responding on port 3000
if \! curl -s --max-time 5 http://localhost:3000 > /dev/null; then
  echo "[$(date)] Server not responding on port 3000, restarting..." >> "$LOG"
  systemctl restart eternal-debate
  sleep 5
fi

# 3. Check if Ollama is running
if \! pgrep -x "ollama" > /dev/null; then
  echo "[$(date)] Ollama is not running, starting..." >> "$LOG"
  systemctl restart ollama || (ollama serve > /dev/null 2>&1 &)
  sleep 3
fi

# 4. Check if Xvfb is running
if \! pgrep -x "Xvfb" > /dev/null; then
  echo "[$(date)] Xvfb is not running, restarting stream..." >> "$LOG"
  cd /root/ollama-debate-stream
  killall -9 ffmpeg chrome node 2>/dev/null
  sleep 3
  bash stream-to-youtube.sh > /tmp/stream.log 2>&1 &
  sleep 10
fi

# 5. Check if ffmpeg is streaming
if \! pgrep -f "ffmpeg.*rtmp" > /dev/null; then
  echo "[$(date)] ffmpeg not streaming, restarting stream..." >> "$LOG"
  cd /root/ollama-debate-stream  
  killall -9 ffmpeg Xvfb chrome node 2>/dev/null
  sleep 3
  bash stream-to-youtube.sh > /tmp/stream.log 2>&1 &
  sleep 10
fi

# 6. Check if Puppeteer/Chrome is running
if \! pgrep -f "puppeteer-capture" > /dev/null; then
  echo "[$(date)] Puppeteer not running, restarting..." >> "$LOG"
  cd /root/ollama-debate-stream
  DISPLAY=:99 nohup node puppeteer-capture.cjs > /tmp/puppeteer.log 2>&1 &
  sleep 5
fi

echo "[$(date)] Watchdog check complete" >> "$LOG"
