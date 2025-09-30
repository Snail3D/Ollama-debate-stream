# Ollama Debate Stream

An automated AI debate system powered by Ollama with YouTube chat integration for live streaming.

## Features

- ✅ Automated debates between PRO and CON sides using Ollama
- ✅ Proper debate rules and structure (10 turns per debate)
- ✅ Content filtering (blocks sensitive topics: religion, sex, violence, etc.)
- ✅ YouTube chat integration with priority queue system
- ✅ Auto-mode with curated safe topics when no user requests
- ✅ Beautiful web UI optimized for OBS streaming
- ✅ Real-time WebSocket updates
- ✅ Request rejection notifications with reasons
- ✅ Queue status display

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Ollama** installed and running
   - Install from: https://ollama.ai
   - Pull a model: `ollama pull llama2`
3. **YouTube Data API key** (optional, for chat integration)
   - Get one from: https://console.cloud.google.com/

## Installation

1. Navigate to the project directory:
```bash
cd ollama-debate-stream
```

2. Install dependencies:
```bash
npm install
```

3. Create configuration file:
```bash
cp config.example.json config.json
```

4. Edit `config.json` with your settings:
```json
{
  "ollamaModel": "llama2",
  "ollamaUrl": "http://localhost:11434",
  "debateInterval": 15000,
  "youtubeApiKey": "YOUR_API_KEY_HERE",
  "youtubeVideoId": "YOUR_VIDEO_ID_HERE",
  "port": 3000
}
```

## Configuration

### Basic Settings

- `ollamaModel`: The Ollama model to use (e.g., "llama2", "mistral", "gemma")
- `ollamaUrl`: URL where Ollama is running (default: http://localhost:11434)
- `debateInterval`: Time in milliseconds between debate turns (default: 15000 = 15 seconds)
- `port`: Port for the web server (default: 3000)

### YouTube Integration (Optional)

To enable YouTube chat integration:

1. Create a Google Cloud project
2. Enable YouTube Data API v3
3. Create an API key
4. Get your live stream video ID from the URL: `youtube.com/watch?v=VIDEO_ID`
5. Add both to `config.json`

**Note:** YouTube chat integration requires an active live stream. The system will work in auto-mode without it.

## Usage

### Starting the Server

1. Make sure Ollama is running:
```bash
ollama serve
```

2. Start the debate server:
```bash
npm start
```

3. Open your browser to: `http://localhost:3000`

### For OBS Streaming

1. Start the server
2. In OBS, add a **Browser Source**
3. Set URL to: `http://localhost:3000`
4. Recommended resolution: 1920x1080
5. Enable "Shutdown source when not visible" (optional)
6. Click OK

### YouTube Chat Commands

Viewers can submit debate topics using:
```
!debate Should pineapple be on pizza?
```

The system will:
- Filter the topic for sensitive content
- Show acceptance/rejection message with reason
- Add to queue if approved
- Process in order when current debate finishes

## How It Works

### Debate Flow

1. **Topic Selection**:
   - Checks queue for user requests first
   - Falls back to auto-generated safe topics if queue is empty

2. **Debate Process**:
   - 10 turns total (5 per side)
   - Each side presents arguments
   - AI responds to opponent's points
   - Follows formal debate structure

3. **Content Filtering**:
   - Blocks sensitive topics (religion, violence, sexual content, etc.)
   - Shows rejection reason to user
   - Length validation (5-200 characters)

### Modes

- **AUTO MODE**: System generates safe topics automatically
- **USER REQUEST MODE**: Processing topics from YouTube chat queue

## Customization

### Adding Topics

Edit `topicGenerator.js` to add more auto-mode topics:

```javascript
this.topics = [
  "Your new debate topic here?",
  // ... more topics
];
```

### Adjusting Content Filter

Edit `contentFilter.js` to modify blocked keywords:

```javascript
this.blockedKeywords = [
  'keyword1',
  'keyword2',
  // ...
];
```

### Changing Debate Length

Modify the turn limit in `server.js`:

```javascript
// End debate after 10 turns
if (debateState.turnNumber >= 10) {
  debateState.currentTopic = null;
}
```

### Styling

Edit `public/style.css` to customize the appearance for your stream.

## Troubleshooting

### "Cannot connect to Ollama"
- Ensure Ollama is running: `ollama serve`
- Check the `ollamaUrl` in config.json
- Verify the model is installed: `ollama list`

### "YouTube chat not working"
- Verify your API key is correct
- Check the video ID matches your live stream
- Ensure the stream is currently live
- Check console logs for specific errors

### "Debates not starting"
- Check Ollama is responding: `curl http://localhost:11434/api/tags`
- Verify the model name in config.json matches installed models
- Check server console for error messages

### "WebSocket disconnected"
- Server may have crashed - check console
- Restart the server: `npm start`
- Browser will auto-reconnect every 3 seconds

## API Endpoints

- `GET /` - Main web interface
- `GET /api/state` - Get current debate state (JSON)
- `POST /api/submit-topic` - Submit a topic manually
- `WS /` - WebSocket for real-time updates

## Performance Tips

1. **Faster responses**: Use a smaller model like `phi` or `gemma`
2. **Longer debates**: Increase turn limit in server.js
3. **Faster turns**: Decrease `debateInterval` in config.json
4. **Less lag**: Reduce browser source resolution in OBS

## License

ISC

## Credits

Built with:
- [Ollama](https://ollama.ai) - AI inference
- [Express](https://expressjs.com) - Web server
- [ws](https://github.com/websockets/ws) - WebSocket support
- [YouTube Data API](https://developers.google.com/youtube/v3) - Chat integration