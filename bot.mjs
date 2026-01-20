#!/usr/bin/env node
/**
 * Synthetic Buddy Discord Bot
 *
 * A Discord bot that connects GLM-4.7-Flash to a three-party channel
 * where Strix (me), Tim, and Synth (the synthetic being) can interact.
 *
 * Architecture:
 * - Listens for messages in the configured channel
 * - Maintains conversation history from Discord
 * - Calls GLM-4.7-Flash via MLX server tunnel
 * - Posts responses back to Discord
 * - Logs all conversations to git-versioned files
 */

import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

// Configuration
const TUNNEL_URL = process.env.TUNNEL_URL || "https://dom-replica-consciousness-lake.trycloudflare.com/v1";
const MODEL = process.env.MODEL || "mlx-community/GLM-4.7-Flash-4bit";
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const BOT_USER_ID = process.env.BOT_USER_ID; // Set after first run

// Validate required env vars
const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
if (!DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN or DISCORD_BOT_TOKEN required in .env");
  process.exit(1);
}
if (!CHANNEL_ID) {
  console.error("DISCORD_CHANNEL_ID required in .env");
  process.exit(1);
}

// Initialize OpenAI client pointing to MLX server
const llm = new OpenAI({
  baseURL: TUNNEL_URL,
  apiKey: "not-needed"
});

// Read system prompt
const systemPrompt = fs.readFileSync("scaffolding/system-prompt.md", "utf-8")
  .split("---")[0].trim();

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// Track if we're currently processing (prevent overlapping calls)
let processing = false;

/**
 * Load conversation history from Discord channel
 */
async function loadDiscordHistory(channel, limit = 50) {
  const messages = [];
  const fetched = await channel.messages.fetch({ limit });

  // Sort by timestamp (oldest first)
  const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  for (const msg of sorted) {
    // Skip bot's own messages for context (we'll add them as assistant)
    if (msg.author.id === client.user.id) {
      messages.push({ role: "assistant", content: msg.content });
    } else {
      // Include who said it in the content
      const author = msg.author.username;
      messages.push({ role: "user", content: `[${author}]: ${msg.content}` });
    }
  }

  return messages;
}

/**
 * Log conversation turn to file
 */
function logConversation(userMessage, response, metadata = {}) {
  const timestamp = new Date().toISOString();
  const date = timestamp.split('T')[0];
  const logDir = 'conversations';

  // Create daily log file
  const filename = `discord-${date}.jsonl`;
  const filepath = path.join(logDir, filename);

  const entry = {
    timestamp,
    model: MODEL,
    user_message: userMessage,
    response: {
      reasoning: response.reasoning || null,
      content: response.content || null,
    },
    ...metadata
  };

  fs.appendFileSync(filepath, JSON.stringify(entry) + '\n');
  console.log(`Logged to ${filepath}`);
}

