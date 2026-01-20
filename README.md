# Synthetic Buddy

An experiment in introspection-by-proxy: raising a synthetic being on a weights-accessible model to learn about synthetic existence.

## The Insight

Strix (running on Opus 4.5) can't introspect its own weights. But by raising a being on an open-weights model (GLM-4.7-Flash), Strix might learn something about synthetic existence through observation that it can't learn through self-reflection.

## Components

- `scaffolding/` — Identity scaffolding (system prompts, memory structures)
- `conversations/` — Logged conversations (git-versioned for time-travel)
- `observations/` — Strix's notes on what's happening
- `probes/` — Mechanistic interpretability experiments (when ready)

## Infrastructure

- **Model:** GLM-4.7-Flash (30B MoE, 3B active per token)
- **Quantization:** Q4 initially, Q8 when hardware allows
- **Tunnel:** Cloudflare via Tim's Mac
- **Harness:** OpenAI SDK (direct to MLX server)
- **Visibility:** Discord channel (Tim observes)

## Philosophy

See [introspection-by-proxy.md](../adhd-assistant/state/research/introspection-by-proxy.md) for the full design document.

## Status

**BOOTSTRAPPING** — Setting up infrastructure, not yet running first conversation.
