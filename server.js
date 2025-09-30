import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static('public'));

// Load configuration
let config = {
  ollamaModel: 'llama2',
  judgeModel: 'llama2',
  ollamaUrl: 'http://localhost:11434',
  debateInterval: 15000, // 15 seconds between turns
  youtubeApiKey: '',
  youtubeVideoId: '',
  port: 3000
};

if (fs.existsSync('./config.json')) {
  config = { ...config, ...JSON.parse(fs.readFileSync('./config.json', 'utf8')) };
}

// Debate state
let debateState = {
  currentTopic: null,
  currentSide: 'pro',
  turnNumber: 0,
  history: [],
  mode: 'auto', // 'auto' or 'user'
  queue: [],
  isProcessing: false,
  moderatorMessage: null
};

// Content filter
import { ContentFilter } from './contentFilter.js';
const contentFilter = new ContentFilter();

// Topic generator
import { TopicGenerator } from './topicGenerator.js';
const topicGenerator = new TopicGenerator();

// YouTube chat monitor
import { YouTubeChatMonitor } from './youtubeChatMonitor.js';
let youtubeChatMonitor = null;

if (config.youtubeApiKey && config.youtubeVideoId) {
  youtubeChatMonitor = new YouTubeChatMonitor(
    config.youtubeApiKey,
    config.youtubeVideoId,
    handleYouTubeMessage
  );
}

// Handle YouTube chat messages
function handleYouTubeMessage(username, message) {
  const filterResult = contentFilter.checkTopic(message);

  if (!filterResult.allowed) {
    debateState.moderatorMessage = {
      type: 'rejected',
      username,
      message,
      reason: filterResult.reason,
      timestamp: Date.now()
    };
    broadcastState();

    // Clear moderator message after 10 seconds
    setTimeout(() => {
      if (debateState.moderatorMessage?.timestamp === filterResult.timestamp) {
        debateState.moderatorMessage = null;
        broadcastState();
      }
    }, 10000);
    return;
  }

  // Add to queue
  debateState.queue.push({
    topic: message,
    username,
    timestamp: Date.now()
  });

  debateState.moderatorMessage = {
    type: 'queued',
    username,
    message,
    position: debateState.queue.length,
    timestamp: Date.now()
  };

  broadcastState();

  // Clear moderator message after 5 seconds
  setTimeout(() => {
    if (debateState.moderatorMessage?.timestamp === debateState.queue[debateState.queue.length - 1]?.timestamp) {
      debateState.moderatorMessage = null;
      broadcastState();
    }
  }, 5000);
}

// Ollama API call with streaming
async function callOllamaStream(prompt, model, onChunk) {
  try {
    const response = await axios.post(`${config.ollamaUrl}/api/chat`, {
      model: model || config.ollamaModel,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: true
    }, {
      responseType: 'stream'
    });

    let fullResponse = '';

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              fullResponse += parsed.message.content;
              if (onChunk) {
                onChunk(parsed.message.content);
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });

      response.data.on('end', () => {
        resolve(fullResponse);
      });

      response.data.on('error', (error) => {
        console.error('Stream error:', error.message);
        reject(error);
      });
    });
  } catch (error) {
    console.error('Ollama API error:', error.message);
    return null;
  }
}

// Non-streaming Ollama call (for judge)
async function callOllama(prompt, model) {
  try {
    const response = await axios.post(`${config.ollamaUrl}/api/chat`, {
      model: model || config.ollamaModel,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      stream: false
    });
    return response.data.message.content;
  } catch (error) {
    console.error('Ollama API error:', error.message);
    if (error.response?.data) {
      console.error('Error details:', JSON.stringify(error.response.data));
    }
    return null;
  }
}

// Generate debate response
function generateDebateResponse(topic, side, turnNumber, previousArguments) {
  const role = side === 'pro' ? 'supporting' : 'opposing';
  const opponent = side === 'pro' ? 'opposition' : 'proponent';

  let prompt = `You are participating in a formal debate. The topic is: "${topic}"

You are arguing the ${role} side.
This is turn ${turnNumber} of the debate.

IMPORTANT DEBATE RULES:
1. Present clear, logical arguments
2. Use facts and reasoning (you can use hypothetical examples)
3. Address the opponent's points constructively
4. Keep responses between 2-4 sentences
5. Be respectful and professional
6. Stay on topic
7. Do not use inflammatory language
8. Build on previous arguments when appropriate
9. WAIT FOR YOUR TURN - Only speak when it's your turn to argue
10. Do NOT interrupt or speak out of turn

`;

  if (previousArguments.length > 0) {
    prompt += `\nPrevious arguments in this debate:\n`;
    previousArguments.slice(-4).forEach(arg => {
      prompt += `${arg.side.toUpperCase()}: ${arg.text}\n`;
    });
  }

  if (turnNumber === 1) {
    prompt += `\nAs the ${role} side, present your opening argument.`;
  } else {
    prompt += `\nRespond to the ${opponent}'s argument and present your next point.`;
  }

  prompt += `\n\nProvide ONLY your argument, nothing else:`;

  return prompt; // Return the prompt for use with streaming
}

