import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import net from 'net';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Diverse debate personalities  
const PERSONALITIES = [
  { name: "Professor", tone: "scholarly and intellectual - use academic language, cite logic and evidence", color: "#00ccff" },
  { name: "Tyrone", tone: "street-smart and real - speak in AAVE/ebonics, keep it 100, use slang naturally", color: "#ff6600" },
  { name: "Karen", tone: "entitled and demanding - speak to the manager energy, passive-aggressive, condescending", color: "#ff33cc" },
  { name: "Brutus", tone: "aggressive and confrontational - military drill sergeant style, no nonsense, direct attacks", color: "#cc0000" },
  { name: "Fabio", tone: "flamboyant and dramatic - over-the-top theatrical, uses metaphorical Italian hand gestures", color: "#9933ff" },
  { name: "Grandma", tone: "sweet but wise - wholesome, uses old sayings, back-in-my-day vibes", color: "#ff99cc" },
  { name: "Chad", tone: "bro culture and confident - alpha mindset, gym bro energy, uses bro/dude/gains metaphors", color: "#00ff99" },
  { name: "Velma", tone: "nerdy and analytical - pop culture refs, awkward but brilliant, overthinks everything", color: "#ffcc00" },
  { name: "Conspiracy Carl", tone: "paranoid and suspicious - questions everything, connects dots, wake up sheeple", color: "#ff3300" },
  { name: "Zen Master", tone: "calm and philosophical - ancient wisdom, riddles and metaphors, very chill", color: "#33ccff" },
  { name: "Edgelord", tone: "dark and nihilistic - pessimistic, sarcastic, nothing matters vibes", color: "#666666" },
  { name: "Valley Girl", tone: "like totally basic - uses like/literally/omg, superficial but insightful", color: "#ff66cc" }
];

function getRandomPersonalities() {
  const shuffled = [...PERSONALITIES].sort(() => Math.random() - 0.5);
  return { side1: shuffled[0], side2: shuffled[1] };
}


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
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: 'llama-3.3-70b-versatile',
  debateInterval: 3000,
  youtubeApiKey: '',
  youtubeVideoId: '',
  port: 3000
};

if (fs.existsSync('./config.json')) {
  config = { ...config, ...JSON.parse(fs.readFileSync('./config.json', 'utf8')) };
}

const groq = new Groq({ apiKey: config.groqApiKey });

