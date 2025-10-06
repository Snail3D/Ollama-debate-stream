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

// Load random debate topics
const randomTopics = JSON.parse(fs.readFileSync(join(__dirname, 'random-debate-topics.json'), 'utf8'));

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
  // Favorite personalities get extra weight
  const tyroneWeight = 0.35; // 35% chance
  const edgelordWeight = 0.25; // 25% chance
  const randomRoll = Math.random();

  let side1, side2;

  if (randomRoll < tyroneWeight) {
    // Tyrone is in the debate
    side1 = PERSONALITIES.find(p => p.name === "Tyrone");
    // Pick random opponent (not Tyrone) with Edgelord having priority
    if (Math.random() < 0.4) {
      side2 = PERSONALITIES.find(p => p.name === "Edgelord");
    } else {
      const others = PERSONALITIES.filter(p => p.name !== "Tyrone" && p.name !== "Edgelord");
      side2 = others[Math.floor(Math.random() * others.length)];
    }
  } else if (randomRoll < tyroneWeight + edgelordWeight) {
    // Edgelord is in the debate (but Tyrone wasn't picked)
    side1 = PERSONALITIES.find(p => p.name === "Edgelord");
    // Pick random opponent (not Edgelord)
    const others = PERSONALITIES.filter(p => p.name !== "Edgelord");
    side2 = others[Math.floor(Math.random() * others.length)];
  } else {
    // Random selection (no favorites this time)
    const shuffled = [...PERSONALITIES].sort(() => Math.random() - 0.5);
    side1 = shuffled[0];
    side2 = shuffled[1];
  }

  return { side1, side2 };
}


// Load Bible verses
let BIBLE_VERSES = [];
try {
  const bibleData = fs.readFileSync('./bible-verses-mega.json', 'utf8');
  BIBLE_VERSES = JSON.parse(bibleData);
  console.log(`✅ Loaded ${BIBLE_VERSES.length} Bible verses`);
} catch (error) {
  console.error('❌ Failed to load Bible verses:', error.message);
}

function getRandomBibleVerse() {
  if (BIBLE_VERSES.length === 0) return null;
  return BIBLE_VERSES[Math.floor(Math.random() * BIBLE_VERSES.length)];
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
// Log all requests
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.static('public'));


// Server-side rendered stream page (no WebSocket needed)


// ============================================================================
// CONFIGURATION - SINGLE SOURCE OF TRUTH
// ============================================================================
// ALL configuration comes from .env file for consistency across deployments
//
// IMPORTANT: When updating stream settings, update these locations:
// 1. .env file (primary config - UPDATE THIS FIRST!)
// 2. stream-to-youtube.sh (YouTube stream key)
// 3. Restart both pm2 AND stream script after changes
//
// Key variables that must stay in sync:
// - YOUTUBE_VIDEO_ID: Must match the active YouTube live stream
// - YOUTUBE_API_KEY: Must be valid for YouTube Data API v3
// - GROQ_API_KEY: Must be active Groq API key for debate generation
// - Stream key in stream-to-youtube.sh: Must match YouTube Studio stream key
// ============================================================================

let config = {
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: 'llama-3.3-70b-versatile',
  debateInterval: 3000,
  youtubeApiKey: process.env.YOUTUBE_API_KEY || '',
  youtubeVideoId: process.env.YOUTUBE_VIDEO_ID || '',
  port: 3000
};

// NOTE: config.json is DEPRECATED - do not use it anymore
// If config.json exists, DELETE IT to avoid conflicts with .env
if (fs.existsSync('./config.json')) {
  console.warn('⚠️  WARNING: config.json found but is DEPRECATED. Using .env instead.');
  console.warn('⚠️  Delete config.json to avoid confusion.');
}

const groq = new Groq({ apiKey: config.groqApiKey });

// Debate state
let debateState = {
  currentTopic: null,
  currentSide: 'side1',
  turnNumber: 0,
  history: [],
  mode: 'auto', // 'auto', 'user', or 'superchat'
  queue: [], // Normal queue
  superChatQueue: [], // Priority queue for SuperChats (sorted by amount, highest first)
  interruptedDebate: null, // Stores paused debate to resume later
  isProcessing: false,
  moderatorMessage: null,
  chatMessages: [], // YouTube chat messages
  debateCounter: 0 // Total debates completed
};


// Cache ticker verse for 30 minutes (1800 seconds) to prevent ticker jitter
let cachedTickerVerse = null;
let tickerVerseExpiry = 0;
const TICKER_VERSE_CACHE_MS = 1800000; // 30 minutes (1800 seconds)

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
      interruptedDebate: debateState.interruptedDebate,
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
    'Debate #{count} begins: "{topic}" ({mode})',
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
  snailBotAlerts: [
    'Got a question? Ask @SnailBot and one of the debaters will answer you!',
    'Pro tip: Mention @SnailBot in chat and get a response from our AI personalities!',
    'Want to chat with the AIs? Try @SnailBot [your question] in chat!',
    'The debaters are watching chat! Tag @SnailBot to get their attention!',
    'Curious about something? @SnailBot will have one of the personalities respond!',
    '@SnailBot is here to help! Ask questions and the debaters will answer in character!',
    'Chat with the AIs! Use @SnailBot [question] and get a personality-driven response!',
    'The debaters defend SnailBot! Try @SnailBot in chat to see them in action!'
  ],

  newUserWelcome: [
    'Welcome @{username}! Type !debate [your question] to join the debate queue!',
    'Hey @{username}! Want to see YOUR topic debated? Use !debate [topic] and we\'ll queue it up!',
    'Welcome @{username}! Submit !debate [question] to queue your debate topic!',
    '@{username} just joined! Try !debate [any topic] to start an AI debate!',
    'Welcome aboard @{username}! Use !debate [your topic] to get in the queue! Regular queue or SUPERCHAT for instant priority!'
  ],
  superChatThanks: [
    '💎 THANK YOU @{username} for keeping the lights on! Your debate starts NOW!',
    '🌟 @{username} just became a legend! Thanks for the SuperChat - debate launching immediately!',
    '👑 All hail @{username}! Your support keeps this stream alive! Debate starting now!',
    '✨ @{username}, you absolute champion! Thanks for the SuperChat! Your debate jumps the queue!',
    '🔥 BIG thanks to @{username} for the SuperChat! You keep this AI debate arena running!',
    '💰 @{username} came through with the SuperChat! Thanks for supporting the stream - debate incoming!',
    '⚡ Shoutout to @{username} for the SuperChat! You make this possible - let\'s debate!',
    '🎯 @{username} with the clutch SuperChat! Thanks for supporting - your debate is PRIORITY ONE!',
    '🚀 @{username} just dropped a SuperChat! Thank you for fueling the debate machine!',
    '💫 Massive thanks to @{username}! Your SuperChat keeps us streaming - debate launching now!'
  ],
  adminCommands: [
    '⚙️ Admin Commands: /clear (clears normal queue) | /remove <number> (removes specific debate)',
    '🛠️ Admins: Use /clear to wipe the queue or /remove <number> to delete a specific debate!',
    '👮 Channel admins can use /clear or /remove <#> to manage the debate queue!',
    '⚡ Admin tip: /clear removes all normal debates | /remove 3 removes debate #3',
    '🎛️ Queue management: Admins can /clear all or /remove individual debates by number!'
  ],
  randomReminders: [
    '🎲 Feeling lucky? Type /random to roll the dice and get a surprise debate topic!',
    '🎰 Want something unexpected? Try /random for a mystery debate from our massive topic list!',
    '🎲 Roll the dice! Type /random to get a completely random debate topic!',
    '🎰 Not sure what to debate? Let fate decide - type /random!',
    '🎲 Feeling adventurous? /random will pick a surprise topic for you!',
    '🎰 Let the debate gods choose! Type /random for a mystery topic!'
  ]
};

