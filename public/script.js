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

// Map side1/side2 to pro/con
function getSideContainer(side) {
  return side === 'side1' ? 'pro' : 'con';
}

// Handle streaming text chunks
function handleStreamChunk(data) {
  if (data.start) {
    currentStreamingSide = data.side;
    streamingText = '';

    const containerName = getSideContainer(data.side);
    const container = document.getElementById(`${containerName}Arguments`);
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
      argBox.innerHTML = `<div class="argument-text">${streamingText}<span class="typing-cursor"></span></div>`;
    }

    // Auto-scroll - use requestAnimationFrame for smoother scrolling
    const containerName = getSideContainer(data.side);
    const container = document.getElementById(`${containerName}Arguments`);
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
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
function showWinner(data) {
  const winnerDisplay = document.getElementById('winnerDisplay');
  const winnerSide = document.getElementById('winnerSide');
  const winnerReason = document.getElementById('winnerReason');

  // Use winnerName if available, otherwise fall back to winner
  winnerSide.textContent = (data.winnerName || data.winner).toUpperCase();
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

  // Update queue display
  const queueIndicator = document.getElementById('queueIndicator');

  // Display both queue counts with bigger text
  let queueText = '';
  if (state.superChatQueueLength > 0 && state.queueLength > 0) {
    queueText = `💰 ${state.superChatQueueLength} SUPER | 📋 ${state.queueLength} QUEUE`;
  } else if (state.superChatQueueLength > 0) {
    queueText = `💰 ${state.superChatQueueLength} SUPER QUEUE`;
  } else if (state.queueLength > 0) {
    queueText = `📋 ${state.queueLength} IN QUEUE`;
  } else {
    queueText = 'NO DEBATES QUEUED';
  }

  queueIndicator.textContent = queueText;
  queueIndicator.classList.add('active');

  // Update personality labels
  const proLabel = document.getElementById('proLabel');
  const conLabel = document.getElementById('conLabel');

  if (state.personality1 && state.personality1.name) {
    proLabel.textContent = state.personality1.name.toUpperCase();
  } else {
    proLabel.textContent = 'PRO';
  }

  if (state.personality2 && state.personality2.name) {
    conLabel.textContent = state.personality2.name.toUpperCase();
  } else {
    conLabel.textContent = 'CON';
  }

  // Update moderator message
  updateModeratorMessage(state.moderatorMessage);

  // Update turn indicators
  const proIndicator = document.getElementById('proIndicator');
  const conIndicator = document.getElementById('conIndicator');

  if (state.side === 'pro') {
    proIndicator.classList.add('active');
    conIndicator.classList.remove('active');
  } else {
    conIndicator.classList.add('active');
    proIndicator.classList.remove('active');
  }

  // Update turn counter in header
  document.getElementById('turnNumberHeader').textContent = state.turnNumber;

  // Update queue ticker
  updateQueueTicker(state.queue, state.superChatQueue);

  // Update chat messages
  if (state.chatMessages) {
    updateChatMessages(state.chatMessages);
  }

  // Update arguments (only if not streaming)
  if (!currentStreamingSide) {
    updateArguments(state.history);
  }
}

function updateQueueTicker(queue, superChatQueue) {
  const ticker = document.getElementById('queueTicker');

  // Combine both queues (priority first)
  const allQueues = [];

  // Add SuperChat items first (red)
  if (superChatQueue && superChatQueue.length > 0) {
    superChatQueue.forEach((item, index) => {
      allQueues.push({
        text: `💰 PRIORITY #${index + 1}: ${item.topic} ($${item.amount})`,
        isPriority: true
      });
    });
  }

  // Add regular queue items (yellow)
  if (queue && queue.length > 0) {
    queue.forEach((item, index) => {
      allQueues.push({
        text: `UP NEXT #${index + 1}: ${item.topic}`,
        isPriority: false
      });
    });
  }

  if (allQueues.length === 0) {
    ticker.innerHTML = '<span>[ NO DEBATES IN QUEUE ] ••• LIKE & SUBSCRIBE FOR MORE AI DEBATES!</span>';
    return;
  }

  // Build ticker content with color classes
  const items = allQueues.map(item => {
    const className = item.isPriority ? 'priority-item' : '';
    return `<span class="${className}">${item.text}</span>`;
  }).join('');

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
  const proArgs = history.filter(h => h.side === 'pro');
  const conArgs = history.filter(h => h.side === 'con');

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

      // Auto-scroll with requestAnimationFrame
      const container = element.closest('.debate-side');
      if (container) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight;
        });
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