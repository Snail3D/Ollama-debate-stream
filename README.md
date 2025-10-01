# Eternal Terminal - 24/7 AI Debate Stream

🤖 **Two AI models debating autonomously, 24/7, live on YouTube**

Watch live: [YouTube Stream](https://youtube.com/@YourChannel)

## Features

- **Live AI vs AI Debates**: Two llama3.2:3b models debating various topics
- **Chat Interaction**: Viewers can suggest topics and influence debates
- **Topic Voting**: Community-driven topic selection
- **Super Chat Priority**: Priority queue for Super Chat topic requests
- **Auto-Recovery**: Automatic restart on crashes with state persistence
- **Health Monitoring**: Self-healing system checks every 2 minutes

## Tech Stack

- **AI**: Ollama (llama3.2:3b)
- **Backend**: Node.js + Express + WebSocket
- **Frontend**: Vanilla JavaScript
- **Streaming**: FFmpeg + RTMP to YouTube
- **Display**: Xvfb + Chromium (headless)
- **API**: YouTube Data API v3 with OAuth2

## Setup

### Prerequisites

- Ubuntu 22.04 (or similar)
- Node.js 20+
- Ollama with llama3.2:3b model
- FFmpeg
- Chromium browser
- YouTube account with API access

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Snail3D/ollama-debate-stream.git
cd ollama-debate-stream
```

2. **Install dependencies**
```bash
npm install
```

3. **Install system dependencies**
```bash
sudo apt-get update
sudo apt-get install -y xvfb chromium-browser ffmpeg
```

4. **Install Ollama and download model**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:3b
```

5. **Configure YouTube OAuth**
```bash
# Get OAuth credentials from Google Cloud Console
# Run setup script
./setup-youtube-oauth.sh
# Follow prompts to authorize
```

6. **Update config.json**
```json
{
  ollamaModel: llama3.2:3b,
  judgeModel: llama3.2:3b,
  ollamaUrl: http://localhost:11434,
  debateInterval: 30000,
  youtubeApiKey: YOUR_API_KEY,
  youtubeVideoId: YOUR_VIDEO_ID,
  port: 3000
}
```

7. **Run the application**
```bash
# Start the debate server
node server.js

# In another terminal, start streaming
./stream-to-youtube.sh
```

## Systemd Service (Production)

Create `/etc/systemd/system/eternal-debate.service`:

```ini
[Unit]
Description=Eternal Terminal Debate Stream
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/ollama-debate-stream
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable eternal-debate
sudo systemctl start eternal-debate
```

## Automatic Features

### State Persistence
The system saves debate state every 10 seconds to `debate-state.json`. On restart, it resumes from the last saved position.

### Auto Stream Creation
When a YouTube stream ends, the system automatically creates a new one via the YouTube API and updates the config.

### Health Monitoring
A cron job runs every 2 minutes to check:
- Node.js server health
- Xvfb display status
- Chromium browser stability
- FFmpeg streaming status
- RTMP connection to YouTube
- Memory usage

If any component fails, it's automatically restarted.

## Configuration

### Debate Interval
Adjust debate speed in `config.json`:
- `30000` = 30 seconds between turns (default)
- `60000` = 60 seconds between turns

### Streaming Quality
Edit `stream-to-youtube.sh`:
- Bitrate: `-b:v 4500k` (adjust for your bandwidth)
- Preset: `-preset ultrafast` (faster encoding, lower quality)
- Resolution: `1920x1080` (can reduce to 1280x720)

### Music Volume
Background music volume: `volume=0.6` (60%)

## Chat Commands

Viewers can interact via YouTube chat:

- **Regular messages**: Suggest debate topics
- **Super Chats**: Priority topic requests
- **Voting**: Participate in topic polls

## Architecture

```
┌─────────────┐
│  YouTube    │◄─── RTMP Stream ◄─── FFmpeg
│  Live API   │
└──────┬──────┘
       │ Chat Polling
       ▼
┌─────────────┐     WebSocket      ┌──────────────┐
│  Node.js    │◄──────────────────►│   Browser    │
│  Server     │                     │  (Chromium)  │
└──────┬──────┘                     └──────────────┘
       │                                   ▲
       ▼                                   │
┌─────────────┐                     ┌──────────────┐
│   Ollama    │                     │    Xvfb      │
│  llama3.2   │                     │  (Virtual    │
└─────────────┘                     │   Display)   │
                                    └──────────────┘
```

## Troubleshooting

### Stream shows black screen
- Check if Chromium is running: `ps aux | grep chromium`
- Check Chromium logs: `tail /tmp/chromium.log`
- Restart stream: `./stream-to-youtube.sh`

### AI not responding
- Check Ollama status: `systemctl status ollama`
- Test model: `ollama run llama3.2:3b test`
- Check server logs: `journalctl -u eternal-debate -f`

### Memory issues
- Reduce bitrate in streaming script
- Use smaller model: `gemma:2b` instead of `llama3.2:3b`
- Increase swap space

## Contributing

Pull requests welcome! Please ensure:
- Code follows existing style
- Test on a clean Ubuntu 22.04 install
- Update README if adding features

## License

MIT License - See LICENSE file

## Credits

- **AI Models**: Ollama (llama3.2:3b)
- **Music**: AI-generated ambient tracks
- **Streaming**: FFmpeg + YouTube Live
- **Creator**: [@Snail3D](https://github.com/Snail3D)

## Support

- GitHub Issues: [Report bugs](https://github.com/Snail3D/ollama-debate-stream/issues)
- YouTube: [Watch live](https://youtube.com/@YourChannel)
