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
  ollamaModel: 'gemma3:1b',
  judgeModel: 'gemma3:1b',
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
  superChatQueue: [], // Separate queue for superchats
  isProcessing: false,
  moderatorMessage: null,
  chatMessages: [], // YouTube chat messages
  debateCounter: 0 // Total debates completed
};

// Load saved state if exists
const STATE_FILE = './debate-state.json';
if (fs.existsSync(STATE_FILE)) {
  try {
    const savedState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    debateState = { ...debateState, ...savedState };
    console.log('✅ Loaded debate state from disk - resuming from turn', debateState.turnNumber);
  } catch (err) {
    console.log('⚠️ Could not load saved state:', err.message);
  }
}

// Save state to disk periodically and on changes
function saveDebateState() {
  try {
    const stateToSave = {
      currentTopic: debateState.currentTopic,
      currentSide: debateState.currentSide,
      turnNumber: debateState.turnNumber,
      history: debateState.history,
      mode: debateState.mode,
      queue: debateState.queue,
      superChatQueue: debateState.superChatQueue,
      debateCounter: debateState.debateCounter
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateToSave, null, 2));
  } catch (err) {
    console.error('⚠️ Could not save state:', err.message);
  }
}

// Auto-save every 10 seconds
setInterval(saveDebateState, 10000);

// Content filter
import { ContentFilter } from './contentFilter.js';
const contentFilter = new ContentFilter();

// Topic generator
import { TopicGenerator } from './topicGenerator.js';
const topicGenerator = new TopicGenerator();

// YouTube chat monitor
import { YouTubeChatMonitor } from './youtubeChatMonitor.js';
let youtubeChatMonitor = null;

// Track seen usernames with timestamps for 48-hour detection
const seenUsernames = new Map(); // username -> last seen timestamp

// Clean up old usernames (older than 48 hours) every hour
setInterval(() => {
  const fortyEightHoursAgo = Date.now() - (48 * 60 * 60 * 1000);
  for (const [username, timestamp] of seenUsernames.entries()) {
    if (timestamp < fortyEightHoursAgo) {
      seenUsernames.delete(username);
    }
  }
  console.log(`Cleaned up old usernames. Currently tracking: ${seenUsernames.size}`);
}, 3600000); // 1 hour

// Bot announcement hooks - variety of phrases
const botHooks = {
  superChatPromo: [
    '💰 Want instant debate priority? Use SUPERCHAT to skip the queue!',
    '🔥 SUPERCHATS get immediate attention - your debate starts NOW!',
    '⚡ Skip the line! SUPERCHATS interrupt current debates instantly!',
    '💸 Got a burning question? SUPERCHAT for instant debate priority!',
    '🎯 SUPERCHATS = Instant priority! No waiting, just debating!',
    '💎 Premium priority! SUPERCHAT to start your debate immediately!',
    '🚀 SUPERCHATS launch debates instantly - no queue, no wait!',
    '👑 VIP treatment! SUPERCHAT to cancel current debate & start yours!',
    '⭐ Want the spotlight? SUPERCHAT for immediate debate action!',
    '💥 SUPERCHATS = Instant debates! Cut the line, start the discussion!'
  ],
  debateStart: [
    '🎙️ DEBATE #{count}: "{topic}" ({mode})',
    '🔴 LIVE NOW - DEBATE #{count}: {topic} ({mode})',
    '⚔️ New debate #{count} starting: "{topic}" ({mode})',
    '🎬 Rolling! Debate #{count}: {topic} ({mode})',
    '📣 Debate #{count} begins: "{topic}" ({mode})',
    '🌟 Next up - Debate #{count}: {topic} ({mode})'
  ],
  instructions: [
    '💬 Use !debate [your question] to join the queue | 💰 SUPERCHATS skip ahead!',
    '📝 Type !debate [question] to queue up | 💸 SUPERCHAT for instant priority!',
    '✍️ Submit !debate [topic] to get in line | ⚡ SUPERCHATS go first!',
    '💭 Queue your debate with !debate [question] | 🔥 SUPERCHAT = instant start!',
    '🎤 Join queue: !debate [your topic] | 💎 SUPERCHAT = no waiting!'
  ],
  coolMessages: [
    '🤖 Beep boop! AI debates are powered by local LLMs - no cloud needed!',
    '🧠 Did you know? These debates use gemma3:1b running on Ollama!',
    '⚡ Fun fact: Each argument takes about 2-3 seconds to generate!',
    '🎭 The AI judge picks winners based on logic, evidence, and persuasiveness!',
    '🌟 Loving the debates? Drop a like and subscribe for more AI battles!',
    '🔥 These AIs never get tired - they can debate 24/7!',
    '💭 Pro tip: More specific debate topics = better arguments!',
    '🎯 The AI analyzes previous arguments to build stronger cases!',
    '🚀 Each debate runs for 10 rounds before the judge decides!',
    '🤯 Mind blown yet? This is all happening in real-time!',
    '💡 Want to see YOUR question debated? Use !debate [your topic]!',
    '🎪 Welcome to the AI debate arena - where silicon meets rhetoric!',
    '⚔️ May the best argument win! These AIs show no mercy!',
    '🌐 Running live from a Linode server streaming to YouTube!',
    '🎬 Lights, camera, DEBATE! Another round of AI vs AI!',
    '🔮 The future is now - watching AIs debate philosophy!',
    '💪 These language models are flexing their reasoning skills!',
    '🎲 Random topics or user requests - both get epic debates!',
    '🏆 After 10 rounds, an AI judge crowns the champion!',
    '✨ The magic of machine learning in action!'
  ],
  newUserWelcome: [
    '👋 Welcome @{username}! Type !debate [your question] to join the debate queue! 💬',
    '🎉 Hey @{username}! Want to see YOUR topic debated? Use !debate [topic] and we\'ll queue it up! ⚡',
    '🌟 Welcome @{username}! Submit !debate [question] to queue your debate topic! 🎯',
    '👏 @{username} just joined! Try !debate [any topic] to start an AI debate! 🤖',
    '🚀 Welcome aboard @{username}! Use !debate [your topic] to get in the queue! Regular queue or SUPERCHAT for instant priority! 💰'
  ]
};