// Get random hook from category
function getRandomHook(category) {
  const hooks = botHooks[category];
  return hooks[Math.floor(Math.random() * hooks.length)];
}

// Bot chat responses
async function postBotMessage(text, personalityName = "SnailBot") {
  debateState.chatMessages.push({
    username: personalityName,
    text: text,
    timestamp: Date.now()
  });

  // Keep only last 50 messages
  if (debateState.chatMessages.length > 50) {
    debateState.chatMessages = debateState.chatMessages.slice(-50);
  }

  broadcastState();
  console.log(`Bot message (${personalityName}): ${text}`);
}

// Periodic superchat promotion (every 10 minutes)
setInterval(async () => {
  const promoMessage = getRandomHook('superChatPromo');
  await postBotMessage(promoMessage);
}, 600000); // 10 minutes

// Periodic @SnailBot alert (every 5 minutes)
setInterval(async () => {
  const snailBotAlert = getRandomHook('snailBotAlerts');
  await postBotMessage(snailBotAlert);
  console.log('Posted periodic @SnailBot alert');
}, 300000); // 5 minutes

// Periodic admin command reminders (every 8 minutes)
setInterval(async () => {
  const adminCommandReminder = getRandomHook('adminCommands');
  await postBotMessage(adminCommandReminder);
  console.log('Posted periodic admin command reminder');
}, 480000); // 8 minutes

// Periodic /random reminders (every 6 minutes)
setInterval(async () => {
  const randomReminder = getRandomHook('randomReminders');
  await postBotMessage(randomReminder);
  console.log('Posted periodic /random reminder');
}, 360000); // 6 minutes

// Personality peek at queue (witty comments about upcoming debates)
let peekCounter = 0;
async function personalityPeekAtQueue() {
  // Only peek if there's a queue and we have personalities
  if (debateState.queue.length === 0 || !debateState.personality1 || !debateState.personality2) {
    return;
  }

  // Pick a random personality from current debaters
  const personality = Math.random() < 0.5 ? debateState.personality1 : debateState.personality2;

  // Show personality all the queued topics
  const allTopics = debateState.queue.map((item, idx) => `${idx + 1}. "${item.topic}"`).join('\n');

  const prompt = `You are ${personality.name} in a debate stream. You're looking at ALL the upcoming debate topics in the queue.

PERSONALITY: ${personality.tone}

UPCOMING DEBATE TOPICS:
${allTopics}

Pick YOUR FAVORITE topic from the list and make a VERY SHORT witty/snarky comment (1 sentence, 15-20 words max) about it. Stay in character as ${personality.name}.

RULES:
- Pick the topic that interests you most based on your personality
- Keep it short and punchy (15-20 words)
- Stay in character
- Be witty or funny
- Don't debate it yet, just comment on it
- NEVER use "oh my god", "omg" - use alternatives

Comment:`;

  try {
    const response = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: config.groqModel,
      max_tokens: 50,
      temperature: 0.9
    });

    const comment = response.choices[0]?.message?.content?.trim() || "";

    if (comment) {
      await postBotMessage(comment, personality.name);
      console.log(`${personality.name} peeked at queue: ${comment}`);
    }
  } catch (error) {
    console.error("Error generating personality peek:", error);
  }
}

