# Long-Term Stability Features

This system is designed to run hands-off for **years** without intervention.

## Memory Management

### Automatic Monitoring
- **Every 10 minutes**: Logs memory usage, array sizes
- **Format**: `📊 Memory: 73.2MB / 85.1MB | History: 10 | Chat: 50 | Queue: 3 | SuperChat: 1`

### Auto-Cleanup Thresholds
- **Chat messages**: Limited to 50 entries (oldest removed)
- **Debate history**: Limited to 50 entries (safety), trimmed to 20 if exceeded
- **YouTube message IDs**: Limited to 1000 entries
- **Emergency cleanup**: Triggers at 400MB heap usage

### Emergency Response
When memory exceeds 400MB:
1. Triggers Node.js garbage collection
2. Trims history to 10 entries
3. Trims chat to 30 entries
4. Logs all actions

## Error Handling

### Global Handlers
- **Uncaught exceptions**: Logged, doesn't crash
- **Unhandled promise rejections**: Logged, doesn't crash
- All errors include stack traces for debugging

### Stream Recovery
- **Watchdog script**: Checks FFmpeg every 30 seconds
- **Auto-restart**: If stream crashes, restarts within 30 seconds
- **Logs**: All restarts logged to `/tmp/stream-watchdog.log`

## Data Persistence

### State Files
- `debate-state.json`: Current debate state (~1.5KB)
- Saved after every turn
- Cleared between debates

### Log Rotation
- Server logs: `/tmp/server.log`
- Stream logs: `/tmp/stream-*.log`
- Watchdog logs: `/tmp/stream-watchdog.log`

## Process Management

### Node.js Server
- Auto-restarts on errors (error handlers prevent exit)
- YouTube chat reconnection on disconnect
- Groq API retries on failures

### Stream Processes
- FFmpeg: Monitored by watchdog
- Xvfb: Virtual display for headless rendering
- Puppeteer: Browser automation
- All auto-restart if killed

## Monitoring

### Key Metrics (logged every 10 minutes)
- Heap memory used/total
- Debate history size
- Chat message count
- Normal queue size
- SuperChat queue size

### Warning Indicators
- `⚠️ HIGH MEMORY USAGE` - Emergency cleanup triggered
- `⚠️ History exceeded 50 entries` - Safety limit hit
- `🚨 Uncaught Exception` - Error caught and logged
- `🚨 Unhandled Rejection` - Promise error caught

## Expected Resource Usage

### Normal Operation
- **Memory**: 50-100MB
- **CPU**: 1-5% (idle), 20-40% (during debates)
- **Disk**: <10MB for all state files
- **Network**: 6.8Mbps upload (stream), minimal download

### After 1 Year
- **Memory**: Should remain 50-100MB
- **Disk**: <50MB (logs rotate/overwrite)
- **No degradation expected**

## Maintenance

### Required: NONE
The system is fully autonomous.

### Optional Checks
- Stream uptime: Check YouTube Studio
- Memory usage: `ps aux | grep node`
- Watchdog status: `cat /tmp/stream-watchdog.log`

## Recovery Procedures

### Stream Down
1. Watchdog auto-restarts within 30 seconds
2. If still down, check YouTube stream key
3. Restart manually: `bash stream-to-youtube.sh`

### High Memory
1. System auto-cleans at 400MB
2. If persists, check for stuck debates
3. Restart server: `pkill -f node.*server.js && node server.js`

### Total Failure
All processes will auto-restart. Worst case:
```bash
# Kill everything
pkill -9 ffmpeg && pkill -9 Xvfb && pkill -f puppeteer && pkill -f node

# Start fresh
cd /root/ollama-debate-stream
bash stream-to-youtube.sh &
node server.js &
bash stream-watchdog.sh &
```

## Version History

- **v4.2.0**: Long-term stability improvements (memory monitoring, error handlers)
- **v4.1.7**: Stream watchdog for crash recovery
- **v4.0.6**: Auto-scroll fixes (stable)

Last updated: October 2025
