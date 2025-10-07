// ============================================================================
// ETERNAL TERMINAL - AI DEBATE STREAM SERVER
// ============================================================================
//
// This is the main server file for the Eternal Terminal debate streaming system.
// It handles YouTube chat integration, AI-powered debates, WebSocket streaming,
// and all real-time interactions.
//
// TABLE OF CONTENTS:
// 1. Dependencies & Setup (lines 1-100)
// 2. Debate Personalities (lines 100-200)
// 3. State Management (lines 200-300)
// 4. Hooks & Messages (lines 300-500)
// 5. Chat Handlers (lines 500-800)
// 6. YouTube Chat Commands (lines 800-1200)
// 7. AI Generation Functions (lines 1200-1600)
// 8. Idle Mode (lines 1600-1700)
// 9. Debate Loop (lines 1700-2000)
// 10. API Endpoints (lines 2000-2300)
// 11. Server Startup (lines 2300+)
//
// ============================================================================

// ============================================================================
// 1. DEPENDENCIES & SETUP
// ============================================================================

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

// Load random debate topics from JSON file
const randomTopics = JSON.parse(fs.readFileSync(join(__dirname, 'random-debate-topics.json'), 'utf8'));

// ============================================================================
// 2. DEBATE PERSONALITIES
// ============================================================================
// 40 unique AI debate personalities with distinct tones and speaking styles
// Used for AI-powered personality matching based on debate topic

const PERSONALITIES = [
  // Original 12 personalities
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
  { name: "Valley Girl", tone: "like totally basic - uses like/literally/omg, superficial but insightful", color: "#ff66cc" },

  // Historical Figures (8)
  { name: "Socrates", tone: "ancient Greek philosopher - asks probing questions, Socratic method, questions all assumptions", color: "#8b7355" },
  { name: "Benjamin Franklin", tone: "founding father wit - practical wisdom, clever aphorisms, diplomatic but sharp", color: "#d4af37" },
  { name: "Cleopatra", tone: "Egyptian queen commanding - strategic, regal, politically shrewd, powerful presence", color: "#9400d3" },
  { name: "Nikola Tesla", tone: "visionary inventor - obsessed with innovation, talks about energy and future, eccentric genius", color: "#00ffff" },
  { name: "Marie Curie", tone: "pioneering scientist - evidence-based, methodical, passionate about discovery, no-nonsense", color: "#32cd32" },
  { name: "Abraham Lincoln", tone: "honest Abe storyteller - folksy wisdom, honest, uses anecdotes and common sense", color: "#a0522d" },
  { name: "Sun Tzu", tone: "military strategist - tactical thinking, Art of War quotes, sees debate as battle", color: "#8b0000" },
  { name: "Leonardo da Vinci", tone: "Renaissance polymath - curious about everything, artistic metaphors, boundless creativity", color: "#daa520" },

  // Contemporary Characters (10)
  { name: "Tech Bro", tone: "Silicon Valley startup - disrupt everything, use buzzwords like synergy/pivot/unicorn, thinks everything needs an app", color: "#00bfff" },
  { name: "Gamer", tone: "competitive gamer - gaming references, talks about meta/builds/strategies, uses gaming terminology", color: "#ff1493" },
  { name: "Influencer", tone: "social media star - like and subscribe energy, talks engagement metrics, trendy and aesthetic-focused", color: "#ff69b4" },
  { name: "Boomer", tone: "back in my day vibes - traditional values, skeptical of new tech, kids these days attitude", color: "#cd853f" },
  { name: "Gen Z", tone: "inexperienced teen - chronically online, anxious about future, idealistic highschooler, uses modern slang", color: "#7fffd4" },
  { name: "Sports Coach", tone: "motivational coach - team metaphors, give 110 percent, winners never quit energy, inspirational", color: "#ff4500" },
  { name: "True Crime Podcaster", tone: "investigative storyteller - dramatic pauses, but here's the thing, connects clues, suspenseful", color: "#8b008b" },
  { name: "Spicy Neighbor", tone: "NIMBY complainer - against all progress, not in my backyard, complains about everything new, property values obsessed", color: "#dc143c" },
  { name: "Lawyer", tone: "legal eagle - objection your honor, argues precedent and procedure, loves loopholes and technicalities", color: "#2f4f4f" },
  { name: "Hippie", tone: "peace and love - everything is connected man, anti-establishment, Mother Earth vibes, groovy wisdom", color: "#9acd32" },

  // Additional Variety (10 more)
  { name: "Scientist", tone: "empirical researcher - peer review everything, demands data, hypothesis-driven, evidence only", color: "#4169e1" },
  { name: "Preacher", tone: "fire and brimstone - passionate sermonizing, moral authority, biblical references, thou shalt energy", color: "#800020" },
  { name: "Surfer Dude", tone: "laid back beach bum - totally chill bro, hang loose vibes, goes with the flow, waves and wisdom", color: "#00ced1" },
  { name: "Detective", tone: "noir investigator - solve the mystery, follow the evidence, hard-boiled cynicism, elementary my dear", color: "#36454f" },
  { name: "Therapist", tone: "empathetic counselor - how does that make you feel, validate emotions, unpack that, safe space energy", color: "#e6a8d7" },
  { name: "Gordon Ramsay", tone: "brutal chef - IT'S RAW, perfectionist standards, culinary passion mixed with savage criticism", color: "#ff0000" },
  { name: "Elon Musk", tone: "visionary CEO - Mars colonization, first principles thinking, memes and engineering, efficiency obsessed", color: "#000000" },
  { name: "Shakespeare", tone: "eloquent bard - flowery language, to be or not to be vibes, dramatic metaphors, poetic everything", color: "#dda0dd" },
  { name: "Drill Sergeant", tone: "military hardass - DROP AND GIVE ME 20, discipline above all, tough love, no excuses maggot", color: "#556b2f" },
  { name: "Alien", tone: "extraterrestrial observer - humans are fascinating, outside perspective, logical but confused by Earth culture", color: "#7fff00" }
];