// Get random hook from category
function getRandomHook(category) {
  const hooks = botHooks[category];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

// Bot chat responses
function postBotMessage(text) {
  debateState.chatMessages.push({
    username: '[BOT]',
    text,
    timestamp: Date.now()
  });

  // Keep only last 50 messages
  if (debateState.chatMessages.length > 50) {
    debateState.chatMessages = debateState.chatMessages.slice(-50);
  }

  console.log(`Bot message: ${text}`);
  broadcastState();
}

// Periodic superchat promotion (every 10 minutes)
setInterval(() => {
  const promoMessage = getRandomHook('superChatPromo');
  postBotMessage(promoMessage);
  console.log('Posted periodic superchat promotion');
}, 600000); // 10 minutes

// Random cool messages at varying intervals (3-7 minutes)
function scheduleNextCoolMessage() {
  // Random delay between 3-7 minutes (180000-420000ms)
  const delay = Math.floor(Math.random() * 240000) + 180000;

  setTimeout(() => {
    const coolMessage = getRandomHook('coolMessages');
    postBotMessage(coolMessage);
    console.log(`Posted cool message (next in ${Math.round(delay/60000)} mins)`);

    // Schedule the next one
    scheduleNextCoolMessage();
  }, delay);
}

// Start the random cool message cycle
scheduleNextCoolMessage();

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

  // Detect new users (not seen in last 48 hours) and welcome them
  const now = Date.now();
  const fortyEightHoursAgo = now - (48 * 60 * 60 * 1000);
  const lastSeen = seenUsernames.get(username);

  if (!lastSeen || lastSeen < fortyEightHoursAgo) {
    seenUsernames.set(username, now);
    const welcomeMessage = getRandomHook('newUserWelcome').replace('{username}', username);
    setTimeout(() => {
      postBotMessage(welcomeMessage);
      console.log(`Welcomed new/returning user: ${username} (last seen: ${lastSeen ? new Date(lastSeen).toLocaleString() : 'never'})`);
    }, 2000); // 2 second delay so it doesn't overlap with their message
  } else {
    // Update last seen timestamp
    seenUsernames.set(username, now);
  }

  console.log(`Total chat messages: ${debateState.chatMessages.length}`);
  broadcastState();
}

if (config.youtubeApiKey && config.youtubeVideoId) {
  youtubeChatMonitor = new YouTubeChatMonitor(
    config.youtubeApiKey,
    config.youtubeVideoId,
    handleYouTubeMessage,
    handleChatMessage,
    handleSuperChatMessage
  );
}

