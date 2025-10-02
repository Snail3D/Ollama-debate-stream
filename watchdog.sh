#!/bin/bash

# Check if server is running
if ! pgrep -f "node.*server.js" > /dev/null; then
    echo "[$(date)] Server down, restarting..." >> /var/log/eternal-watchdog.log
    cd /root/ollama-debate-stream
    node server.js > /var/log/eternal-debate.log 2>&1 &
    sleep 10
fi

# Check if Puppeteer browser is running
if ! pgrep -f "chrome.*puppeteer" > /dev/null; then
    echo "[$(date)] Puppeteer down, restarting..." >> /var/log/eternal-watchdog.log
    cd /root/ollama-debate-stream
    pkill -9 -f puppeteer 2>/dev/null
    node puppeteer-capture.cjs > /tmp/puppeteer.log 2>&1 &
    sleep 10
fi

# Check if stream (ffmpeg) is running
if ! pgrep -f "ffmpeg.*rtmp" > /dev/null; then
    echo "[$(date)] Stream down, restarting..." >> /var/log/eternal-watchdog.log
    cd /root/ollama-debate-stream
    pkill -9 -f Xvfb 2>/dev/null
    pkill -9 -f ffmpeg 2>/dev/null
    sleep 3
    bash stream-to-youtube.sh > /var/log/eternal-stream.log 2>&1 &
fi