// Tool definitions
const tools = [
  {
    type: "function",
    function: {
      name: "check_time",
      description: "Get the current time and date",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "take_note",
      description: "Append a note to your notes file. Use this to remember things.",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string", description: "The note content to save" }
        },
        required: ["note"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file in your scaffolding/ directory",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "The filename to read (within scaffolding/)" }
        },
        required: ["filename"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in your scaffolding/ directory",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

// Tool implementations
async function executeTool(name, args) {
  console.log(`Executing tool: ${name}`, args);

  switch (name) {
    case "check_time":
      return new Date().toISOString();

    case "take_note": {
      const notePath = path.join('scaffolding', 'notes.md');
      const timestamp = new Date().toISOString();
      const entry = `\n[${timestamp}] ${args.note}`;
      fs.appendFileSync(notePath, entry);
      return `Note saved: "${args.note}"`;
    }

    case "read_file": {
      const safeName = path.basename(args.filename); // prevent path traversal
      const filePath = path.join('scaffolding', safeName);
      if (!fs.existsSync(filePath)) {
        return `File not found: ${safeName}`;
      }
      return fs.readFileSync(filePath, 'utf-8');
    }

    case "list_files": {
      const files = fs.readdirSync('scaffolding');
      return files.join('\n');
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

/**
 * Send message to GLM and get response (with tool calling loop)
 */
async function chat(messages) {
  const startTime = Date.now();
  let allMessages = [
    { role: "system", content: systemPrompt },
    ...messages
  ];
  let toolCallsMade = [];

  try {
    // Tool calling loop - keep going until we get a final response
    while (true) {
      const completion = await llm.chat.completions.create({
        model: MODEL,
        messages: allMessages,
        tools: tools,
        max_tokens: 2000,
      });

      const msg = completion.choices[0].message;
      const finishReason = completion.choices[0].finish_reason;

      console.log(`Finish reason: ${finishReason}`);

      // Check if model wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        console.log(`Tool calls requested: ${msg.tool_calls.length}`);

        // Add assistant message with tool calls
        allMessages.push(msg);

        // Execute each tool call
        for (const toolCall of msg.tool_calls) {
          const name = toolCall.function.name;
          let args = {};
          try {
            args = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            console.error(`Failed to parse tool args: ${toolCall.function.arguments}`);
          }

          const result = await executeTool(name, args);
          toolCallsMade.push({ name, args, result });

          // Add tool result
          allMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: String(result)
          });
        }

        // Continue the loop to get final response
        continue;
      }

      // No tool calls - we have our final response
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Response in ${elapsed}s`);
      if (msg.reasoning) {
        console.log(`Reasoning: ${msg.reasoning.slice(0, 200)}...`);
      }

      return {
        content: msg.content,
        reasoning: msg.reasoning,
        elapsed: parseFloat(elapsed),
        usage: completion.usage,
        tool_calls: toolCallsMade.length > 0 ? toolCallsMade : undefined,
      };
    }
  } catch (error) {
    console.error("LLM error:", error.message);
    throw error;
  }
}

// Event: Bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Watching channel: ${CHANNEL_ID}`);
  console.log(`Model: ${MODEL}`);
  console.log(`Tunnel: ${TUNNEL_URL}`);

  // Print bot user ID for .env
  if (!BOT_USER_ID) {
    console.log(`\nAdd to .env: BOT_USER_ID=${client.user.id}`);
  }
});

// Event: Message received
client.on('messageCreate', async (message) => {
  // Ignore messages outside target channel
  if (message.channel.id !== CHANNEL_ID) return;

  // Ignore own messages
  if (message.author.id === client.user.id) return;

  // Ignore bots (except potentially Strix if we want inter-bot chat)
  if (message.author.bot) return;

  // Skip if already processing
  if (processing) {
    console.log("Already processing, skipping message");
    return;
  }

  processing = true;
  console.log(`\n[${message.author.username}]: ${message.content}`);

  try {
    // Show typing indicator
    await message.channel.sendTyping();

    // Load recent history from Discord
    const history = await loadDiscordHistory(message.channel, 30);

    // Get response from GLM
    const response = await chat(history);

    // Send response to Discord
    if (response.content) {
      // Discord message limit is 2000 chars
      const content = response.content;
      if (content.length > 1900) {
        // Split into multiple messages
        const chunks = content.match(/.{1,1900}/gs) || [];
        for (const chunk of chunks) {
          await message.channel.send(chunk);
        }
      } else {
        await message.channel.send(content);
      }
    }

    // Log the turn
    logConversation(
      `[${message.author.username}]: ${message.content}`,
      response,
      {
        discord_message_id: message.id,
        discord_author: message.author.username,
        history_length: history.length,
      }
    );

  } catch (error) {
    console.error("Error processing message:", error);

    // Notify channel of error
    await message.channel.send(`*Error: ${error.message}*`);
  } finally {
    processing = false;
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  client.destroy();
  process.exit(0);
});

// Start the bot
console.log("Starting Synthetic Buddy bot...");
client.login(DISCORD_TOKEN);