// Handle superchat messages (priority)
function handleSuperChatMessage(username, message) {
  const filterResult = contentFilter.checkTopic(message);

  if (!filterResult.allowed) {
    debateState.moderatorMessage = {
      type: 'rejected',
      username: `${username} (SUPERCHAT)`,
      message,
      reason: filterResult.reason,
      timestamp: Date.now()
    };
    broadcastState();

    setTimeout(() => {
      if (debateState.moderatorMessage?.timestamp === filterResult.timestamp) {
        debateState.moderatorMessage = null;
        broadcastState();
      }
    }, 15000);
    return;
  }

  // Check superchat queue limit (max 50)
  if (debateState.superChatQueue.length >= 50) {
    const queueFullTimestamp = Date.now();
    debateState.moderatorMessage = {
      type: 'queue_full',
      username: `${username} (SUPERCHAT)`,
      message,
      reason: 'SuperChat queue is full (max 50). Please wait to submit!',
      timestamp: queueFullTimestamp
    };
    broadcastState();

    setTimeout(() => {
      if (debateState.moderatorMessage?.timestamp === queueFullTimestamp) {
        debateState.moderatorMessage = null;
        broadcastState();
      }
    }, 5000);
    return;
  }

  // Superchat IMMEDIATELY cancels current debate and starts new one
  console.log(`💰 SUPERCHAT PRIORITY: Canceling current debate for ${username}`);

  // Save current debate to front of regular queue if active
  if (debateState.currentTopic && debateState.history.length > 0) {
    debateState.queue.unshift({
      topic: debateState.currentTopic,
      username: 'INTERRUPTED',
      timestamp: Date.now()
    });
  }

  // Clear current debate and start superchat topic immediately
  debateState.currentTopic = message;
  debateState.history = [];
  debateState.turnNumber = 0;
  debateState.isProcessing = false;
  debateState.mode = 'superchat';

  const superChatTimestamp = Date.now();
  debateState.moderatorMessage = {
    type: 'superchat_incoming',
    username,
    message,
    timestamp: superChatTimestamp
  };

  broadcastState();

  // Show "SuperChat Debate Incoming!" animation
  postBotMessage(`💰💥 SUPERCHAT DEBATE INCOMING! 💥💰 ${username} paid to debate: "${message}"`);

  setTimeout(() => {
    if (debateState.moderatorMessage?.timestamp === superChatTimestamp) {
      debateState.moderatorMessage = null;
      broadcastState();
    }
  }, 5000);

  // Trigger debate loop immediately
  setTimeout(() => runDebateLoop(), 500);
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

    setTimeout(() => {
      if (debateState.moderatorMessage?.timestamp === filterResult.timestamp) {
        debateState.moderatorMessage = null;
        broadcastState();
      }
    }, 15000);
    return;
  }

  // Check queue limit (max 50), except for whitelist users
  const whitelistUsers = ['Snail3D', 'Snail'];
  const isWhitelisted = whitelistUsers.some(wlUser => username.toLowerCase().includes(wlUser.toLowerCase()));

  if (debateState.queue.length >= 50 && !isWhitelisted) {
    const queueFullTimestamp = Date.now();
    debateState.moderatorMessage = {
      type: 'queue_full',
      username,
      message,
      reason: 'Queue is full (max 50). Please wait to submit!',
      timestamp: queueFullTimestamp
    };
    broadcastState();

    setTimeout(() => {
      if (debateState.moderatorMessage?.timestamp === queueFullTimestamp) {
        debateState.moderatorMessage = null;
        broadcastState();
      }
    }, 5000);
    return;
  }

  // Check for duplicate in queue (case insensitive)
  const isDuplicate = debateState.queue.some(item => 
    item.topic.toLowerCase().trim() === message.toLowerCase().trim()
  );
  if (isDuplicate) {
    console.log(`❌ Duplicate topic rejected: ${message}`);
    const dupeTimestamp = Date.now();
    debateState.moderatorMessage = {
      type: 'rejected',
      username,
      message,
      reason: 'This topic is already in the queue!',
      timestamp: dupeTimestamp
    };
    broadcastState();
    setTimeout(() => {
      if (debateState.moderatorMessage?.timestamp === dupeTimestamp) {
        debateState.moderatorMessage = null;
        broadcastState();
      }
    }, 5000);
    return;
  }

  // Add to queue
  debateState.queue.push({
    topic: message,
    username,
    timestamp: Date.now()
  });

  const queueTimestamp = Date.now();
  debateState.moderatorMessage = {
    type: 'queued',
    username,
    message,
    position: debateState.queue.length,
    timestamp: queueTimestamp
  };

  broadcastState();

  setTimeout(() => {
    if (debateState.moderatorMessage?.timestamp === queueTimestamp) {
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
    // CON: Skeptical, analytical, pragmatic
    const conStyles = [
      'skeptical and questioning - use rhetorical questions and challenge assumptions',
      'coldly analytical - dissect arguments with logic and evidence',
      'pragmatic and realistic - focus on practical concerns and real-world implications'
    ];
    personality = conStyles[turnNumber % conStyles.length];
  }

  let prompt = `Debate: "${topic}"

You argue ${role}. Turn ${turnNumber}.
PERSONALITY: Be ${personality}

Make your response reflect this personality strongly. Challenge the ARGUMENT, not the person.
MAXIMUM 3 sentences. Attack IDEAS, never the debater. Be intense and authentic to your personality.

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

    // Increment debate counter
    debateState.debateCounter++;

    // Bot announces new debate with random hook
    const mode = debateState.mode === 'user' ? 'User request' : debateState.mode === 'superchat' ? 'SUPERCHAT' : 'Auto';
    const debateAnnouncement = getRandomHook('debateStart')
      .replace('{count}', debateState.debateCounter)
      .replace('{topic}', debateState.currentTopic)
      .replace('{mode}', mode);
    const instructions = getRandomHook('instructions');
    postBotMessage(`${debateAnnouncement} | ${instructions}`);

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

    // Save state after each turn
    saveDebateState();

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

    // Bot announces winner
    const winnerSide = result.winner.toUpperCase();
    postBotMessage(`Debate concluded! Winner: ${winnerSide} - ${result.reason}`);

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
    queue: debateState.queue,
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
    queue: debateState.queue,
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