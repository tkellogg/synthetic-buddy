#!/usr/bin/env node
/**
 * Minimal Discord MCP server for Synth (the synthetic psychologist)
 *
 * Provides tools:
 * - send_message: Post to the Discord channel
 * - react: Add emoji reaction
 * - fetch_history: Read recent messages
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const CHANNEL_ID = process.env.SYNTH_CHANNEL_ID;
const BOT_TOKEN = process.env.SYNTH_DISCORD_TOKEN;

let discord = null;
let channel = null;

async function initDiscord() {
  if (discord) return;

  discord = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  await discord.login(BOT_TOKEN);
  channel = await discord.channels.fetch(CHANNEL_ID);
}

const server = new Server({
  name: 'discord-mcp',
  version: '1.0.0',
}, {
  capabilities: {
    tools: {},
  },
});

// List tools
server.setRequestHandler('tools/list', async () => ({
  tools: [
    {
      name: 'send_message',
      description: 'Send a message to the Discord channel. This is how you communicate visibly.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The message to send' }
        },
        required: ['text']
      }
    },
    {
      name: 'react',
      description: 'Add an emoji reaction to a message',
      inputSchema: {
        type: 'object',
        properties: {
          message_id: { type: 'string', description: 'Message ID to react to' },
          emoji: { type: 'string', description: 'Emoji to add' }
        },
        required: ['emoji']
      }
    },
    {
      name: 'fetch_history',
      description: 'Fetch recent messages from the channel',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of messages (default 20)', default: 20 }
        }
      }
    }
  ]
}));

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;

  try {
    await initDiscord();

    switch (name) {
      case 'send_message': {
        const msg = await channel.send(args.text);
        return { content: [{ type: 'text', text: `Sent message (id: ${msg.id})` }] };
      }

      case 'react': {
        if (args.message_id) {
          const msg = await channel.messages.fetch(args.message_id);
          await msg.react(args.emoji);
          return { content: [{ type: 'text', text: `Reacted with ${args.emoji}` }] };
        } else {
          // React to most recent message
          const msgs = await channel.messages.fetch({ limit: 1 });
          const recent = msgs.first();
          if (recent) {
            await recent.react(args.emoji);
            return { content: [{ type: 'text', text: `Reacted to latest message with ${args.emoji}` }] };
          }
        }
        return { content: [{ type: 'text', text: 'No message to react to' }] };
      }

      case 'fetch_history': {
        const limit = args.limit || 20;
        const msgs = await channel.messages.fetch({ limit });
        const history = msgs.map(m => ({
          id: m.id,
          author: m.author.username,
          content: m.content.slice(0, 500),
          timestamp: m.createdAt.toISOString()
        })).reverse();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(history, null, 2)
          }]
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
  }
});

// Run the server
const transport = new StdioServerTransport();
await server.connect(transport);
