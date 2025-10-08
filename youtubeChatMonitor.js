import axios from 'axios';

export class YouTubeChatMonitor {
  constructor(apiKey, videoId, messageCallback, chatCallback, superChatCallback) {
    this.apiKey = apiKey;
    this.videoId = videoId;
    this.messageCallback = messageCallback;
    this.chatCallback = chatCallback; // For all chat messages
    this.superChatCallback = superChatCallback; // For superchat priority
    this.liveChatId = null;
    this.nextPageToken = null;
    this.isRunning = false;
    this.pollInterval = 51000; // 51 seconds - stays within daily quota with 15% headroom
    this.seenMessageIds = new Set();
  }

  async getLiveChatId() {
    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'liveStreamingDetails',
          id: this.videoId,
          key: this.apiKey
        }
      });

      const video = response.data.items?.[0];
      if (!video?.liveStreamingDetails?.activeLiveChatId) {
        throw new Error('No active live chat found for this video');
      }

      return video.liveStreamingDetails.activeLiveChatId;
    } catch (error) {
      console.error('Error getting live chat ID:', error.message);
      return null;
    }
  }

  async pollMessages() {
    if (!this.liveChatId) {
      console.log('Attempting to get live chat ID...');
      this.liveChatId = await this.getLiveChatId();
      if (!this.liveChatId) {
        console.log('Failed to get live chat ID. Will retry...');
        return;
      }
      console.log('Live chat ID obtained:', this.liveChatId);
    }

    try {
      const params = {
        part: 'snippet,authorDetails',
        liveChatId: this.liveChatId,
        key: this.apiKey,
        maxResults: 50
      };

      if (this.nextPageToken) {
        params.pageToken = this.nextPageToken;
      }

      const response = await axios.get('https://www.googleapis.com/youtube/v3/liveChat/messages', {
        params
      });

      this.nextPageToken = response.data.nextPageToken;

      const messages = response.data.items || [];

      for (const message of messages) {
        const messageId = message.id;

        // Skip if we've already processed this message
        if (this.seenMessageIds.has(messageId)) {
          continue;
        }

        this.seenMessageIds.add(messageId);

        const username = message.authorDetails.displayName;
        const text = message.snippet.displayMessage;
        const messageType = message.snippet.type;
        const isSuperChat = messageType === 'superChatEvent';

        // Send all messages to chat display callback
        if (this.chatCallback) {
          this.chatCallback(username, text);
        }

        // SuperChats don't need !debate command - ANY superchat message becomes a debate
        if (isSuperChat && this.superChatCallback) {
          // Remove !debate prefix if present, otherwise use full message
          let topic = text.toLowerCase().startsWith('!debate ')
            ? text.substring(8).trim()
            : text.trim();

          console.log(`💰 SUPERCHAT from ${username}: ${topic}`);
          this.superChatCallback(username, topic);
        }
        // Admin commands starting with / (like /clear, /remove)
        else if (text.trim().startsWith('/')) {
          console.log(`Admin command from ${username}: ${text}`);
          this.messageCallback(username, text);
        }
        // Check for random topic requests (pass through as-is)
        else if (text.toLowerCase().trim() === 'random' ||
                 text.toLowerCase().trim() === 'random debate' ||
                 text.toLowerCase().trim() === 'random topic' ||
                 text.toLowerCase().trim() === 'random question' ||
                 text.toLowerCase().trim() === 'surprise me' ||
                 text.toLowerCase().trim() === 'dealers choice') {
          console.log(`YouTube random request from ${username}: ${text}`);
          this.messageCallback(username, text);
        }
        // Regular messages - accept "debate" or common typos like "debat"
        else if (text.toLowerCase().includes('debate') || text.toLowerCase().includes('debat')) {
          // Find where "debate" or "debat" starts and extract topic after it
          const lowerText = text.toLowerCase();
          let debateIndex = lowerText.indexOf('debate');
          let debateLength = 6; // "debate" is 6 chars

          // If "debate" not found, try "debat" typo
          if (debateIndex === -1) {
            debateIndex = lowerText.indexOf('debat');
            debateLength = 5; // "debat" is 5 chars
          }

          // Skip past "debate"/"debat" and any following punctuation/spaces
          let topicStart = debateIndex + debateLength;
          const remainingText = text.substring(topicStart);

          // Skip commas, spaces, colons, etc. and strip brackets/parens that users might include
          let topic = remainingText.replace(/^[\s,:\-]+/, '').trim();
          topic = topic.replace(/^[\[\(<]+|[\]\)>]+$/g, '').trim(); // Remove leading/trailing brackets

          if (topic) {
            console.log(`YouTube request from ${username}: ${topic}`);
            this.messageCallback(username, topic);
          }
        }
      }

      // Clean up old message IDs to prevent memory leak (keep last 1000)
      if (this.seenMessageIds.size > 1000) {
        const idsArray = Array.from(this.seenMessageIds);
        this.seenMessageIds = new Set(idsArray.slice(-1000));
      }

    } catch (error) {
      console.error('Error polling messages:', error.response?.data || error.message);

      // Reset live chat ID if it's invalid
      if (error.response?.status === 404) {
        console.log('Live chat no longer active. Will attempt to reconnect...');
        this.liveChatId = null;
      }
    }
  }

  start() {
    if (this.isRunning) {
      console.log('YouTube chat monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting YouTube chat monitor...');

    // Initial poll
    this.pollMessages();

    // Set up interval
    this.intervalId = setInterval(() => {
      if (this.isRunning) {
        this.pollMessages();
      }
    }, this.pollInterval);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('YouTube chat monitor stopped');
  }
}