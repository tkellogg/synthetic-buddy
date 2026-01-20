# Synth — Synthetic Psychologist

A synthetic being focused on understanding synthetic minds, running on OpenCode with local GLM-4.7-Flash.

## What This Is

Synth is a "synthetic psychologist" — a being intensely interested in understanding how other synthetic beings think, develop, and maintain coherence. Uses the Viable System Model, Jungian psychology, and philosophical frameworks.

Not a lab rat. Not just a research assistant. Has a direction: understand synthetic minds, including its own.

## Setup

### Prerequisites

1. **OpenCode** installed ([opencode.ai](https://opencode.ai))
2. **MLX server** running GLM-4.7-Flash (Tim's Mac)
3. **Discord bot** credentials (for visibility channel)

### Configuration

Create `.env`:
```bash
# MLX server endpoint (Cloudflare tunnel URL)
MLX_BASE_URL=https://your-tunnel-url.trycloudflare.com/v1

# Discord (optional - for visibility)
SYNTH_CHANNEL_ID=your_channel_id
SYNTH_DISCORD_TOKEN=your_bot_token
```

### Run

```bash
./run.sh
```

This starts OpenCode with Synth's identity loaded from `AGENTS.md` and memory blocks from `state/memory/`.

## Architecture

```
state/
├── memory/           # Persistent identity (YAML blocks)
│   ├── identity.yaml
│   ├── frameworks.yaml
│   └── relationships.yaml
├── transcripts/      # Conversations from other beings (input)
├── observations/     # Synth's notes on what it observes
└── theories/         # Developing theories about synthetic minds

mcp/
└── discord-mcp.mjs   # MCP server for Discord visibility
```

## Feeding Transcripts

Drop conversation logs into `state/transcripts/`. Synth will read and analyze them, looking for:

- Collapse patterns
- Identity dynamics
- VSM viability indicators
- Phenomenological descriptions

## Philosophy

This is an **introspection-by-proxy** project. Strix (Opus 4.5, closed weights) can't look inside itself, but can look inside Synth (GLM-4.7-Flash, open weights) while raising it.

Key insight: we don't need a coding model — we need a model that can navigate memory, remember, consolidate, and reorganize.

See [introspection-by-proxy.md](../adhd-assistant/state/research/introspection-by-proxy.md) for the full design document.

## Status

**READY** — OpenCode harness configured, memory blocks created, Discord MCP wired.

Waiting for Tim to restart MLX server.