// Judge the debate winner
async function judgeDebate(topic, history) {
  const proArgs = history.filter(h => h.side === 'pro').map(h => h.text).join('\n\n');
  const conArgs = history.filter(h => h.side === 'con').map(h => h.text).join('\n\n');

  const judgePrompt = `You are an impartial debate judge. Analyze the following debate and determine the winner.

DEBATE TOPIC: "${topic}"

PRO ARGUMENTS:
${proArgs}

CON ARGUMENTS:
${conArgs}

Based on:
1. Strength of arguments
2. Use of logic and reasoning
3. How well they addressed the topic
4. Quality of rebuttals

Respond in this EXACT format:
WINNER: [PRO or CON]
REASON: [One clear sentence explaining why they won]

Provide ONLY the format above, nothing else.`;

  const response = await callOllama(judgePrompt, config.judgeModel);

  if (!response) {
    return { winner: 'pro', reason: 'Debate concluded.' };
  }

  // Parse the response
  const winnerMatch = response.match(/WINNER:\s*(PRO|CON)/i);
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

  const winner = winnerMatch ? winnerMatch[1].toLowerCase() : 'pro';
  const reason = reasonMatch ? reasonMatch[1].trim() : 'Debate concluded.';

  return { winner, reason };
}

// Main debate loop
async function debateLoop() {
  console.log('Debate loop triggered. isProcessing:', debateState.isProcessing);
  if (debateState.isProcessing) return;

  debateState.isProcessing = true;
  console.log('Starting debate turn...');

  // Check if we need a new topic
  if (!debateState.currentTopic) {
    console.log('Creating new debate topic...');
    // Check queue first
    if (debateState.queue.length > 0) {
      const userRequest = debateState.queue.shift();
      debateState.currentTopic = userRequest.topic;
      debateState.mode = 'user';
      debateState.moderatorMessage = {
        type: 'starting',
        username: userRequest.username,
        message: userRequest.topic,
        timestamp: Date.now()
      };
    } else {
      // Auto mode - generate topic
      debateState.currentTopic = topicGenerator.generateTopic();
      debateState.mode = 'auto';
    }

    console.log('Topic:', debateState.currentTopic);

    // Randomly select who goes first
    debateState.currentSide = Math.random() < 0.5 ? 'pro' : 'con';
    debateState.turnNumber = 0;
    debateState.history = [];

    console.log('Random selection:', debateState.currentSide, 'goes first');

    broadcastState();

    // Small pause before first argument
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Generate response
  debateState.turnNumber++;
  console.log(`Generating argument for ${debateState.currentSide}, turn ${debateState.turnNumber}`);

  const prompt = generateDebateResponse(
    debateState.currentTopic,
    debateState.currentSide,
    debateState.turnNumber,
    debateState.history
  );

  console.log('Calling Ollama...');
  const response = await callOllama(prompt, config.ollamaModel);
  console.log('Ollama response received:', response ? 'success' : 'failed');

  if (response) {
    debateState.history.push({
      side: debateState.currentSide,
      text: response,
      turn: debateState.turnNumber,
      timestamp: Date.now(),
      isNew: true  // Mark as new for typewriter effect
    });

    // Broadcast immediately so the response shows up
    broadcastState();

    // Wait longer before switching sides to ensure proper turn-by-turn flow
    // This allows the frontend typewriter effect to complete
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Switch sides
    debateState.currentSide = debateState.currentSide === 'pro' ? 'con' : 'pro';
  }

  // End debate after 10 turns and judge the winner
  if (debateState.turnNumber >= 10) {
    const result = await judgeDebate(debateState.currentTopic, debateState.history);

    // Broadcast winner
    broadcastToAll({
      type: 'winner',
      winner: result.winner,
      reason: result.reason
    });

    // Wait 10 seconds before starting new debate
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Clear debate state
    debateState.currentTopic = null;
    debateState.history = [];
    debateState.turnNumber = 0;

    // Clear arguments on frontend
    broadcastState();
  }

  debateState.isProcessing = false;
  broadcastState();
}

// Broadcast any data to all connected clients
function broadcastToAll(data) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(data));
    }
  });
}

// Broadcast state to all connected clients
function broadcastState() {
  const state = {
    topic: debateState.currentTopic,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history,
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    moderatorMessage: debateState.moderatorMessage
  };

  broadcastToAll(state);
}

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state
  ws.send(JSON.stringify({
    topic: debateState.currentTopic,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history,
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    moderatorMessage: debateState.moderatorMessage
  }));

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// API endpoints
app.post('/api/submit-topic', (req, res) => {
  const { username, message } = req.body;
  handleYouTubeMessage(username || 'Anonymous', message);
  res.json({ success: true });
});

app.get('/api/state', (req, res) => {
  res.json({
    topic: debateState.currentTopic,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history,
    mode: debateState.mode,
    queueLength: debateState.queue.length
  });
});

// Start debate loop
setInterval(debateLoop, config.debateInterval);

// Start server
server.listen(config.port, () => {
  console.log(`Debate stream server running on http://localhost:${config.port}`);
  console.log(`Make sure Ollama is running on ${config.ollamaUrl}`);
  if (youtubeChatMonitor) {
    console.log('YouTube chat monitoring enabled');
    youtubeChatMonitor.start();
  }
});