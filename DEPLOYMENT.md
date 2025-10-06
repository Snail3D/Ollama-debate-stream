# Eternal Terminal - Deployment Guide

## 🚀 Quick Start

All configuration is now centralized in the `.env` file. This is the **single source of truth** for all settings.

### Updating Configuration

1. **Edit `.env` file** with your settings
2. **Run deployment script:**
   ```bash
   ./deploy.sh
   ```

That's it! The script automatically:
- Copies `.env` to the server
- Deploys updated code
- Restarts the server
- Shows current configuration

## 📝 Configuration Variables

Edit `.env` to update these values:

```bash
# Groq API for AI debate generation
GROQ_API_KEY=your_groq_api_key_here

# YouTube Data API v3 for live chat integration
YOUTUBE_API_KEY=your_youtube_api_key_here

# YouTube Video ID (from youtube.com/watch?v=VIDEO_ID)
YOUTUBE_VIDEO_ID=your_video_id_here
```

## 🎬 YouTube Stream Setup

When changing YouTube streams:

1. **Get new stream key** from YouTube Studio
2. **Update `.env`** with new `YOUTUBE_VIDEO_ID`
3. **Update stream script:**
   ```bash
   # On server: /root/ollama-debate-stream/stream-to-youtube.sh
   YOUTUBE_KEY="your-new-stream-key"
   ```
4. **Deploy and restart stream:**
   ```bash
   ./deploy.sh --stream-restart
   ```

## 🔧 Deployment Options

```bash
# Full deployment (code + config + restart)
./deploy.sh

# Config only (faster, no code changes)
./deploy.sh --config-only

# Full deployment + restart YouTube stream
./deploy.sh --stream-restart
```

## 📍 Important Files

| File | Purpose | Update When |
|------|---------|------------|
| `.env` | All configuration | Any setting changes |
| `server.js` | Main server code | Code changes |
| `public/style.css` | Stream styling | UI changes |
| `stream-to-youtube.sh` | Stream script (on server) | Stream key changes |

## ⚠️ Troubleshooting

### YouTube Chat Not Working
1. Verify stream is LIVE (not just receiving video)
2. Check `YOUTUBE_VIDEO_ID` matches active stream
3. Restart server: `./deploy.sh --config-only`

### Stream Not Connecting
1. Verify stream key matches YouTube Studio
2. Update `stream-to-youtube.sh` on server
3. Restart stream: `./deploy.sh --stream-restart`

### Personality Names Not Showing
1. Delete saved state: `ssh root@45.33.13.140 "rm /root/ollama-debate-stream/debate-state.json"`
2. Restart server: `./deploy.sh --config-only`

## 🗑️ Deprecated Files

**DO NOT USE:**
- `config.json` - Deleted, use `.env` instead
- Multiple config files cause conflicts

## 🔄 Manual Deployment (if script fails)

```bash
# 1. Copy .env
scp .env root@45.33.13.140:/root/ollama-debate-stream/.env

# 2. Copy code
scp server.js root@45.33.13.140:/root/ollama-debate-stream/
scp -r public/* root@45.33.13.140:/root/ollama-debate-stream/public/

# 3. Restart server
ssh root@45.33.13.140 "cd /root/ollama-debate-stream && pm2 restart eternal-terminal --update-env"

# 4. Restart stream (if needed)
ssh root@45.33.13.140 'pkill -9 ffmpeg && pkill -9 Xvfb && pkill -f puppeteer && sleep 3 && cd /root/ollama-debate-stream && bash stream-to-youtube.sh > /tmp/stream.log 2>&1 &'
```

## 📊 Monitoring

Check stream status:
```bash
ssh root@45.33.13.140 "pm2 logs eternal-terminal --lines 50"
```

Check if stream is broadcasting:
```bash
ssh root@45.33.13.140 'ps aux | grep ffmpeg | grep -v grep'
```

## 🎯 Stream URL

After deployment, your stream will be at:
`https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}`

Current: https://www.youtube.com/watch?v=nY50iThz99w
