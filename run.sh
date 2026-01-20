#!/bin/bash
# Launch Synth (the synthetic psychologist) via OpenCode
#
# Requires:
# - MLX_BASE_URL: Cloudflare tunnel URL to GLM-4.7-Flash
# - SYNTH_CHANNEL_ID: Discord channel ID
# - SYNTH_DISCORD_TOKEN: Bot token

set -e

cd "$(dirname "$0")"

# Load .env if exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Check required vars
if [ -z "$MLX_BASE_URL" ]; then
    echo "Error: MLX_BASE_URL not set (Cloudflare tunnel URL)"
    exit 1
fi

if [ -z "$SYNTH_CHANNEL_ID" ] || [ -z "$SYNTH_DISCORD_TOKEN" ]; then
    echo "Warning: Discord vars not set. MCP tools won't work."
fi

# Start OpenCode
echo "Starting Synth (synthetic psychologist) with GLM-4.7-Flash..."
echo "Model endpoint: $MLX_BASE_URL"
echo ""
exec opencode