// Debate state
let debateState = {
  currentTopic: null,
  currentSide: 'side1',
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
    debateState.moderatorMessage = null; // Clear any old moderator messages
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
    'Want instant debate priority? Use SUPERCHAT to skip the queue!',
    'SUPERCHATS get immediate attention - your debate starts NOW!',
    'Skip the line! SUPERCHATS interrupt current debates instantly!',
    'Got a burning question? SUPERCHAT for instant debate priority!',
    'SUPERCHATS = Instant priority! No waiting, just debating!',
    'Premium priority! SUPERCHAT to start your debate immediately!',
    'SUPERCHATS launch debates instantly - no queue, no wait!',
    '👑 VIP treatment! SUPERCHAT to cancel current debate & start yours!',
    '⭐ Want the spotlight? SUPERCHAT for immediate debate action!',
    '💥 SUPERCHATS = Instant debates! Cut the line, start the discussion!'
  ],
  debateStart: [
    'DEBATE #{count}: "{topic}" ({mode})',
    'LIVE NOW - DEBATE #{count}: {topic} ({mode})',
    'New debate #{count} starting: "{topic}" ({mode})',
    '🎬 Rolling! Debate #{count}: {topic} ({mode})',
    '📣 Debate #{count} begins: "{topic}" ({mode})',
    'Next up - Debate #{count}: {topic} ({mode})'
  ],
  instructions: [
    'Use !debate [your question] to join the queue | SUPERCHATS skip ahead!',
    'Type !debate [question] to queue up | SUPERCHAT for instant priority!',
    'Submit !debate [topic] to get in line | SUPERCHATS go first!',
    'Queue your debate with !debate [question] | SUPERCHAT = instant start!',
    'Join queue: !debate [your topic] | SUPERCHAT = no waiting!'
  ],
  coolMessages: [
    'Beep boop! AI debates are powered by local LLMs - no cloud needed!',
    '🧠 Did you know? These debates use llama-3.3-70b via Groq API!',
    'Fun fact: Each argument takes about 2-3 seconds to generate!',
    'The AI judge picks winners based on logic, evidence, and persuasiveness!',
    'Loving the debates? Drop a like and subscribe for more AI battles!',
    'These AIs never get tired - they can debate 24/7!',
    'Pro tip: More specific debate topics = better arguments!',
    'The AI analyzes previous arguments to build stronger cases!',
    'Each debate runs for 10 rounds before the judge decides!',
    '🤯 Mind blown yet? This is all happening in real-time!',
    'Want to see YOUR question debated? Use !debate [your topic]!',
    '🎪 Welcome to the AI debate arena - where silicon meets rhetoric!',
    'May the best argument win! These AIs show no mercy!',
    '🌐 Running live from a Linode server streaming to YouTube!',
    '🎬 Lights, camera, DEBATE! Another round of AI vs AI!',
    '🔮 The future is now - watching AIs debate philosophy!',
    '💪 These language models are flexing their reasoning skills!',
    '🎲 Random topics or user requests - both get epic debates!',
    'After 10 rounds, an AI judge crowns the champion!',
    '✨ The magic of machine learning in action!'
  ],
  newUserWelcome: [
    'Welcome @{username}! Type !debate [your question] to join the debate queue!',
    'Hey @{username}! Want to see YOUR topic debated? Use !debate [topic] and we\'ll queue it up!',
    'Welcome @{username}! Submit !debate [question] to queue your debate topic!',
    '@{username} just joined! Try !debate [any topic] to start an AI debate!',
    'Welcome aboard @{username}! Use !debate [your topic] to get in the queue! Regular queue or SUPERCHAT for instant priority!'
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
// Strip emojis from text
function stripEmojis(text) {
  return text.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA70}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{FE0F}]|[\u{200D}]/gu, '');
}

function handleSuperChatMessage(username, message) {
  message = stripEmojis(message);
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
  console.log(`SUPERCHAT PRIORITY: Canceling current debate for ${username}`);

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
  const personalities = getRandomPersonalities();
  debateState.personality1 = personalities.side1;
  debateState.personality2 = personalities.side2;
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
  postBotMessage(`💰💥 SUPERCHAT DEBATE INCOMING! 💥${username} paid to debate: "${message}"`);

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
  message = stripEmojis(message);
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

// Groq API call with streaming
async function callGroqStream(prompt, model, onChunk) {
  try {
    const stream = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model || config.groqModel,
      temperature: 0.8,
      max_tokens: 75,
      stream: true
    });

    let fullResponse = "";
    
    // Character throttling for smooth typing effect
    const CHAR_DELAY_MS = 50; // 50ms per character = 20 chars/sec
    
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      if (content) {
        fullResponse += content;
        
        // Send each character individually with delay
        for (const char of content) {
          if (onChunk) {
            onChunk(char);
          }
          await new Promise(resolve => setTimeout(resolve, CHAR_DELAY_MS));
        }
      }
    }
    
    return fullResponse;
  } catch (error) {
    console.error("Groq stream error:", error.message);
    throw error;
  }
}

// Non-streaming Groq call (for judge)
async function callGroq(prompt, model) {
  try {
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: model || config.groqModel,
      temperature: 0.8,
      max_tokens: 75
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("Groq error:", error.message);
    throw error;
  }
}