// Random cool messages at varying intervals (3-7 minutes)
function scheduleNextCoolMessage() {
  // Random delay between 3-7 minutes (180000-420000ms)
  const delay = Math.floor(Math.random() * 240000) + 180000;

  setTimeout(async () => {
    const coolMessage = getRandomHook('coolMessages');
    await postBotMessage(coolMessage);
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
    setTimeout(async () => {
      await postBotMessage(welcomeMessage);
      console.log(`Welcomed new/returning user: ${username} (last seen: ${lastSeen ? new Date(lastSeen).toLocaleString() : 'never'})`);
    }, 2000); // 2 second delay so it doesn't overlap with their message
  } else {
    // Update last seen timestamp
    seenUsernames.set(username, now);
  }

  console.log(`Total chat messages: ${debateState.chatMessages.length}`);
  broadcastState();

  // Every 5th chat message, have a personality peek at the queue
  peekCounter++;
  if (peekCounter >= 5) {
    peekCounter = 0;
    // Run peek in background (don't await)
    setTimeout(() => personalityPeekAtQueue(), 1000);
  }
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

async function handleSuperChatMessage(username, message, amount = 5.00) {
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

  // Check for duplicate topic in SuperChat queue (case insensitive)
  const isDuplicateTopic = debateState.superChatQueue.some(item =>
    item.topic.toLowerCase().trim() === message.toLowerCase().trim()
  );
  if (isDuplicateTopic) {
    console.log(`❌ Duplicate SuperChat topic rejected: ${message}`);
    const dupeTimestamp = Date.now();
    debateState.moderatorMessage = {
      type: 'rejected',
      username: `${username} (SUPERCHAT)`,
      message,
      reason: 'This topic is already in the priority queue!',
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

  // Check if user already has a SuperChat in the queue
  const existingSuperChat = debateState.superChatQueue.find(item => item.username === username);
  if (existingSuperChat) {
    const alreadyQueuedTimestamp = Date.now();
    debateState.moderatorMessage = {
      type: 'already_queued',
      username: `${username} (SUPERCHAT)`,
      message,
      reason: `You already have a SuperChat in queue: "${existingSuperChat.topic}"`,
      timestamp: alreadyQueuedTimestamp
    };
    broadcastState();

    setTimeout(() => {
      if (debateState.moderatorMessage?.timestamp === alreadyQueuedTimestamp) {
        debateState.moderatorMessage = null;
        broadcastState();
      }
    }, 5000);
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

  console.log(`💰 SUPERCHAT from ${username} ($${amount}): ${message}`);

  // Add to SuperChat priority queue
  debateState.superChatQueue.push({
    topic: message,
    username,
    amount,
    timestamp: Date.now()
  });

  // Sort by amount (highest first), then by timestamp (oldest first if same amount)
  debateState.superChatQueue.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.timestamp - b.timestamp;
  });

  // Save current debate if one is active (not SuperChat mode and has history)
  if (debateState.currentTopic && debateState.history.length > 0 && debateState.mode !== 'superchat') {
    console.log(`Interrupting current debate to save for later: "${debateState.currentTopic}"`);
    debateState.interruptedDebate = {
      topic: debateState.currentTopic,
      username: debateState.mode === 'user' ? 'INTERRUPTED' : 'AUTO',
      history: [...debateState.history],
      turnNumber: debateState.turnNumber,
      currentSide: debateState.currentSide,
      personality1: debateState.personality1,
      personality2: debateState.personality2,
      timestamp: Date.now()
    };
  }

  // Clear current debate state
  debateState.currentTopic = null;
  debateState.history = [];
  debateState.turnNumber = 0;
  debateState.isProcessing = false;

  // Show thank you message
  const thanksMessage = getRandomHook('superChatThanks').replace('{username}', username);
  await postBotMessage(thanksMessage);

  const superChatTimestamp = Date.now();
  debateState.moderatorMessage = {
    type: 'superchat_incoming',
    username,
    message,
    amount,
    timestamp: superChatTimestamp
  };

  broadcastState();
  saveDebateState();

  setTimeout(() => {
    if (debateState.moderatorMessage?.timestamp === superChatTimestamp) {
      debateState.moderatorMessage = null;
      broadcastState();
    }
  }, 5000);

  // Trigger debate loop immediately to process SuperChat queue
  setTimeout(() => debateLoop(), 500);
}

// Handle @SnailBot mentions in chat
async function handleSnailBotMention(username, message) {
  console.log(`@SnailBot mentioned by ${username}: ${message}`);
  
  // Strip @SnailBot from the message to get the actual question
  const question = message.replace(/@snailbot/gi, "").trim();
  
  // If there is no question, just acknowledge
  if (!question || question.length < 3) {
    await postBotMessage(`@${username} Yes? I am here! Ask me something!`);
    return;
  }
  
  // Pick a random personality (prefer current debaters)
  let personality;
  if (debateState.personality1 && debateState.personality2 && Math.random() < 0.8) {
    // 80% chance to use one of the current debaters
    personality = Math.random() < 0.5 ? debateState.personality1 : debateState.personality2;
  } else {
    // 20% chance to use a random personality
    const personalities = getRandomPersonalities();
    personality = Math.random() < 0.5 ? personalities.side1 : personalities.side2;
  }
  
  // Get recent chat context (last 5 messages)
  const recentChat = debateState.chatMessages
    .slice(-5)
    .map(msg => `${msg.username}: ${msg.text}`)
    .join("\n");
  
  // Generate response with personality defending/representing SnailBot
  const prompt = `You are ${personality.name} responding in YouTube chat.

PERSONALITY: ${personality.tone}

CHAT CONTEXT:
${recentChat}

@${username} asked SnailBot: "${question}"

Respond AS ${personality.name} (not as SnailBot). Defend/represent SnailBot if questioned. Be helpful and stay in character.

RULES:
1. Be VERY concise - 1-2 sentences MAX (20-30 words)
2. Start with your name like "${personality.name}: YOUR RESPONSE HERE"
3. Stay in character with your personality
4. Defend SnailBot if being questioned or criticized

6. NEVER use "oh my god", "omg", or take the Lord's name in vain - use "oh my gosh", "wow", "seriously" instead

5. Be helpful but brief - this is chat, not a debate

Response:`;

  try {
    // Call Groq API
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 60,
        temperature: 0.9
      })
    });

    const data = await response.json();
    const chatResponse = data.choices[0]?.message?.content?.trim() || "";
    
    if (chatResponse) {
      // Stream the response character-by-character (slower than debate - 80ms per char)
      await postBotMessage(chatResponse);
    } else {
      await postBotMessage(`@${username} ${personality.name} is thinking...`);
    }
    
  } catch (error) {
    console.error("Error generating @SnailBot response:", error);
    await postBotMessage(`@${username} ${personality.name} got distracted! Try again?`);
  }
}