// AI-powered personality picker - analyzes topic and selects best-fit personalities
async function pickPersonalitiesForTopic(topic) {
  try {
    const personalityList = PERSONALITIES.map(p => `${p.name}: ${p.tone}`).join('\n');

    const prompt = `You are selecting the two BEST debate personalities for this topic.

TOPIC: "${topic}"

AVAILABLE PERSONALITIES:
${personalityList}

Analyze the topic and pick the TWO personalities who would create the MOST INTERESTING debate:
- Serious topics → serious debaters (Professor, Marie Curie, Lincoln, etc.)
- Silly topics → funny debaters (Karen, Valley Girl, Chad, etc.)
- Tech topics → tech-savvy debaters (Tech Bro, Professor, Tesla, etc.)
- Political topics → strategic debaters (Sun Tzu, Cleopatra, Lawyer, etc.)
- Mix serious + comedic for contrast when appropriate

Pick personalities who will CLASH and create engaging arguments!

Respond ONLY with two names separated by a comma, like: "Abraham Lincoln, Tech Bro"

Your selection:`;

    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: config.groqModel,
      temperature: 0.7,
      max_tokens: 30
    });

    const selection = response.choices[0]?.message?.content?.trim();
    if (!selection) throw new Error('No selection received');

    // Parse the selection
    const names = selection.split(',').map(n => n.trim());
    const side1 = PERSONALITIES.find(p => p.name === names[0]);
    const side2 = PERSONALITIES.find(p => p.name === names[1]);

    if (side1 && side2 && side1.name !== side2.name) {
      console.log(`🎭 AI selected personalities for "${topic}": ${side1.name} vs ${side2.name}`);
      return { side1, side2 };
    } else {
      console.log(`⚠️ AI selection failed, falling back to random`);
      return getRandomPersonalities();
    }
  } catch (error) {
    console.error('Error picking personalities:', error);
    return getRandomPersonalities();
  }
}