// Generate debate response
function generateDebateResponse(topic, side, turnNumber, previousArguments) {
  const personality = side === 'side1' ? debateState.personality1 : debateState.personality2;
  const opponent = side === 'side1' ? 'opposition' : 'proponent';


  let prompt = `Debate: "${topic}"

You are ${personality.name}. Turn ${turnNumber}.
PERSONALITY: ${personality.tone}

DEBATE RULES (ENFORCE STRICTLY):
1. Attack IDEAS and ARGUMENTS, NEVER the person
2. Keep it SHORT - 2-3 sentences MAX (50-60 words)
3. No ad hominem attacks or name-calling
4. Stay on topic
5. Use logic, evidence, and reasoning
6. IF opponent breaks a rule, call it out IMMEDIATELY

Stay IN CHARACTER as ${personality.name}. Make ONE strong point in their style.
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
  const proArgs = history.filter(h => h.side === 'side1').map(h => h.text).join('\n\n');
  const conArgs = history.filter(h => h.side === 'side2').map(h => h.text).join('\n\n');

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

  const response = await callGroq(judgePrompt, config.groqModel);

  if (!response) {
    return { winner: 'side1', reason: 'Debate concluded.' };
  }

  // Parse the response
  const winnerMatch = response.match(/WINNER:\s*(PRO|CON)/i);
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

  const winner = winnerMatch ? winnerMatch[1].toLowerCase() : 'side1';
  const reason = reasonMatch ? reasonMatch[1].trim() : 'Debate concluded.';

  return { winner, reason };
}

// Main debate loop
async function debateLoop() {
  console.log('Debate loop triggered. isProcessing:', debateState.isProcessing);
  if (debateState.isProcessing) return;

  debateState.isProcessing = true;
  console.log('Starting debate turn...');

  // Ensure personalities are assigned (for resumed debates)
  if (!debateState.personality1 || !debateState.personality2) {
    const personalities = getRandomPersonalities();
    debateState.personality1 = personalities.side1;
    debateState.personality2 = personalities.side2;
  }

  // Check if we need a new topic
  if (!debateState.currentTopic) {
    console.log('Creating new debate topic...');
    // Check queue first
    if (debateState.queue.length > 0) {
      const userRequest = debateState.queue.shift();
      saveDebateState(); // Save immediately after removing from queue
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
    debateState.currentSide = Math.random() < 0.5 ? 'side1' : 'side2';
    debateState.turnNumber = 0;
    debateState.history = [];

    console.log('Random selection:', debateState.currentSide, 'goes first');


    // Assign random personalities for this debate
    const personalities = getRandomPersonalities();
    debateState.personality1 = personalities.side1;
    debateState.personality2 = personalities.side2;
    
    // Broadcast upNext announcement
    broadcastToAll({
      type: 'upNext',
      personality1: debateState.personality1,
      personality2: debateState.personality2
    });
    broadcastState();
    
    // Wait 4 seconds to let people see the announcement
    await new Promise(resolve => setTimeout(resolve, 4000));

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

  console.log('Generating argument...');
  
  // Retry logic: try up to 3 times if response is empty
  let response = "";
  let retryCount = 0;
  const maxRetries = 3;
  
  while (!response && retryCount < maxRetries) {
    if (retryCount > 0) {
      console.log(`Retry attempt ${retryCount}/${maxRetries} for ${debateState.currentSide} turn ${debateState.turnNumber}`);
    }
    
    // Send start signal
    broadcastToAll({
      type: "stream",
      start: true,
      side: debateState.currentSide,
      turn: debateState.turnNumber
    });
    
    response = "";
    try {
      await callGroqStream(prompt, config.groqModel, (chunk) => {
        response += chunk;
        broadcastToAll({
          type: "stream",
          chunk: chunk,
          side: debateState.currentSide,
          turn: debateState.turnNumber
        });
      });
    } catch (error) {
      console.error(`Groq API error on attempt ${retryCount + 1}:`, error.message);
    }
    
    // Send complete signal
    broadcastToAll({
      type: "stream",
      complete: true,
      side: debateState.currentSide,
      turn: debateState.turnNumber
    });
    
    retryCount++;
    
    // If empty and we have retries left, wait a bit before retrying
    if (!response && retryCount < maxRetries) {
      console.log(`Response was empty, waiting 2s before retry...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('Generation complete:', response ? `success (${response.length} chars)` : 'failed after ${maxRetries} attempts');
  console.log('Generation complete:', response ? 'success' : 'failed');

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
    debateState.currentSide = debateState.currentSide === 'side1' ? 'side2' : 'side1';
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

// Port check disabled - just start the server
// const portInUse = await checkPortInUse(config.port);
// if (portInUse) { process.exit(1); }

server.listen(config.port, () => {
  console.log(`Debate stream server running on http://localhost:${config.port}`);
  console.log(`Using Groq API for debate generation`);
  if (youtubeChatMonitor) {
    console.log('YouTube chat monitoring enabled');
    youtubeChatMonitor.start();
  }
});