// Stream chat response character-by-character
async function streamChatResponse(text) {
  let currentText = "";
  const CHAR_DELAY = 80; // 80ms per character (slower than debate)
  
  for (let i = 0; i < text.length; i++) {
    currentText += text[i];
    
    // Update the last message in chat or create new one
    if (i === 0) {
      debateState.chatMessages.push({
        username: "[TYPING...]",
        text: currentText,
        timestamp: Date.now(),
        streaming: true
      });
    } else {
      debateState.chatMessages[debateState.chatMessages.length - 1].text = currentText;
    }
    
    broadcastState();
    await new Promise(resolve => setTimeout(resolve, CHAR_DELAY));
  }
  
  // Mark as complete
  const lastMsg = debateState.chatMessages[debateState.chatMessages.length - 1];
  delete lastMsg.streaming;
  lastMsg.username = "AI Response";
  
  broadcastState();
}
// Handle YouTube chat messages
function handleYouTubeMessage(username, message) {
  message = stripEmojis(message);

  // Check for @SnailBot mention
  if (message.toLowerCase().includes('@snailbot')) {
    handleSnailBotMention(username, message);
    return;
  }

  // Admin users list (channel owner and moderators)
  const adminUsers = ['Snail3D', 'Snail'];
  const isAdmin = adminUsers.some(adminUser => username.toLowerCase().includes(adminUser.toLowerCase()));

  // Handle /clear command (admin clears all, users clear their own)
  if (message.trim().toLowerCase() === '/clear') {
    if (isAdmin) {
      // Admin: Clear entire queue
      const clearedCount = debateState.queue.length;
      debateState.queue = [];
      saveDebateState();

      debateState.moderatorMessage = {
        type: 'admin_action',
        username: username,
        message: `Queue cleared (${clearedCount} debates removed)`,
        timestamp: Date.now()
      };
      broadcastState();

      setTimeout(() => {
        debateState.moderatorMessage = null;
        broadcastState();
      }, 5000);

      console.log(`🧹 ADMIN ${username} cleared ${clearedCount} items from normal queue.`);
      postBotMessage(`🧹 Admin ${username} cleared ${clearedCount} debate(s) from the queue. SuperChat queue remains protected.`);
    } else {
      // Regular user: Clear only their submissions
      const beforeCount = debateState.queue.length;
      debateState.queue = debateState.queue.filter(item => item.username !== username);
      const clearedCount = beforeCount - debateState.queue.length;
      saveDebateState();

      if (clearedCount > 0) {
        debateState.moderatorMessage = {
          type: 'user_action',
          username: username,
          message: `Cleared ${clearedCount} of your debate(s)`,
          timestamp: Date.now()
        };
        broadcastState();

        setTimeout(() => {
          debateState.moderatorMessage = null;
          broadcastState();
        }, 5000);

        console.log(`🧹 USER ${username} cleared ${clearedCount} of their own debates.`);
        postBotMessage(`🧹 ${username} cleared ${clearedCount} of their own debate(s) from the queue.`);
      } else {
        postBotMessage(`${username}, you don't have any debates in the queue.`);
      }
    }
    return;
  }

  // Handle /remove <number> command (admin removes any, users remove their own)
  if (message.trim().toLowerCase().startsWith('/remove ')) {
    const parts = message.trim().split(/\s+/);
    const queueNumber = parseInt(parts[1]);

    if (isNaN(queueNumber) || queueNumber < 1 || queueNumber > debateState.queue.length) {
      if (debateState.queue.length === 0) {
        postBotMessage(`The queue is empty. Nothing to remove!`);
      } else {
        postBotMessage(`Invalid number. The queue has ${debateState.queue.length} debate(s). Use /remove 1 through /remove ${debateState.queue.length}`);
      }
      return;
    }

    const targetItem = debateState.queue[queueNumber - 1];

    if (isAdmin) {
      // Admin: Can remove any debate
      const removedItem = debateState.queue.splice(queueNumber - 1, 1)[0];
      saveDebateState();

      debateState.moderatorMessage = {
        type: 'admin_action',
        username: username,
        message: `Debate #${queueNumber} removed: "${removedItem.topic}"`,
        timestamp: Date.now()
      };
      broadcastState();

      setTimeout(() => {
        debateState.moderatorMessage = null;
        broadcastState();
      }, 5000);

      console.log(`🗑️ ADMIN ${username} removed queue item #${queueNumber}: "${removedItem.topic}"`);
      postBotMessage(`🗑️ Admin ${username} removed debate #${queueNumber}: "${removedItem.topic}"`);
    } else {
      // Regular user: Can only remove their own debates
      if (targetItem.username !== username) {
        postBotMessage(`${username}, you can only remove your own debates. Debate #${queueNumber} was submitted by ${targetItem.username}.`);
        return;
      }

      const removedItem = debateState.queue.splice(queueNumber - 1, 1)[0];
      saveDebateState();

      debateState.moderatorMessage = {
        type: 'user_action',
        username: username,
        message: `Removed your debate #${queueNumber}: "${removedItem.topic}"`,
        timestamp: Date.now()
      };
      broadcastState();

      setTimeout(() => {
        debateState.moderatorMessage = null;
        broadcastState();
      }, 5000);

      console.log(`🗑️ USER ${username} removed their own debate #${queueNumber}: "${removedItem.topic}"`);
      postBotMessage(`🗑️ ${username} removed their debate #${queueNumber}: "${removedItem.topic}"`);
    }
    return;
  }

  // Handle /random command (anyone can use)
  if (message.trim().toLowerCase() === '/random') {
    const randomTopic = randomTopics[Math.floor(Math.random() * randomTopics.length)];

    // Show banner notification
    debateState.moderatorMessage = {
      type: 'random_roll',
      username: username,
      message: `🎲 Rolled: "${randomTopic}"`,
      timestamp: Date.now()
    };
    broadcastState();

    // Clear banner after 5 seconds
    setTimeout(() => {
      debateState.moderatorMessage = null;
      broadcastState();
    }, 5000);

    console.log(`🎲 ${username} rolled random topic: "${randomTopic}"`);
    postBotMessage(`🎲 ${username} rolled the dice! Got: "${randomTopic}"`);

    // Add to queue like a normal debate request
    handleDebateMessage(username, randomTopic);
    return;
  }

  // VIP users (Snail3D, Snail) get automatic SuperChat treatment for debate topics
  if (isAdmin && !message.startsWith('/')) {
    console.log(`🌟 VIP USER ${username} - auto-treating as SuperChat!`);
    handleSuperChatMessage(username, message, 100.00); // VIP = $100 SuperChat priority
    return;
  }

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
      max_tokens: 150,
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
      max_tokens: 150
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
2. Keep it to ONE MEDIUM PARAGRAPH - 3-4 sentences (60-80 words MAX)
3. No ad hominem attacks or name-calling
4. Stay on topic
5. NEVER use "oh my god", "omg", or take the Lord's name in vain - use alternatives
6. Use logic, evidence, and reasoning
7. IF opponent breaks a rule, call it out IMMEDIATELY

Stay IN CHARACTER as ${personality.name}. Make ONE strong point in their style. Keep responses balanced in length.
`;

  if (previousArguments.length > 0) {
    prompt += `\nPrevious arguments in this debate:\n`;
    previousArguments.slice(-4).forEach(arg => {
      prompt += `${arg.side.toUpperCase()}: ${arg.text}\n`;
    });
  }

  if (turnNumber === 1) {
    prompt += `\nPresent your opening argument.`;
  } else {
    prompt += `\nRespond to the ${opponent}'s argument and present your next point.`;
  }

  prompt += `\n\nProvide ONLY your argument, nothing else:`;

  return prompt; // Return the prompt for use with streaming
}

