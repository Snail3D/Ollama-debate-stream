#!/bin/bash
# ============================================================================
# ETERNAL TERMINAL DEPLOYMENT SCRIPT
# ============================================================================
# Automatically syncs configuration and code to the server
#
# Usage: ./deploy.sh [options]
#   --config-only    Only update .env configuration
#   --stream-restart Restart the YouTube stream after deployment
#   --full          Full deployment (default)
# ============================================================================

set -e  # Exit on error

SERVER="root@45.33.13.140"
PASSWORD="wannabeGangsta84"
REMOTE_PATH="/root/ollama-debate-stream"

echo "🚀 Eternal Terminal Deployment"
echo "================================"

# Parse arguments
CONFIG_ONLY=false
STREAM_RESTART=false
FULL=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --config-only)
      CONFIG_ONLY=true
      FULL=false
      shift
      ;;
    --stream-restart)
      STREAM_RESTART=true
      shift
      ;;
    --full)
      FULL=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# 1. Deploy .env configuration
echo "📝 Deploying .env configuration..."
sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no .env $SERVER:$REMOTE_PATH/.env
echo "✅ .env deployed"

if [ "$CONFIG_ONLY" = true ]; then
  echo "🔄 Restarting server with new config..."
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER "cd $REMOTE_PATH && pm2 restart eternal-terminal --update-env"
  echo "✅ Server restarted"
  echo "🎉 Config-only deployment complete!"
  exit 0
fi

# 2. Deploy code files
if [ "$FULL" = true ]; then
  echo "📦 Deploying server code..."
  sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no server.js $SERVER:$REMOTE_PATH/server.js
  echo "✅ server.js deployed"

  echo "📦 Deploying public files..."
  sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=no -r public/* $SERVER:$REMOTE_PATH/public/
  echo "✅ Public files deployed"

  echo "🔄 Restarting server..."
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER "cd $REMOTE_PATH && pm2 restart eternal-terminal --update-env"
  echo "✅ Server restarted"
fi

# 3. Restart stream if requested
if [ "$STREAM_RESTART" = true ]; then
  echo "📺 Restarting YouTube stream..."
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER 'pkill -9 ffmpeg; pkill -9 Xvfb; pkill -f puppeteer; sleep 3 && cd /root/ollama-debate-stream && bash stream-to-youtube.sh > /tmp/stream.log 2>&1 &'
  echo "✅ Stream restarted"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📊 Current configuration:"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no $SERVER "cat $REMOTE_PATH/.env | grep -E 'YOUTUBE_VIDEO_ID|GROQ_API_KEY'"
echo ""
echo "🔗 Stream URL: https://www.youtube.com/watch?v=$(grep YOUTUBE_VIDEO_ID .env | cut -d'=' -f2)"