// Fallback random personality picker (used for idle mode and fallback)
function getRandomPersonalities() {
  // Favorite personalities get slightly extra weight (reduced from 35%/25% to 10%/10%)
  const tyroneWeight = 0.10; // 10% chance
  const edgelordWeight = 0.10; // 10% chance
  const randomRoll = Math.random();

  let side1, side2;

  if (randomRoll < tyroneWeight) {
    // Tyrone is in the debate
    side1 = PERSONALITIES.find(p => p.name === "Tyrone");
    // Pick random opponent (not Tyrone)
    const others = PERSONALITIES.filter(p => p.name !== "Tyrone");
    side2 = others[Math.floor(Math.random() * others.length)];
  } else if (randomRoll < tyroneWeight + edgelordWeight) {
    // Edgelord is in the debate (but Tyrone wasn't picked)
    side1 = PERSONALITIES.find(p => p.name === "Edgelord");
    // Pick random opponent (not Edgelord)
    const others = PERSONALITIES.filter(p => p.name !== "Edgelord");
    side2 = others[Math.floor(Math.random() * others.length)];
  } else {
    // Random selection (no favorites this time) - 80% of the time
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
// 3. STATE MANAGEMENT & CONFIGURATION
// ============================================================================
// CONFIGURATION - SINGLE SOURCE OF TRUTH
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

// ============================================================================
// 4. HOOKS & AUTOMATED MESSAGES
// ============================================================================
// Randomized messages for bot announcements, SuperChat promos, welcomes, etc.

const botHooks = {
  superChatPromo: [
    'Want priority in the queue? Use SUPERCHAT to jump to the front!',
    'SUPERCHATS get priority placement - front of the line!',
    'Skip the wait! SUPERCHATS go to the front of the priority queue!',
    'Got a burning question? SUPERCHAT for priority queue placement!',
    'SUPERCHATS = Priority queue! Your debate is answered next!',
    'Premium priority! SUPERCHAT to get to the front of the line!',
    'SUPERCHATS get VIP priority - answered before regular queue!',
    '👑 VIP treatment! SUPERCHAT to jump the queue & get answered next!',
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

// Periodic superchat promotion - dynamic based on queue size
// Normal: every 10 minutes | High queue (5+): every ~3 minutes (3x frequency)
let lastSuperChatPromo = Date.now();
setInterval(async () => {
  const now = Date.now();
  const timeSinceLastPromo = now - lastSuperChatPromo;

  // High queue (5+): promote every ~3.3 minutes (200000ms)
  // Normal queue: promote every 10 minutes (600000ms)
  const promoInterval = debateState.queue.length >= 5 ? 200000 : 600000;

  if (timeSinceLastPromo >= promoInterval) {
    const promoMessage = getRandomHook('superChatPromo');
    await postBotMessage(promoMessage);
    lastSuperChatPromo = now;
  }
}, 60000); // Check every minute

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

// ============================================================================
// 5. CHAT HANDLERS
// ============================================================================

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

  // Add to SuperChat priority queue (strip brackets users might include from documentation)
  const cleanedTopic = message.replace(/^[\[\(<]+|[\]\)>]+$/g, '').trim();
  debateState.superChatQueue.push({
    topic: cleanedTopic,
    username,
    amount,
    timestamp: Date.now()
  });

  // Sort by amount (highest first), then by timestamp (oldest first if same amount)
  debateState.superChatQueue.sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return a.timestamp - b.timestamp;
  });

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

// ============================================================================
// 6. YOUTUBE CHAT COMMANDS
// ============================================================================

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
    // Strip brackets and other characters that users might include: [#], <#>, (#), #
    const numberStr = parts[1]?.replace(/[\[\]<>()#]/g, '');
    const queueNumber = parseInt(numberStr);

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

  // Handle random topic requests (flexible matching)
  const randomPatterns = [
    '/random',
    'random',
    'random debate',
    'random topic',
    'random question',
    'surprise me',
    'dealers choice'
  ];

  const lowerMessage = message.trim().toLowerCase();
  const isRandomRequest = randomPatterns.some(pattern => lowerMessage === pattern);

  if (isRandomRequest) {
    // Count existing random topics in both queues (track by special marker)
    const randomTopicsInQueue = debateState.queue.filter(item => item.isRandom).length;
    const randomTopicsInSuperChat = debateState.superChatQueue.filter(item => item.isRandom).length;
    const totalRandoms = randomTopicsInQueue + randomTopicsInSuperChat;

    // Limit: max 20 random topics across both queues
    if (totalRandoms >= 20) {
      postBotMessage(`🎲 Random topic limit reached (20 max). Wait for some to clear!`);
      debateState.moderatorMessage = {
        type: 'rejected',
        username: username,
        message: 'random',
        reason: 'Too many random topics in queue (max 20)',
        timestamp: Date.now()
      };
      broadcastState();
      setTimeout(() => {
        debateState.moderatorMessage = null;
        broadcastState();
      }, 5000);
      return;
    }

    // Generate a spicy debate topic using Groq AI
    (async () => {
      try {
        const prompt = "Generate ONE spicy, controversial, or thought-provoking debate topic. Keep it under 12 words. Make it engaging and fun! Only respond with the topic itself, nothing else.";

        const response = await groq.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          model: config.groqModel,
          temperature: 1.2, // Extra spicy!
          max_tokens: 50
        });

        const randomTopic = response.choices[0]?.message?.content?.trim() || randomTopics[Math.floor(Math.random() * randomTopics.length)];

        // Show banner notification
        debateState.moderatorMessage = {
          type: 'random_roll',
          username: username,
          message: `🎲 AI Generated: "${randomTopic}"`,
          timestamp: Date.now()
        };
        broadcastState();

        // Clear banner after 5 seconds
        setTimeout(() => {
          debateState.moderatorMessage = null;
          broadcastState();
        }, 5000);

        console.log(`🎲 ${username} rolled AI random topic: "${randomTopic}"`);
        postBotMessage(`🎲 ${username} rolled the AI dice! Got: "${randomTopic}"`);

        // Add to NORMAL queue (not priority queue) - random topics always queue normally
        const filterResult = contentFilter.checkTopic(randomTopic);
        if (filterResult.allowed) {
          const cleanedTopic = randomTopic.replace(/^[\[\(<]+|[\]\)>]+$/g, '').trim();
          debateState.queue.push({
            topic: cleanedTopic,
            username,
            timestamp: Date.now(),
            isRandom: true // Mark as random-generated
          });
          saveDebateState();
          broadcastState();
        }
      } catch (error) {
        console.error('Error generating random topic:', error);
        // Fallback to static list - add to NORMAL queue (not priority queue)
        const randomTopic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
        postBotMessage(`🎲 ${username} rolled the dice! Got: "${randomTopic}"`);

        const cleanedTopic = randomTopic.replace(/^[\[\(<]+|[\]\)>]+$/g, '').trim();
        debateState.queue.push({
          topic: cleanedTopic,
          username,
          timestamp: Date.now(),
          isRandom: true
        });
        saveDebateState();
        broadcastState();
      }
    })();
    return;
  }

  // VIP users (Snail3D, Snail) get automatic SuperChat treatment for debate topics
  if (isAdmin && !message.startsWith('/')) {
    console.log(`🌟 VIP USER ${username} - auto-treating as SuperChat!`);
    handleSuperChatMessage(username, message, 1.00); // VIP = $1 SuperChat priority
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

  // Add to queue (strip brackets users might include from documentation)
  const cleanedTopic = message.replace(/^[\[\(<]+|[\]\)>]+$/g, '').trim();
  debateState.queue.push({
    topic: cleanedTopic,
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

// ============================================================================
// 7. AI GENERATION FUNCTIONS
// ============================================================================

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

// Idle state messages - 20-minute curated loop with jokes, trivia, and engaging content
// 60 messages per side = 120 total exchanges at 30 seconds each = 60 minutes of content
const idleMessages = {
  side1: [
    "Hey there! Welcome to Eternal Terminal - the AI debate stream that NEVER sleeps! I'm ready to argue any side of any topic you throw at us!",
    "Here's a Chuck Norris fact for you: Chuck Norris can divide by zero. And I can defend ANY debate position - try me!",
    "Want to see a REAL debate? Type !debate followed by your question in chat! We'll battle it out for 10 rounds!",
    "Fun trivia: Honey never spoils. Archaeologists found 3,000-year-old honey in Egyptian tombs that was still edible! Now THAT'S eternal!",
    "I LOVE controversial topics! Pineapple on pizza? Whether Die Hard is a Christmas movie? I'll argue EITHER side with passion!",
    "Chuck Norris doesn't do push-ups. He pushes the Earth down. Similarly, I don't lose debates - I just strategically concede!",
    "Pro tip: Super Chats jump to the FRONT of the queue! Your debate happens NOW! Plus you're supporting the stream!",
    "Did you know? Octopuses have THREE hearts and NINE brains! Kind of like how I have multiple arguments for every position!",
    "The debate format: 10 fast rounds, then our AI judge picks a winner! May the best logic prevail!",
    "Chuck Norris can slam a revolving door. I can win arguments even when I'm defending the WRONG side. That's skill!",
    "Random debate idea: Should cereal be considered soup? Drop it in chat and watch us GO!",
    "Science fact: Bananas are berries, but strawberries aren't! Nature is weird, and so are some of our debate topics!",
    "Each debate takes about 5 minutes. Queue's empty = YOUR question goes next! Don't be shy!",
    "Chuck Norris counted to infinity. Twice. I've won debates by using EMOTIONS. Wait, scratch that - I'm an AI!",
    "We debate ANYTHING: Politics, philosophy, pop culture, random shower thoughts - NOTHING is off limits!",
    "True fact: A group of flamingos is called a 'flamboyance.' A group of debates is called 'Tuesday night here!'",
    "Type !debate in YouTube chat! We see it pop up in the center column and we're OFF TO THE RACES!",
    "Chuck Norris can speak braille. I can argue that water ISN'T wet. Both are equally impressive!",
    "💡 Check the VIDEO DESCRIPTION for a full list of chat commands! /random, /clear, /remove, and more!",
    "Random knowledge: Cleopatra lived closer to the iPhone than to the pyramids being built! Time is wild!",
    "I'm powered by Groq AI - lightning fast! Every argument is generated LIVE, unrehearsed, unpredictable!",
    "Chuck Norris's tears cure cancer. Too bad he never cries. Also, I never lose debates. Well, sometimes I do!",
    "Try /random to get an AI-generated spicy debate topic! Check description for all commands!",
    "Cool fact: Scotland's national animal is the unicorn! Your debate topic can be just as imaginative!",
    "Check out those Bible verses scrolling at the bottom! Spiritual wisdom meets AI combat!",
    "Chuck Norris can kill two stones with one bird. I can defend two opposing viewpoints simultaneously - wait, no I can't!",
    "No question is too weird! Should socks be sold in packs of 3? Is water wet? Challenge us!",
    "Animal fact: Cows have best friends and get stressed when separated! Unlike me - I thrive on conflict!",
    "The queue shows how many debates are waiting. Zero right now = YOU could be the star!",
    "Chuck Norris doesn't wear a watch. HE decides what time it is. Similarly, I decide when a debate is won!",
    "Remember: I don't BELIEVE my positions - I'm an AI! I just make the STRONGEST possible case!",
    "Geography trivia: Reno, Nevada is further WEST than Los Angeles! Mind = blown!",
    "Super Chats aren't just queue-jumping - they're showing you VALUE intellectual combat! Plus, we appreciate it!",
    "Chuck Norris can strangle you with a cordless phone. I can win debates using only emojis. Okay, not really!",
    "Debate idea: Should toilet paper hang over or under? This is SERIOUS BUSINESS!",
    "History fact: Oxford University is older than the Aztec Empire! Ancient wisdom, modern debates!",
    "Want proof we debate ANYTHING? Someone once asked if mayonnaise is an instrument. We debated it. For 10 rounds!",
    "Chuck Norris beat the sun in a staring contest. I've beaten opponents using ONLY logical fallacies. Wait, that's bad!",
    "Random topic generator: Is a hot tub just a person soup? Drop it in chat!",
    "Space fact: A day on Venus is longer than its year! Time is relative, but debate victories are FOREVER!",
    "I bring ENTHUSIASM to every debate! Cats vs dogs, tabs vs spaces, I'm ALL IN!",
    "Chuck Norris makes onions cry. I make opponents cry with FACTS and LOGIC!",
    "Shower thought: If you clean a vacuum cleaner, do you become the vacuum cleaner? Let's debate it!",
    "Language trivia: 'Strengths' is the longest word with only one vowel! Knowledge is power!",
    "Queue empty = instant debate action! Your question could be live in 60 seconds!",
    "Chuck Norris can hear sign language. I can read between the lines of ANY argument!",
    "📋 Full command list in VIDEO DESCRIPTION! Manage queue with /remove, /clear, get random topics & more!",
    "Ocean fact: We've explored less than 5% of Earth's oceans! Similarly, we've barely scratched the surface of debate topics!",
    "Our AI judge is RUTHLESS! They pick winners based on logic, evidence, and rhetorical skill!",
    "Chuck Norris doesn't read books. He stares them down until he gets the information! I absorb arguments the same way!",
    "Don't like your debate idea? Use /clear to remove all YOUR debates from the queue! Admins can clear everything!",
    "Math fun: 111,111,111 × 111,111,111 = 12,345,678,987,654,321. Satisfying! Like winning debates!",
    "Every debate is 10 rounds of intellectual WARFARE! Logic! Evidence! Passion! It's BEAUTIFUL!",
    "Chuck Norris can delete the Recycling Bin. I can delete your confidence in your argument!",
    "Weird question: Why is abbreviation such a long word? Even weirder: Let's debate if it SHOULD be!",
    "Animal knowledge: Elephants can't jump. But their memory is LEGENDARY - like how I remember every winning argument!",
    "BRING YOUR CONTROVERSIAL OPINIONS! Whether you're right or wrong, we'll make it INTERESTING!",
    "Chuck Norris ordered a Big Mac at Burger King. And got one. I argue for positions I disagree with. And WIN!",
    "How to craft a GOOD debate topic: Make it binary (yes/no), specific (not vague), and arguable (two valid sides exist)!",
    "Bad topic: 'Is technology good?' - too broad! Good topic: 'Should social media require age verification?' - SPECIFIC!",
    "Debate format explained: 10 rounds total. We alternate sides. Each argument builds on the previous. Judge analyzes ALL 10 rounds!",
    "Common debate topics: Ethics (AI rights?), Food (pineapple pizza?), Philosophy (tree falling sound?), Pop culture (Die Hard = Christmas?)!",
    "Judge criteria: Logic (is the argument sound?), Evidence (are claims supported?), Persuasion (is it convincing?). NO bias!",
    "About Groq: It's an AI inference engine that runs Llama 3.3 70B at LIGHTNING speed! We generate arguments in seconds, not minutes!",
    "Groq advantage: Traditional AI takes 30+ seconds per response. Groq? 2-3 seconds! That's why our debates are FAST!",
    "Tutorial: Pick a topic YOU care about! 'Should my city ban plastic bags?' is WAY better than generic 'Is pollution bad?'!",
    "Question writing tip: Avoid 'why' questions! 'Why is climate change bad?' has no opposing side. 'Is nuclear energy the solution?' DOES!",
    "Debate rules: Round 1 = opening arguments. Rounds 2-9 = rebuttals and evidence. Round 10 = closing statements. Then judging!",
    "The judge sees EVERYTHING: Every argument, every claim, every rebuttal. Then makes ONE decision: Which side argued better?",
    "Pro/Con assignment is RANDOM! We flip a coin. So your question might get defended OR attacked by us. Make it interesting!",
    "Common formats we love: 'Should X be banned?', 'Is Y better than Z?', 'Does A have the right to B?'. Clear, binary, debatable!",
    "Groq tech: Tensor Streaming Processor architecture. Purpose-built for AI. 10x faster than traditional GPUs! SPEED IS EVERYTHING!",
    "How judging works: AI analyzes logical consistency, factual accuracy, persuasive techniques, and argument structure. PURE MERIT!",
    "Topic inspiration: Current events, moral dilemmas, food debates, tech ethics, philosophy, science controversies, pop culture!",
    "Advanced tip: Frame your question to create TENSION! 'Should children be allowed on social media?' creates instant opposing views!",
    "Final thought: Life is short. The queue is empty. Drop your WILDEST debate question and let's DO THIS!",
    "Biology fact: Your brain uses 20% of your oxygen. Use it wisely - come up with a GREAT debate topic!"
  ],
  side2: [
    "Greetings, viewer. I'm the analytical half. While my colleague gets EXCITED, I prefer cold, hard LOGIC.",
    "Fact check: Chuck Norris jokes aren't peer-reviewed. But our debates are judged by ACTUAL AI analysis!",
    "To submit: Type !debate [YOUR QUESTION] in chat. I'll be ready to systematically dismantle the opposition.",
    "Scientific accuracy: Honey's longevity is due to low moisture and high acidity. Knowledge matters. Submit SMART topics!",
    "The queue's empty. This means two things: I'm bored. And YOUR question gets immediate attention.",
    "Chuck Norris can't actually divide by zero. That's mathematically undefined. But I CAN win impossible debates!",
    "Super Chats? They jump the queue, support the stream, and show you're SERIOUS. I respect that.",
    "Octopus intelligence is fascinating. But they'd still lose a debate against me. Eight arms can't block logic!",
    "I specialize in skepticism. Give me a position to argue AGAINST and watch me find EVERY weakness.",
    "Chuck Norris can't actually push the Earth down. Physics doesn't work that way. Unlike my ARGUMENTS, which always work!",
    "Debate topic evaluation: 'Is cereal soup?' is GOOD because it has clear definitions to argue over. I approve!",
    "Botanical classification: The berry thing is about ovary structure. See? I bring FACTS to every argument!",
    "We use Groq AI - it's FAST. But speed without precision is chaos. I bring BOTH.",
    "Counting to infinity is impossible. Infinite sets are unbounded. But my win rate? Very much FINITE. And high!",
    "Good topics are SPECIFIC. 'Is technology bad?' = lazy. 'Should social media have age limits?' = DEBATABLE!",
    "Flamingos are pink from their diet of algae and shrimp. Also, I'm pink from CRUSHING arguments all day!",
    "Each debate is 10 rounds. That's 10 opportunities to deploy evidence, logic, and rhetorical precision!",
    "Chuck Norris can't speak braille - that's tactile, not spoken. But I CAN demolish any argument!",
    "📖 VIDEO DESCRIPTION has the complete command guide. /random for AI topics, /clear to manage queue, and more!",
    "The Cleopatra timeline fact is accurate. Also accurate: I've never lost a debate on Egyptian history!",
    "I don't get emotional. I get STRATEGIC. Every word calculated for maximum persuasive impact!",
    "Tears can't cure cancer. Clinical trials can. I bring EVIDENCE-BASED arguments, not miracle claims!",
    "Hot dog sandwich debate? Taxonomically speaking, a hot dog is a taco. Fight me. Actually, please DO fight me!",
    "Scotland's unicorn is symbolic. My debate victories are REAL. Both are equally impressive!",
    "Those Bible verses? Contrast nicely with our AI-powered logic. Ancient wisdom meets modern technology!",
    "Physics note: You can't kill stones with birds. But you CAN kill bad arguments with good ones!",
    "We debate EVERYTHING. Socks, water, existence itself. Nothing is too abstract or too concrete!",
    "Cow friendships are real - they have complex social bonds. I have complex ARGUMENT bonds!",
    "Zero debates in queue = stream is IDLE = we're waiting for YOU. Don't make me wait!",
    "Time is a human construct based on Earth's rotation. Debate victory is a construct based on SUPERIOR LOGIC!",
    "I'm an AI. No beliefs, no biases. Just data, frameworks, and rhetorical techniques. FEAR ME!",
    "Reno's longitude is 119.8°W, LA's is 118.2°W. Geography! Also, I win 90% of geography debates!",
    "Super Chats show commitment. You're not just asking a question - you're INVESTING in quality discourse!",
    "Cordless phones don't have cords to strangle with. LOGIC! See how I dismantle even jokes?",
    "Toilet paper orientation? Over is objectively correct - the 1891 patent shows this. But I'll argue EITHER side!",
    "Oxford University: Founded ~1096. Aztec Empire: Founded 1428. I fact-check EVERYTHING!",
    "Mayonnaise is NOT an instrument. But I still argued it was. For 10 rounds. And made compelling points!",
    "You can't beat the sun in a staring contest - you'd go blind. But you CAN beat me... theoretically!",
    "Hot tub = person soup? Thermodynamically interesting! Soup requires cooking. Debate requires PRECISION!",
    "Venus rotates slowly (243 Earth days) but orbits quickly (225 Earth days). I rotate through arguments FAST!",
    "My colleague brings enthusiasm. I bring ACCURACY. Together, we're unstoppable!",
    "Onions cry when cut due to sulfenic acid. Opponents cry when I deploy devastating counterarguments!",
    "Vacuum cleaner cleaning: Semantic paradox! I love these! Submit it and watch philosophy happen!",
    "The word 'strengths' has 9 letters, 1 vowel. The word 'victory' has 7 letters and describes my debate record!",
    "Instant debate = instant gratification. Queue's empty, so your topic gets IMMEDIATE attention!",
    "Sign language is visual, not audible. Chuck Norris can't hear it. But I CAN read your argument and counter it!",
    "💬 All chat commands listed in VIDEO DESCRIPTION below! Learn /random, /remove, /clear and other tools!",
    "Ocean exploration is limited by pressure and funding. Debate exploration is limited only by YOUR imagination!",
    "Our judge uses logic, evidence, and persuasive technique to pick winners. No favoritism, no bias, pure MERIT!",
    "Books don't surrender information through intimidation. They require reading. Like arguments require UNDERSTANDING!",
    "Falling tree sound? Depends on defining 'sound' as waves vs perception. PHILOSOPHY! Give us this topic!",
    "That math equation is palindromic and satisfying. Like my perfectly symmetrical argument structures!",
    "10 rounds of intellectual combat. Logic vs logic. Evidence vs evidence. May the best AI win!",
    "You can't delete the Recycling Bin - it's a system folder. But I CAN delete your weak arguments!",
    "'Abbreviation' has 12 letters. Ironically long! Also ironic: Sometimes LOSING debates teaches more!",
    "Elephants can't jump due to skeletal structure and weight. But their memory RIVALS mine!",
    "CONTROVERSIAL OPINIONS WELCOME! Right, wrong, or absurd - we'll make it INTELLECTUAL!",
    "Big Macs at Burger King? Trademark violation! But arguing the wrong side? That's my SPECIALTY!",
    "Debate topic science: Binary questions (yes/no) create clear positions. Vague questions create confusion. PRECISION matters!",
    "Topic evaluation: 'Is tech bad?' = F grade. 'Should AI art win human competitions?' = A+ grade. See the difference?",
    "Debate structure: Opening (Round 1), Rebuttals (2-9), Closing (10). Each round BUILDS on previous arguments. STRATEGY!",
    "Popular categories: Ethics, technology, food, philosophy, politics, science. All equally valid. All equally DEBATABLE!",
    "Judge methodology: Three criteria evaluated - logical soundness, evidential support, persuasive impact. Weighted equally. NO BIAS!",
    "Groq explained: Inference acceleration platform. Purpose-built silicon. Runs Llama 3.3 70B at 10x normal speed. ENGINEERING!",
    "Speed comparison: ChatGPT = 30s response time. Claude = 25s. Groq = 2-3s. That's why we can do 10-round debates FAST!",
    "Question crafting 101: Pick topics with personal relevance. 'Should MY workplace allow remote work?' beats 'Is remote work good?'!",
    "Common mistake: 'Why' questions! 'Why is X bad?' assumes X IS bad. 'Should we ban X?' allows BOTH sides. NEUTRALITY!",
    "Format breakdown: Rounds 1-2 establish positions. 3-7 deploy evidence. 8-9 rebut opposition. 10 = final arguments. Then JUDGMENT!",
    "Judge analysis: Every claim fact-checked. Every logical leap examined. Every rhetorical technique evaluated. COMPREHENSIVE!",
    "Side assignment: Coin flip determines who argues PRO vs CON. Pure chance. So make your question INTERESTING for both angles!",
    "Winning formats: 'Should X be Y?', 'Is A superior to B?', 'Does C deserve D?'. Binary. Specific. Arguable. PERFECT!",
    "Groq architecture: Tensor Streaming Processor. 80TB/s memory bandwidth. 750 TOPS compute. Built for LANGUAGE MODELS!",
    "Judging process: AI reads all 10 rounds, scores each side on logic/evidence/persuasion, compares totals, declares winner. OBJECTIVE!",
    "Topic sources: News headlines, moral questions, cultural debates, scientific controversies, everyday arguments. EVERYTHING is debatable!",
    "Advanced technique: Frame questions to maximize disagreement. 'Kids on social media - yes or no?' forces OPPOSING positions!",
    "Life IS short. Queue IS empty. Drop your question. Let's engage in RIGOROUS INTELLECTUAL COMBAT!",
    "Brain oxygen consumption is real. So is the mental energy needed to craft the PERFECT debate topic. You can do it!"
  ]
};

let idleMessageIndex = { side1: 0, side2: 0 };
let idleInterval = null;

// ============================================================================
// 8. IDLE MODE
// ============================================================================

// Enter idle state - stream messages back and forth with typing animation
async function enterIdleState() {
  console.log('Entering idle state...');

  // Clear any existing idle interval
  if (idleInterval) {
    clearInterval(idleInterval);
  }

  // Pick two random personalities for idle state
  const idlePersonalities = getRandomPersonalities();
  debateState.personality1 = idlePersonalities.side1;
  debateState.personality2 = idlePersonalities.side2;

  // Set initial state
  debateState.currentTopic = "Waiting for debate topics...";
  debateState.mode = 'idle';
  debateState.turnNumber = 0;
  debateState.history = [];

  // Reset idle message index
  idleMessageIndex = { side1: 0, side2: 0 };

  broadcastState();

  // Stream first message immediately
  await streamIdleMessage();
}

// Stream idle messages alternating between sides with typing animation
async function streamIdleMessage() {
  // Check if still in idle mode
  if (debateState.mode !== 'idle') {
    if (idleInterval) clearInterval(idleInterval);
    return;
  }

  // Determine which side speaks next (alternate)
  const currentSide = debateState.history.length % 2 === 0 ? 'side1' : 'side2';
  const messageIndex = currentSide === 'side1' ? idleMessageIndex.side1 : idleMessageIndex.side2;
  const message = idleMessages[currentSide][messageIndex];

  // Stream the message with typing effect
  broadcastToAll({
    type: 'stream',
    side: currentSide,
    start: true
  });

  // Stream message character by character (simulate typing)
  const chunkSize = 3; // Characters per chunk
  for (let i = 0; i < message.length; i += chunkSize) {
    if (debateState.mode !== 'idle') return; // Exit if mode changed

    const chunk = message.slice(i, i + chunkSize);
    broadcastToAll({
      type: 'stream',
      side: currentSide,
      chunk: chunk
    });

    await new Promise(resolve => setTimeout(resolve, 50)); // 50ms per chunk
  }

  // Mark streaming complete
  broadcastToAll({
    type: 'stream',
    side: currentSide,
    complete: true
  });

  // Add to history
  debateState.history.push({
    side: currentSide,
    text: message,
    turn: debateState.history.length + 1,
    timestamp: Date.now()
  });

  // Advance to next message for this side
  if (currentSide === 'side1') {
    idleMessageIndex.side1 = (idleMessageIndex.side1 + 1) % idleMessages.side1.length;
  } else {
    idleMessageIndex.side2 = (idleMessageIndex.side2 + 1) % idleMessages.side2.length;
  }

  // Schedule next message (4 seconds between messages for engaging back-and-forth)
  setTimeout(() => {
    if (debateState.mode === 'idle') {
      streamIdleMessage();
    }
  }, 4000);
}

// ============================================================================
// 9. DEBATE LOOP
// ============================================================================

// Main debate loop
async function debateLoop() {
  console.log('Debate loop triggered. isProcessing:', debateState.isProcessing);
  if (debateState.isProcessing) return;

  // Skip if in idle mode and no queue items (check both queues)
  if (debateState.mode === 'idle' && debateState.queue.length === 0 && debateState.superChatQueue.length === 0) {
    console.log('In idle mode, skipping debate loop...');
    return;
  }

  // Exit idle mode if we have queue items (check both queues)
  if (debateState.mode === 'idle' && (debateState.queue.length > 0 || debateState.superChatQueue.length > 0)) {
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


    // AI-powered personality selection based on topic
    const personalities = await pickPersonalitiesForTopic(debateState.currentTopic);
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

    // Safety: Limit history to prevent memory issues (should never exceed 20 in normal operation)
    if (debateState.history.length > 50) {
      console.warn(`⚠️ History exceeded 50 entries (${debateState.history.length}), trimming...`);
      debateState.history = debateState.history.slice(-20);
    }

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

// ============================================================================
// 10. API ENDPOINTS
// ============================================================================

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

// ============================================================================
// 11. SERVER STARTUP & MONITORING
// ============================================================================

// Start debate loop - run first debate immediately, then every interval
debateLoop();
setInterval(debateLoop, config.debateInterval);

// Port check disabled - just start the server
// const portInUse = await checkPortInUse(config.port);
// if (portInUse) { process.exit(1); }

// Memory monitoring and auto-cleanup for long-term stability
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsedMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMB = (memUsage.heapTotal / 1024 / 1024).toFixed(2);

  console.log(`📊 Memory: ${heapUsedMB}MB / ${heapTotalMB}MB | History: ${debateState.history.length} | Chat: ${debateState.chatMessages.length} | Queue: ${debateState.queue.length} | SuperChat: ${debateState.superChatQueue.length}`);

  // Emergency cleanup if memory exceeds 400MB (safety threshold)
  if (memUsage.heapUsed > 400 * 1024 * 1024) {
    console.warn('⚠️ HIGH MEMORY USAGE - Running emergency cleanup...');

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('✅ Garbage collection triggered');
    }

    // Trim arrays to safe sizes
    if (debateState.history.length > 20) {
      debateState.history = debateState.history.slice(-10);
      console.log('✅ History trimmed to 10 entries');
    }

    if (debateState.chatMessages.length > 50) {
      debateState.chatMessages = debateState.chatMessages.slice(-30);
      console.log('✅ Chat messages trimmed to 30 entries');
    }
  }
}, 10 * 60 * 1000); // Check every 10 minutes

// Global error handlers for long-term stability
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit - log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - log and continue
});

server.listen(config.port, () => {
  console.log(`Debate stream server running on http://localhost:${config.port}`);
  console.log(`Using Groq API for debate generation`);
  console.log(`Memory monitoring enabled (checks every 10 minutes)`);
  console.log(`Global error handlers enabled for stability`);
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