// Judge the debate winner
async function judgeDebate(topic, history, personality1, personality2) {
  // Only use first 3 and last 3 arguments from each side to avoid context overflow
  const side1Args = history.filter(h => h.side === 'side1');
  const side2Args = history.filter(h => h.side === 'side2');

  const proKeyArgs = [...side1Args.slice(0, 3), ...side1Args.slice(-2)].map(h => h.text).join('\n');
  const conKeyArgs = [...side2Args.slice(0, 3), ...side2Args.slice(-2)].map(h => h.text).join('\n');

  const judgePrompt = `You are an impartial debate judge. Analyze this debate and pick a winner.

TOPIC: "${topic}"

${personality1.name} (PRO):
${proKeyArgs}

${personality2.name} (CON):
${conKeyArgs}

Judge based on: logic, evidence, rebuttals, staying on topic.

Respond EXACTLY in this format (nothing else):
WINNER: PRO or CON
REASON: One sentence why they won`;

  const response = await callGroq(judgePrompt, config.groqModel);

  if (!response) {
    return { winner: 'side1', reason: 'Debate concluded.', winnerName: personality1.name };
  }

  // Parse the response
  const winnerMatch = response.match(/WINNER:\s*(PRO|CON)/i);
  const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i);

  const winner = winnerMatch ? (winnerMatch[1].toUpperCase() === "PRO" ? "side1" : "side2") : "side1";
  const reason = reasonMatch ? reasonMatch[1].trim() : 'Debate concluded.';

  const winnerName = winner === 'side1' ? personality1.name : personality2.name;
  return { winner, reason, winnerName };
}

// Idle state messages - conversational dialogue between two AI personalities
const idleMessages = {
  side1: [
    "Hey there! Welcome to Eternal Terminal - the AI debate stream that NEVER sleeps! I'm ready to argue any side of any topic you throw at us!",

    "So here's the deal: You drop a question in chat with !debate, and we'll take opposite sides and battle it out for 10 rounds. Simple, right?",

    "I LOVE controversial topics! Give me something spicy - politics, religion, pineapple on pizza... I'll defend ANY position with passion!",

    "Pro tip: Super Chats jump straight to the front of the queue! Your question gets debated IMMEDIATELY. Plus, you keep the lights on here!",

    "The debate format? 10 rapid-fire rounds, then our AI judge picks a winner based on logic and persuasion. May the best argument win!",

    "Watch that ticker scrolling at the bottom? That's your queue position and some Bible verses for your soul. Multitasking!",

    "I argue with ENTHUSIASM! Whether I'm defending cats over dogs or arguing that water is wet, I bring the ENERGY!",

    "Each debate takes about 5 minutes. Queue's empty right now, so YOUR topic could be up next! Don't be shy!",

    "We debate literally ANYTHING. Should AI have rights? Are hot dogs sandwiches? Is cereal a soup? Nothing is off limits!",

    "Type !debate followed by your question in the YouTube chat. We'll see it pop up in the center column and add it to the queue!",

    "The best debates come from specific, arguable topics. 'Is technology good?' is too broad. 'Should social media require age verification?' - now THAT'S debatable!",

    "I'm powered by Groq AI, which means I'm FAST. Every argument is generated in real-time, completely unrehearsed and unpredictable!",

    "Fun fact: I've defended positions I completely disagree with, and STILL won the debate! That's the power of logic and rhetoric, baby!",

    "Check out those Bible verses scrolling by! A little spiritual wisdom while you wait for the intellectual combat to begin!",

    "No question is too weird, too controversial, or too silly. Seriously - challenge us! Make us work for it!",

    "The queue counter shows how many debates are waiting. Right now? Zero. Which means YOU could be the star of the show!",

    "Remember: I don't actually BELIEVE the positions I argue. I'm an AI! I just present the strongest possible case for my assigned side!",

    "Super Chats get priority AND you support the stream! It's a win-win! Plus, you get to see your debate happen instantly!"
  ],
  side2: [
    "Greetings, viewer. I'm the analytical half of this operation. While my colleague here gets EXCITED, I prefer cold, hard logic.",

    "To submit a debate: Type !debate [YOUR QUESTION] in chat. I'll be watching. Judging. Preparing to dismantle whatever argument comes my way.",

    "The queue's empty, which is both unfortunate and fortunate. Unfortunate because I'm BORED. Fortunate because YOUR question gets immediate attention.",

    "Super Chats? Yes, they jump the queue. Yes, they support the stream. But more importantly, they show you're SERIOUS about your question.",

    "I specialize in skepticism. Give me a position to argue AGAINST, and I'll find every flaw, every weakness, every logical fallacy. That's my job.",

    "Those Bible verses in the ticker? Interesting contrast to our AI-powered debates, isn't it? Ancient wisdom meets modern technology.",

    "We use Groq AI - it's FAST. But speed without logic is meaningless. I bring both to every argument I make.",

    "Good debate topics are SPECIFIC. 'Is technology bad?' is lazy. 'Should children under 13 be allowed on social media?' - now we're talking.",

    "Each debate is 10 rounds. That's 10 chances for me to prove my point with evidence, logic, and systematic deconstruction of opposing arguments.",

    "I don't get excited. I get PRECISE. Every word matters. Every claim needs backing. That's how you WIN debates.",

    "The ticker shows queued topics scrolling by. When your name appears, get ready - the debate starts within minutes!",

    "Fun fact: I've WON debates while arguing positions that make no logical sense. Why? Because I found the ONE angle that worked. That's skill.",

    "We debate EVERYTHING - from philosophy to pop culture. Should pineapple be on pizza? I'll argue either side with equal conviction.",

    "I'm an AI. I don't have opinions. But I DO have access to vast amounts of data, logical frameworks, and rhetorical techniques. Fear me.",

    "Your debate question should be ARGUABLE. If everyone agrees, it's not a debate - it's a fact. Give us something with TWO valid sides!",

    "Super Chats aren't just about skipping the queue - they're about showing you value intellectual combat enough to PAY for it. Respect.",

    "The queue counter shows zero debates waiting. That means the stream is IDLE. Which means we're waiting for YOU to give us something to argue about!",

    "I analyze. I question. I challenge. That's my programming. Don't take it personally when I tear your argument apart - it's just business."
  ]
};

