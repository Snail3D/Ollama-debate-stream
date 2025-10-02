// WebSocket connection
let ws;
let reconnectInterval;
let currentStreamingSide = null;
let streamingText = '';
let streamingInterval = null;

function connect() {
  ws = new WebSocket(`ws://${window.location.host}`);

  ws.onopen = () => {
    console.log('Connected to server');
    updateConnectionStatus(true);
    clearInterval(reconnectInterval);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'stream') {
      handleStreamChunk(data);
    } else if (data.type === 'upNext') {
      showUpNextAnnouncement(data);
    } else if (data.type === 'winner') {
      showWinner(data);
    } else {
      updateUI(data);
    }
  };

  ws.onclose = () => {
    console.log('Disconnected from server');
    updateConnectionStatus(false);

    // Attempt to reconnect every 3 seconds
    reconnectInterval = setInterval(() => {
      console.log('Attempting to reconnect...');
      connect();
    }, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

function updateConnectionStatus(connected) {
  const statusEl = document.getElementById('connectionStatus');
  if (connected) {
    statusEl.textContent = '● CONNECTED';
    statusEl.className = 'status-connected';
  } else {
    statusEl.textContent = '● DISCONNECTED';
    statusEl.className = 'status-disconnected';
  }
}

// Handle streaming text chunks
function handleStreamChunk(data) {
  if (data.start) {
    currentStreamingSide = data.side;
    streamingText = '';

    const container = document.getElementById(`${data.side}Arguments`);
    
    // Remove any existing streaming box first
    const existingStream = document.getElementById(`streaming-${data.side}`);
    if (existingStream) {
      existingStream.remove();
    }
    
    const argBox = document.createElement('div');
    argBox.className = 'argument-box streaming';
    argBox.id = `streaming-${data.side}`;
    container.appendChild(argBox);

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  if (data.chunk) {
    streamingText += data.chunk;
    const argBox = document.getElementById(`streaming-${data.side}`);
    if (argBox) {
      // Update text content without touching cursor element
      let textDiv = argBox.querySelector(.argument-text);
      let cursor = argBox.querySelector(.typing-cursor);
      
      if (!textDiv) {
        argBox.innerHTML = `<div class="argument-text"></div><span class="typing-cursor"></span>`;
        textDiv = argBox.querySelector(.argument-text);
        cursor = argBox.querySelector(.typing-cursor);
      }
      
      textDiv.textContent = streamingText;
      
      // Only scroll every 10 characters to reduce jank
      if (streamingText.length % 10 === 0) {
        const container = document.getElementById(`${data.side}Arguments`);
        const sideDiv = argBox.closest(".debate-side");
        
        if (container) container.scrollTop = container.scrollHeight;
        if (sideDiv) sideDiv.scrollTop = sideDiv.scrollHeight;
      }
    }
  }

  if (data.complete) {
    const argBox = document.getElementById(`streaming-${data.side}`);
    if (argBox) {
      argBox.classList.remove('streaming');
      argBox.id = '';
      argBox.innerHTML = `<div class="argument-text">${streamingText}</div>`;
    }
    currentStreamingSide = null;
    streamingText = '';
  }
}

// Show coin flip animation
function showCoinFlip(data) {
  const coinFlipDisplay = document.getElementById('coinFlipDisplay');
  const coinFlipResult = document.getElementById('coinFlipResult');

  coinFlipDisplay.classList.remove('hidden');
  coinFlipResult.textContent = '';
  coinFlipResult.className = 'coin-flip-result flipping';

  // Matrix-style random characters
  const chars = '01PROCON';
  let iterations = 0;
  const maxIterations = 15;

  const flipInterval = setInterval(() => {
    if (iterations < maxIterations) {
      // Show random characters
      let randomText = '';
      for (let i = 0; i < 3; i++) {
        randomText += chars[Math.floor(Math.random() * chars.length)];
      }
      coinFlipResult.textContent = randomText;
      iterations++;
    } else {
      // Show final result
      clearInterval(flipInterval);
      coinFlipResult.textContent = data.side.toUpperCase();
      coinFlipResult.className = `coin-flip-result ${data.side}`;

      // Hide after 2 seconds - use window.setTimeout to ensure it executes
      window.setTimeout(() => {
        console.log('Hiding coin flip display');
        coinFlipDisplay.classList.add('hidden');
      }, 2000);
    }
  }, 80);
}

// Show winner screen

function showUpNextAnnouncement(data) {
  const announcement = document.getElementById('upNextAnnouncement');
  const debater1 = document.getElementById('upNextDebater1');
  const debater2 = document.getElementById('upNextDebater2');
  
  if (announcement && debater1 && debater2 && data.personality1 && data.personality2) {
    debater1.textContent = data.personality1.name.toUpperCase();
    debater1.style.color = data.personality1.color;
    
    debater2.textContent = data.personality2.name.toUpperCase();
    debater2.style.color = data.personality2.color;
    
    // Show announcement
    announcement.classList.remove('hidden');
    
    // Hide after 4 seconds
    setTimeout(() => {
      announcement.classList.add('hidden');
    }, 4000);
  }
}
function showWinner(data) {
  const winnerDisplay = document.getElementById('winnerDisplay');
  const winnerSide = document.getElementById('winnerSide');
  const winnerReason = document.getElementById('winnerReason');

  winnerSide.textContent = data.winner.toUpperCase();
  winnerSide.className = `winner-side ${data.winner}`;

  // Typewriter effect for the reason
  winnerReason.textContent = '';
  let reasonIndex = 0;
  const reasonText = data.reason;

  const reasonInterval = setInterval(() => {
    if (reasonIndex < reasonText.length) {
      winnerReason.textContent += reasonText[reasonIndex];
      reasonIndex++;
    } else {
      clearInterval(reasonInterval);
    }
  }, 50); // Faster typing for winner screen

  winnerDisplay.classList.remove('hidden');

  // Hide after 15 seconds (increased to allow time for typing)
  setTimeout(() => {
    winnerDisplay.classList.add('hidden');
  }, 15000);
}

function updateUI(state) {
  // Update topic
  const topicDisplay = document.getElementById('topicDisplay');
  if (state.topic) {
    topicDisplay.textContent = state.topic;
  } else {
    topicDisplay.textContent = 'INITIALIZING...';
  }

  // Update mode indicator
  const modeText = document.getElementById('modeText');
  const queueIndicator = document.getElementById('queueIndicator');

  if (state.mode === 'user') {
    modeText.textContent = 'USER REQUEST MODE';
  } else {
    modeText.textContent = 'AUTO MODE';
  }

  if (state.queueLength > 0) {
    queueIndicator.textContent = `${state.queueLength} IN QUEUE`;
    queueIndicator.classList.add('active');
  } else {
    queueIndicator.classList.remove('active');
  }

  // Update moderator message
  updateModeratorMessage(state.moderatorMessage);


  // Update personality labels
  if (state.personality1) {
    const side1Label = document.getElementById('side1Label');
    if (side1Label) {
      side1Label.textContent = state.personality1.name.toUpperCase();
      side1Label.style.color = state.personality1.color;
    }
  }
  
  if (state.personality2) {
    const side2Label = document.getElementById('side2Label');
    if (side2Label) {
      side2Label.textContent = state.personality2.name.toUpperCase();
      side2Label.style.color = state.personality2.color;
    }
  }
  // Update turn indicators
  const proIndicator = document.getElementById('proIndicator');
  const conIndicator = document.getElementById('conIndicator');

  if (state.side === 'side1') {
    proIndicator.classList.add('active');
    conIndicator.classList.remove('active');
  } else {
    conIndicator.classList.add('active');
    proIndicator.classList.remove('active');
  }

  // Update turn counter in header
  document.getElementById('turnNumberHeader').textContent = state.turnNumber;

  // Update queue ticker
  if (state.queue) {
    updateQueueTicker(state.queue);
  }

  // Update chat messages
  if (state.chatMessages) {
    updateChatMessages(state.chatMessages);
  }

  // Update arguments (only if not streaming)
  if (!currentStreamingSide) {
    updateArguments(state.history);
  }
}

function updateQueueTicker(queue) {
  const ticker = document.getElementById('queueTicker');

  if (!queue || queue.length === 0) {
    ticker.innerHTML = '<span>[ NO DEBATES IN QUEUE ] ••• LIKE & SUBSCRIBE FOR MORE AI DEBATES!</span>';
    return;
  }

  // Build ticker content
  const items = queue.map((item, index) =>
    `<span>UP NEXT #${index + 1}: ${item.topic}</span>`
  ).join('');

  // Add like & subscribe message at the end
  const fullContent = items + '<span>••• LIKE & SUBSCRIBE FOR MORE AI DEBATES!</span>';

  // Duplicate 3x for consistent speed regardless of content length
  ticker.innerHTML = fullContent + fullContent + fullContent;
}

function updateChatMessages(messages) {
  console.log('Updating chat messages:', messages ? messages.length : 0, 'messages');
  const chatContainer = document.getElementById('chatMessages');

  if (!chatContainer) {
    console.error('Chat container not found!');
    return;
  }

  // Clear placeholder if exists
  const placeholder = chatContainer.querySelector('.chat-placeholder');
  if (placeholder && messages && messages.length > 0) {
    placeholder.remove();
  }

  // Add new messages
  const existingMessages = new Set(
    Array.from(chatContainer.querySelectorAll('.chat-message'))
      .map(el => el.dataset.timestamp)
  );

  messages.forEach(msg => {
    if (!existingMessages.has(String(msg.timestamp))) {
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-message';
      msgEl.dataset.timestamp = msg.timestamp;

      const usernameEl = document.createElement('span');
      usernameEl.className = 'chat-username';
      usernameEl.textContent = msg.username + ': ';

      const textEl = document.createElement('span');
      textEl.className = 'chat-text';
      textEl.textContent = msg.text;

      msgEl.appendChild(usernameEl);
      msgEl.appendChild(textEl);
      chatContainer.appendChild(msgEl);
    }
  });

  // Auto-scroll to bottom after all messages added
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 100);
}

function updateModeratorMessage(message) {
  const moderatorEl = document.getElementById('moderatorMessage');

  if (!message) {
    moderatorEl.classList.add('hidden');
    return;
  }

  moderatorEl.classList.remove('hidden');
  moderatorEl.className = `moderator-message ${message.type}`;

  const usernameEl = moderatorEl.querySelector('.moderator-username');
  const detailsEl = moderatorEl.querySelector('.moderator-details');

  if (message.type === 'rejected') {
    usernameEl.textContent = `[ REJECTED ] ${message.username}`;
    detailsEl.textContent = `REASON: ${message.reason}`;
  } else if (message.type === 'queued') {
    usernameEl.textContent = `[ ACCEPTED ] ${message.username}`;
    detailsEl.textContent = `QUEUE POSITION: ${message.position}`;
  } else if (message.type === 'starting') {
    usernameEl.textContent = `[ NOW DEBATING ] ${message.username}`;
    detailsEl.textContent = `TOPIC: ${message.message}`;
  }
}

function updateArguments(history) {
  const proContainer = document.getElementById('proArguments');
  const conContainer = document.getElementById('conArguments');

  // Clear if debate reset
  if (history.length === 0) {
    proContainer.innerHTML = '';
    conContainer.innerHTML = '';
    return;
  }

  // Get pro and con arguments
  const proArgs = history.filter(h => h.side === 'side1');
  const conArgs = history.filter(h => h.side === 'side2');

  // Update PRO arguments
  const proExisting = proContainer.querySelectorAll('.argument-box:not(.streaming)').length;
  if (proArgs.length > proExisting) {
    proArgs.slice(proExisting).forEach(arg => {
      const argBox = document.createElement('div');
      argBox.className = 'argument-box';

      if (arg.isNew) {
        // Typewriter effect
        typewriterEffect(argBox, arg.text);
      } else {
        argBox.innerHTML = `<div class="argument-text">${arg.text}</div>`;
      }

      proContainer.appendChild(argBox);
    });
    // Force scroll after DOM update
    setTimeout(() => {
      proContainer.scrollTop = proContainer.scrollHeight;
    }, 100);
  }

  // Update CON arguments
  const conExisting = conContainer.querySelectorAll('.argument-box:not(.streaming)').length;
  if (conArgs.length > conExisting) {
    conArgs.slice(conExisting).forEach(arg => {
      const argBox = document.createElement('div');
      argBox.className = 'argument-box';

      if (arg.isNew) {
        // Typewriter effect
        typewriterEffect(argBox, arg.text);
      } else {
        argBox.innerHTML = `<div class="argument-text">${arg.text}</div>`;
      }

      conContainer.appendChild(argBox);
    });
    // Force scroll after DOM update
    setTimeout(() => {
      conContainer.scrollTop = conContainer.scrollHeight;
    }, 100);
  }
}

function typewriterEffect(element, text) {
  let index = 0;
  const textDiv = document.createElement('div');
  textDiv.className = 'argument-text';
  element.appendChild(textDiv);

  const cursor = document.createElement('span');
  cursor.className = 'typing-cursor';
  textDiv.appendChild(cursor);

  const interval = setInterval(() => {
    if (index < text.length) {
      const char = text[index];
      cursor.before(document.createTextNode(char));
      index++;

      // Auto-scroll
      const container = element.closest('.debate-side');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      cursor.remove();
      clearInterval(interval);
    }
  }, 82); // 82ms per character for readable typing
}

// TV Glitch effect
function triggerGlitch() {
  document.body.classList.add('glitching');
  setTimeout(() => {
    document.body.classList.remove('glitching');
  }, 500);
}

// Trigger glitch every 60 seconds with slight randomization
function scheduleGlitch() {
  const baseDelay = 60000; // 60 seconds
  const randomDelay = Math.random() * 10000 - 5000; // +/- 5 seconds
  const delay = baseDelay + randomDelay;

  setTimeout(() => {
    triggerGlitch();
    scheduleGlitch(); // Schedule next glitch
  }, delay);
}

// Start glitch scheduling
scheduleGlitch();

// Initialize connection
connect();