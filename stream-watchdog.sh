#!/bin/bash

LOG_FILE="/tmp/stream-watchdog.log"
STREAM_SCRIPT="/root/ollama-debate-stream/stream-to-youtube.sh"

echo "$(date) - Stream watchdog started" >> $LOG_FILE

while true; do
    # Check if FFmpeg is running
    if ! pgrep -f "ffmpeg.*141r" > /dev/null; then
        echo "$(date) - ERROR: Stream not running! Restarting..." >> $LOG_FILE
        
        # Kill any stuck processes
        pkill -9 ffmpeg 2>/dev/null
        pkill -9 Xvfb 2>/dev/null
        pkill -f puppeteer 2>/dev/null
        
        sleep 3
        
        # Restart stream
        cd /root/ollama-debate-stream
        bash stream-to-youtube.sh > /tmp/stream-auto-restart.log 2>&1 &
        
        echo "$(date) - Stream restarted by watchdog" >> $LOG_FILE
        
        # Wait before checking again
        sleep 60
    fi
    
    # Check every 30 seconds
    sleep 30
done