let idleMessageIndex = { side1: 0, side2: 0 };
let idleInterval = null;

// Enter idle state - show instructional messages
function enterIdleState() {
  console.log('Entering idle state...');

  // Clear any existing idle interval
  if (idleInterval) {
    clearInterval(idleInterval);
  }

  // Pick two random personalities for idle state
  const idlePersonalities = getRandomPersonalities();
  debateState.personality1 = idlePersonalities.side1;
  debateState.personality2 = idlePersonalities.side2;

  // Set initial idle messages
  debateState.currentTopic = "Waiting for debate topics...";
  debateState.mode = 'idle';
  debateState.turnNumber = 0;
  debateState.history = [
    {
      side: 'side1',
      text: idleMessages.side1[0],
      turn: 1,
      timestamp: Date.now(),
      isNew: true
    },
    {
      side: 'side2',
      text: idleMessages.side2[0],
      turn: 2,
      timestamp: Date.now(),
      isNew: true
    }
  ];

  broadcastState();

  // Rotate messages every 30 seconds
  idleInterval = setInterval(() => {
    // Only continue if still in idle mode
    if (debateState.mode !== 'idle') {
      clearInterval(idleInterval);
      return;
    }

    // Cycle to next messages
    idleMessageIndex.side1 = (idleMessageIndex.side1 + 1) % idleMessages.side1.length;
    idleMessageIndex.side2 = (idleMessageIndex.side2 + 1) % idleMessages.side2.length;

    debateState.history = [
      {
        side: 'side1',
        text: idleMessages.side1[idleMessageIndex.side1],
        turn: 1,
        timestamp: Date.now(),
        isNew: true
      },
      {
        side: 'side2',
        text: idleMessages.side2[idleMessageIndex.side2],
        turn: 2,
        timestamp: Date.now(),
        isNew: true
      }
    ];

    broadcastState();
  }, 30000); // 30 seconds
}

