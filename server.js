import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import net from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if port is already in use
function checkPortInUse(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        tester.once('close', () => resolve(false)).close();
      })
      .listen(port);
  });
}

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
  moderatorMessage: null,
  chatMessages: [] // YouTube chat messages
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

// Handle all YouTube chat messages for display
function handleChatMessage(username, text) {
  console.log(`Chat message from ${username}: ${text}`);
  debateState.chatMessages.push({
    username,
    text,
    timestamp: Date.now()
  });

  // Keep only last 50 messages
  if (debateState.chatMessages.length > 50) {
    debateState.chatMessages = debateState.chatMessages.slice(-50);
  }

  console.log(`Total chat messages: ${debateState.chatMessages.length}`);
  broadcastState();
}

if (config.youtubeApiKey && config.youtubeVideoId) {
  youtubeChatMonitor = new YouTubeChatMonitor(
    config.youtubeApiKey,
    config.youtubeVideoId,
    handleYouTubeMessage,
    handleChatMessage
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
    }, {
      timeout: 120000 // 2 minute timeout
    });
    console.log('Ollama response length:', response.data.message.content.length, 'characters');
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

  // Define distinct personalities
  let personality;
  if (side === 'pro') {
    // PRO: Optimistic, passionate, emotional, uses exclamations
    const proStyles = [
      'enthusiastic and hopeful - use exclamations and positive energy',
      'fiery and righteous - speak with moral conviction',
      'inspiring and motivational - rally people to your cause'
    ];
    personality = proStyles[turnNumber % proStyles.length];
  } else {
    // CON: Skeptical, sarcastic, analytical, condescending
    const conStyles = [
      'skeptical and sarcastic - use mockery and rhetorical questions',
      'coldly analytical - dissect arguments with logic',
      'dismissive and condescending - act superior and frustrated'
    ];
    personality = conStyles[turnNumber % conStyles.length];
  }

  let prompt = `Debate: "${topic}"

You argue ${role}. Turn ${turnNumber}.
PERSONALITY: Be ${personality}

Make your response reflect this personality strongly. Challenge opponent aggressively.
MAXIMUM 3 sentences. Be intense and authentic to your personality.

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

    // Clear moderator message after 5 seconds
    setTimeout(() => {
      console.log('Clearing moderator message...');
      debateState.moderatorMessage = null;
      broadcastState();
      console.log('Moderator message cleared');
    }, 5000);

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

    // Wait before switching sides
    await new Promise(resolve => setTimeout(resolve, 3000));

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
    history: debateState.history, // Keep isNew flags for typewriter effect
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    moderatorMessage: debateState.moderatorMessage,
    chatMessages: debateState.chatMessages
  };

  broadcastToAll(state);
}

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('Client connected');

  // Send current state - remove isNew flags so existing arguments don't re-type on refresh
  ws.send(JSON.stringify({
    topic: debateState.currentTopic,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history.map(h => ({ ...h, isNew: false })),
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    moderatorMessage: debateState.moderatorMessage,
    chatMessages: debateState.chatMessages
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

// Start debate loop - run first debate immediately, then every interval
debateLoop();
setInterval(debateLoop, config.debateInterval);

// Start server with port check
const portInUse = await checkPortInUse(config.port);
if (portInUse) {
  console.error(`\n❌ ERROR: Port ${config.port} is already in use!`);
  console.error(`Another instance of the server is already running.`);
  console.error(`Please stop the other instance first or use a different port.\n`);
  process.exit(1);
}

server.listen(config.port, () => {
  console.log(`Debate stream server running on http://localhost:${config.port}`);
  console.log(`Make sure Ollama is running on ${config.ollamaUrl}`);
  if (youtubeChatMonitor) {
    console.log('YouTube chat monitoring enabled');
    youtubeChatMonitor.start();
  }
});