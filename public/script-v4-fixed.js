// Get the current content
const fs = require("fs");
let content = fs.readFileSync("/root/ollama-debate-stream/public/script-v4.js", "utf8");

// Add cache variables after streamingText
const insertAfter = "let streamingText = '';";
const varsToAdd = `
let lastQueueJSON = null;
let lastTickerHTML = null;`;

content = content.replace(insertAfter, insertAfter + varsToAdd);

// Replace the entire ticker function with the cached version
const functionStart = "function updateQueueTicker(queue, tickerVerse) {";
const functionEnd = "  ticker.innerHTML = fullContent + fullContent + fullContent;\n}";

const newFunction = `function updateQueueTicker(queue, tickerVerse) {
  const ticker = document.getElementById('queueTicker');

  if (!queue || queue.length === 0) {
    ticker.innerHTML = '<span>[ NO DEBATES IN QUEUE ] ••• LIKE & SUBSCRIBE FOR MORE AI DEBATES!</span>';
    lastQueueJSON = null;
    lastTickerHTML = null;
    return;
  }

  // Build ticker content
  const items = queue.map((item, index) =>
    \`<span>UP NEXT #\${index + 1}: \${item.topic}</span>\`
  ).join('');

  // Add Bible verse if available
  const verseSpan = (tickerVerse && tickerVerse.text) ? \`<span>••• \\"\${tickerVerse.text}\\" - \${tickerVerse.reference}</span>\` : \\"\\";

  // Add like & subscribe message at the end
  const fullContent = items + verseSpan + '<span>••• LIKE & SUBSCRIBE FOR MORE AI DEBATES!</span>';

  // Duplicate 3x for consistent speed
  const newHTML = fullContent + fullContent + fullContent;
  
  // CRITICAL: Only update innerHTML if content actually changed
  // This prevents CSS animation reset and eliminates glitching
  const queueJSON = JSON.stringify(queue);
  if (newHTML !== lastTickerHTML || queueJSON !== lastQueueJSON) {
    console.log("TICKER UPDATE - Queue or content changed");
    ticker.innerHTML = newHTML;
    lastTickerHTML = newHTML;
    lastQueueJSON = queueJSON;
  }
}`;

// Find the function and replace it
const startIdx = content.indexOf(functionStart);
const endIdx = content.indexOf(functionEnd, startIdx) + functionEnd.length;
content = content.substring(0, startIdx) + newFunction + content.substring(endIdx);

fs.writeFileSync("/root/ollama-debate-stream/public/script-v4.js", content);
console.log("Fixed!");