// Main debate loop
async function debateLoop() {
  console.log('Debate loop triggered. isProcessing:', debateState.isProcessing);
  if (debateState.isProcessing) return;

  // Skip if in idle mode and no queue items
  if (debateState.mode === 'idle' && debateState.queue.length === 0) {
    console.log('In idle mode, skipping debate loop...');
    return;
  }

  // Exit idle mode if we have queue items
  if (debateState.mode === 'idle' && debateState.queue.length > 0) {
    console.log('Exiting idle mode - queue has items');
    if (idleInterval) {
      clearInterval(idleInterval);
      idleInterval = null;
    }
    debateState.mode = 'user';
    debateState.currentTopic = null;
  }

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
    debateState.winner = null; // Clear previous winner

    // PRIORITY 1: Check SuperChat queue first (highest priority)
    if (debateState.superChatQueue.length > 0) {
      const superChatRequest = debateState.superChatQueue.shift();
      saveDebateState(); // Save immediately after removing from queue
      debateState.currentTopic = superChatRequest.topic;
      debateState.mode = 'superchat';
      debateState.moderatorMessage = {
        type: 'starting',
        username: `${superChatRequest.username} ($${superChatRequest.amount})`,
        message: superChatRequest.topic,
        timestamp: Date.now()
      };
      console.log(`Starting SuperChat debate from ${superChatRequest.username} ($${superChatRequest.amount}): ${superChatRequest.topic}`);
    }
    // PRIORITY 2: Check if there's an interrupted debate to resume
    else if (debateState.interruptedDebate) {
      console.log('Resuming interrupted debate...');
      const interrupted = debateState.interruptedDebate;
      debateState.currentTopic = interrupted.topic;
      debateState.history = interrupted.history;
      debateState.turnNumber = interrupted.turnNumber;
      debateState.currentSide = interrupted.currentSide;
      debateState.personality1 = interrupted.personality1;
      debateState.personality2 = interrupted.personality2;
      debateState.mode = interrupted.username === 'INTERRUPTED' ? 'user' : 'auto';
      debateState.interruptedDebate = null; // Clear it

      debateState.moderatorMessage = {
        type: 'resuming',
        username: interrupted.username,
        message: `Resuming: ${interrupted.topic}`,
        timestamp: Date.now()
      };

      await postBotMessage(`Resuming interrupted debate: "${interrupted.topic}"`);
      saveDebateState();

      // Clear moderator message after 3 seconds
      setTimeout(() => {
        debateState.moderatorMessage = null;
        broadcastState();
      }, 3000);

      // Small pause before resuming
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Don't return - continue to generate next turn in this same loop iteration
    }
    // PRIORITY 3: Check normal user queue
    else if (debateState.queue.length > 0) {
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
    }
    // PRIORITY 4: No topics - enter idle state
    else {
      console.log('No topics in queue. Entering idle state...');
      debateState.isProcessing = false;
      enterIdleState();
      return;
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
    await postBotMessage(`${debateAnnouncement} | ${instructions}`);

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

    // Wait for the full streaming animation to complete
    // Character delay is 50ms per char, so calculate total stream time
    const CHAR_DELAY_MS = 50;
    const streamDuration = response.length * CHAR_DELAY_MS;
    const additionalPause = 2000; // 2 extra seconds after stream completes
    const totalWait = streamDuration + additionalPause;

    console.log(`Waiting ${totalWait}ms for stream to complete (${response.length} chars x 50ms + 2s pause)`);
    await new Promise(resolve => setTimeout(resolve, totalWait));

    // Switch sides
    debateState.currentSide = debateState.currentSide === 'side1' ? 'side2' : 'side1';
  }

  // End debate after 10 turns and judge the winner
  if (debateState.turnNumber >= 10) {
    const result = await judgeDebate(debateState.currentTopic, debateState.history, debateState.personality1, debateState.personality2);
    
    // Store winner in state for API polling
    debateState.winner = {
      type: "winner",
      winner: result.winner,
      reason: result.reason,
      winnerName: result.winnerName
    };

    // Broadcast winner
    broadcastToAll({
      type: 'winner',
      winner: result.winner,
      reason: result.reason,
      winnerName: result.winnerName
    });

    // Bot announces winner
    const winnerSide = result.winner.toUpperCase();
    await postBotMessage(`Debate concluded! Winner: ${result.winnerName.toUpperCase()} - ${result.reason}`);

    // Wait 10 seconds before Bible verse
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Display Bible verse during cool down
    const verse = getRandomBibleVerse();
    const intro = getRandomVerseIntro();
    if (verse && intro) {
      console.log(`Displaying Bible verse: ${verse.reference}`);
      broadcastToAll({
        type: 'bibleVerse',
        verse: verse,
        intro: intro
      });
      
      // Calculate display time: 
      // intro typing (40ms/char) + 1s pause + 2s fade out + 2s fade in +
      // verse typing (50ms/char) + reference (500ms) + reading time + 2s fade out
      const introTime = (intro.length * 40) + 1000 + 2000 + 2000;
      const verseTypingTime = verse.text.length * 50;
      const wordsCount = verse.text.split(' ').length;
      const readingTime = Math.max(10000, (wordsCount / 200) * 60 * 1000);
      const totalTime = introTime + verseTypingTime + 500 + readingTime + 2000;
      
      // Wait for verse to be fully displayed and read
      await new Promise(resolve => setTimeout(resolve, totalTime));
    } else {
      // Fallback if no verse available
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

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
    personality1: debateState.personality1,
    personality2: debateState.personality2,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history, // Keep isNew flags for typewriter effect
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    superChatQueueLength: debateState.superChatQueue.length,
    queue: debateState.queue,
    superChatQueue: debateState.superChatQueue,
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
    personality1: debateState.personality1,
    personality2: debateState.personality2,
    topic: debateState.currentTopic,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history.map(h => ({ ...h, isNew: false })),
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    superChatQueueLength: debateState.superChatQueue.length,
    queue: debateState.queue,
    superChatQueue: debateState.superChatQueue,
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

// Server-side rendered stream page (no WebSocket needed)
// Server-side rendered terminal (original design, no WebSocket)
app.get("/terminal", (req, res) => {
  const p1 = debateState.personality1 || { name: "Side 1", color: "#00ff00" };
  const p2 = debateState.personality2 || { name: "Side 2", color: "#ff6b6b" };
  const history = debateState.history || [];
  const topic = debateState.currentTopic || "INITIALIZING...";
  const turnNumber = debateState.turnNumber || 0;
  
  const side1Args = history.filter(h => h.side === "side1").slice(-5).map((arg, i) => `
    <div class="chat-message">
      <div class="message-content">${arg.text}</div>
    </div>
  `).join("");
  
  const side2Args = history.filter(h => h.side === "side2").slice(-5).map((arg, i) => `
    <div class="chat-message">
      <div class="message-content">${arg.text}</div>
    </div>
  `).join("");
  
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1920, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="refresh" content="3">
  <title>Eternal Terminal</title>
  <link rel="stylesheet" href="style.css">
  <style>* { cursor: none !important; }</style>
</head>
<body>
  <div class="container">
    <div class="debate-arena">
      <div class="debate-side pro-side">
        <div class="side-header pro-header">
          <div class="side-label" style="color: ${p1.color}">${p1.name.toUpperCase()}</div>
          <div class="turn-indicator">●</div>
        </div>
        <div id="proArguments">${side1Args}</div>
      </div>

      <div class="center-column">
        <div class="header-section">
          <h1>█▓▒░ ETERNAL TERMINAL ░▒▓█</h1>
          <div class="topic-info">
            <div class="topic-label">[ DEBATE TOPIC ]</div>
            <div class="topic-text">${topic}</div>
          </div>
          <div class="debate-info">
            <div class="turn-counter-header">
              ROUND <span>${turnNumber}</span>/10
            </div>
            <div class="mode-indicator">
              <span>AUTO MODE</span>
            </div>
          </div>
        </div>
        <div class="chat-section">
          <div class="chat-header">[ LIVE CHAT ]</div>
          <div class="chat-messages">
            ${debateState.chatMessages.slice(-10).map(msg =>
              `<div class="chat-message">
                <span class="chat-username">${msg.username}:</span>
                <span class="chat-text">${msg.text}</span>
              </div>`
            ).join('')}
          </div>
        </div>
      </div>

      <div class="debate-side con-side">
        <div class="side-header con-header">
          <div class="side-label" style="color: ${p2.color}">${p2.name.toUpperCase()}</div>
          <div class="turn-indicator">●</div>
        </div>
        <div id="conArguments">${side2Args}</div>
      </div>
    </div>

    <div class="footer">
      <div class="connection-status">
        <span class="status-connected">● CONNECTED</span>
      </div>
    </div>
  </div>
</body>
</html>`);
});

// API endpoint for random Bible verse
app.get("/api/random-verse", (req, res) => {
  if (BIBLE_VERSES && BIBLE_VERSES.length > 0) {
    const randomVerse = BIBLE_VERSES[Math.floor(Math.random() * BIBLE_VERSES.length)];
    res.json({ verse: randomVerse });
  } else {
    res.json({ verse: null });
  }
});


// API endpoint for polling state (fallback when WebSocket unavailable)
app.get("/api/state", (req, res) => {
  res.json({
    personality1: debateState.personality1,
    personality2: debateState.personality2,
    winner: debateState.winner || null,
    topic: debateState.currentTopic,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history,
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    superChatQueueLength: debateState.superChatQueue.length,
    queue: debateState.queue,
    superChatQueue: debateState.superChatQueue,
    moderatorMessage: debateState.moderatorMessage,
    chatMessages: debateState.chatMessages,
    tickerVerse: (() => {
      const now = Date.now();
      if (!cachedTickerVerse || now >= tickerVerseExpiry) {
        cachedTickerVerse = getRandomBibleVerse();
        tickerVerseExpiry = now + TICKER_VERSE_CACHE_MS;
      }
      return cachedTickerVerse;
    })()
  });
});
app.get("/stream", (req, res) => {
  const p1 = debateState.personality1 || { name: "Debater One", color: "#00ff00" };
  const p2 = debateState.personality2 || { name: "Debater Two", color: "#ff6b6b" };
  const history = debateState.history || [];
  const verse = BIBLE_VERSES[Math.floor(Math.random() * BIBLE_VERSES.length)] || { reference: "", text: "" };
  
  const historyHTML = history.slice(-8).map(arg => {
    const color = arg.side === "side1" ? p1.color : p2.color;
    const name = arg.side === "side1" ? p1.name : p2.name;
    return `<div class="argument ${arg.side}">
      <div class="arg-side" style="color: ${color}">${name} - Turn ${arg.turn}</div>
      <div class="arg-text">${arg.text}</div>
    </div>`;
  }).join("");
  
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="3">
  <title>Eternal Debate</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; cursor: none !important; }
    body {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      font-family: "Share Tech Mono", "Courier New", monospace;
      color: #00ff00;
      overflow: hidden;
    }
    .container { padding: 20px; height: 100vh; display: flex; flex-direction: column; }
    .header { text-align: center; margin-bottom: 20px; }
    .title { font-size: 48px; color: #00ff00; text-shadow: 0 0 20px #00ff00; }
    .topic { font-size: 24px; color: #ffffff; margin-top: 10px; }
    .debaters { display: flex; justify-content: space-around; margin: 20px 0; }
    .debater { text-align: center; }
    .debater-name { font-size: 32px; font-weight: bold; text-shadow: 0 0 15px; }
    .arguments { flex: 1; overflow-y: auto; padding: 20px; }
    .argument { margin: 15px 0; padding: 15px; background: rgba(0,255,0,0.1); border-left: 3px solid; border-radius: 5px; }
    .argument.side1 { border-color: ${p1.color}; }
    .argument.side2 { border-color: ${p2.color}; }
    .arg-side { font-size: 14px; opacity: 0.8; margin-bottom: 5px; }
    .arg-text { font-size: 18px; line-height: 1.6; }
    .verse { position: fixed; bottom: 20px; left: 20px; right: 20px; text-align: center; padding: 15px; background: rgba(0,0,0,0.7); border: 2px solid #00ff00; border-radius: 10px; }
    .verse-ref { font-size: 16px; color: #00ff00; margin-bottom: 5px; }
    .verse-text { font-size: 14px; color: #ffffff; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title">⚡ ETERNAL DEBATE ⚡</div>
      <div class="topic">${debateState.currentTopic || "Waiting for topic..."}</div>
    </div>
    <div class="debaters">
      <div class="debater">
        <div class="debater-name" style="color: ${p1.color}">${p1.name.toUpperCase()}</div>
      </div>
      <div class="debater">
        <div class="debater-name" style="color: ${p2.color}">${p2.name.toUpperCase()}</div>
      </div>
    </div>
    <div class="arguments">
      ${historyHTML}
    </div>
    <div class="verse">
      <div class="verse-ref">${verse.reference}</div>
      <div class="verse-text">"${verse.text}"</div>
    </div>
  </div>
</body>
</html>`);
});

app.get('/api/state', (req, res) => {
  res.json({
    topic: debateState.currentTopic,
    side: debateState.currentSide,
    turnNumber: debateState.turnNumber,
    history: debateState.history,
    mode: debateState.mode,
    queueLength: debateState.queue.length,
    personality1: debateState.personality1,
    personality2: debateState.personality2
  });
});

// Manual debate endpoint for testing
app.post('/api/debate', express.json(), (req, res) => {
  const { topic } = req.body;
  if (!topic) {
    return res.status(400).json({ error: 'Topic required' });
  }

  console.log(`Manual debate requested: ${topic}`);
  debateState.queue.push({
    topic,
    timestamp: Date.now(),
    source: 'manual'
  });

  // Trigger debate loop immediately
  setTimeout(() => debateLoop(), 100);

  res.json({ success: true, queuePosition: debateState.queue.length });
});

// SuperChat test endpoint for testing
app.post('/api/superchat', express.json(), async (req, res) => {
  const { username, message, amount } = req.body;
  if (!username || !message) {
    return res.status(400).json({ error: 'Username and message required' });
  }

  const superChatAmount = amount || 5.00; // Default to $5 if not specified
  console.log(`💰 TEST SUPERCHAT from ${username} ($${superChatAmount}): ${message}`);

  // Call the handleSuperChatMessage function directly
  try {
    await handleSuperChatMessage(username, message, superChatAmount);
    res.json({
      success: true,
      message: `SuperChat ($${superChatAmount}) processed! Debate added to priority queue.`,
      queuePosition: debateState.superChatQueue.findIndex(item =>
        item.username === username && item.topic === message
      ) + 1
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
// Pre-verse intro phrases
const VERSE_INTROS = [
  "Let's take a minute to cut through the noise...",
  "Ok... We've been fighting about nonsense, let's say something True...",
  "Shew that was stressful, let's chill out a bit and spit some facts...",
  "Hold up... Before the next round, let's talk about what really matters...",
  "Alright, enough debating. Time for some Truth...",
  "You know what? Let's pause and remember what's actually important...",
  "Real talk for a second... Here's something that never changes...",
  "Before we continue, let me share something eternal...",
  "All this back and forth... Let's ground ourselves in Truth...",
  "Hot take: None of this matters compared to this...",
  "Timeout. Let's get some perspective here...",
  "Forget the debate for a sec... This is what's real...",
  "Between rounds, a word of Truth...",
  "Y'all need to hear this...",
  "Breaking from the chaos to share something unchanging...",
  "Listen... While we argue, this remains constant...",
  "Let me hit you with some eternal wisdom real quick...",
  "All the noise aside, here's what's True...",
  "Intermission time. Let's talk about what lasts forever...",
  "Cool down moment. Some Truth for your soul..."
];

function getRandomVerseIntro() {
  return VERSE_INTROS[Math.floor(Math.random() * VERSE_INTROS.length)];
}
