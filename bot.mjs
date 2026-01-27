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
import yaml from 'js-yaml';

// Configuration
const TUNNEL_URL = process.env.TUNNEL_URL || "https://cds-early-processes-thee.trycloudflare.com/v1";
const MODEL = process.env.MODEL || "mlx-community/GLM-4.7-Flash-4bit";
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const BOT_USER_ID = process.env.BOT_USER_ID; // Set after first run

// Validate required env vars - use DISCORD_BOT_TOKEN explicitly (not DISCORD_TOKEN from global env)
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN;
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

/**
 * Load memory blocks from state/memory/*.yaml
 * Returns formatted string for injection into user prompt
 */
function loadMemoryBlocks() {
  const memoryDir = 'state/memory';
  if (!fs.existsSync(memoryDir)) {
    return '';
  }

  const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.yaml'));
  const blocks = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(memoryDir, file), 'utf-8');
      const parsed = yaml.load(content);
      if (parsed && parsed.value) {
        const blockName = file.replace('.yaml', '');
        blocks.push({
          name: blockName,
          value: parsed.value,
          sort: parsed.sort || 100 // default sort if not specified
        });
      }
    } catch (e) {
      console.error(`Failed to parse memory block ${file}:`, e.message);
    }
  }

  // Sort by sort order (lower = earlier)
  blocks.sort((a, b) => a.sort - b.sort);

  // Format as [block_name]\ncontent
  const formatted = blocks.map(b => `[${b.name}]\n${b.value.trim()}`).join('\n\n');

  if (formatted) {
    return `Memory from previous sessions:\n${formatted}\n\n---\n\n`;
  }
  return '';
}

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
 * Reduced limit to prevent OOMs - large input causes memory pressure
 */
async function loadDiscordHistory(channel, limit = 15) {
  const messages = [];
  const fetched = await channel.messages.fetch({ limit });

  // Sort by timestamp (oldest first)
  const sorted = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  for (const msg of sorted) {
    // Truncate individual messages to prevent bloat
    const content = msg.content.slice(0, 500);

    // Skip error messages from context (they poison the conversation)
    if (content.startsWith('*Error:') || content.includes('Connection error') ||
        content.includes('Bad Gateway') || content.includes('Argo Tunnel')) {
      continue;
    }

    // Skip bot's own messages for context (we'll add them as assistant)
    if (msg.author.id === client.user.id) {
      messages.push({ role: "assistant", content });
    } else {
      // Include who said it in the content
      const author = msg.author.username;
      messages.push({ role: "user", content: `[${author}]: ${content}` });
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
 * Parse tool calls from GLM's reasoning field
 * GLM emits XML-style tool calls: <tool_call>func_name<arg_key>key</arg_key><arg_value>val</arg_value></tool_call>
 * The mlx-lm server puts these in the reasoning field instead of the tool_calls structure
 */
function parseToolCallsFromReasoning(reasoning) {
  if (!reasoning) return [];

  const toolCalls = [];
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  const argKeyRegex = /<arg_key>(.*?)<\/arg_key>/g;
  const argValueRegex = /<arg_value>(.*?)<\/arg_value>/g;

  let match;
  let callId = 0;

  while ((match = toolCallRegex.exec(reasoning)) !== null) {
    const toolContent = match[1];

    // Extract function name (everything before first <arg_key> or end if no args)
    const argKeyIndex = toolContent.indexOf('<arg_key>');
    const funcName = argKeyIndex > 0
      ? toolContent.substring(0, argKeyIndex).trim()
      : toolContent.trim();

    // Extract arguments
    const args = {};
    const keys = [];
    const values = [];

    let keyMatch;
    while ((keyMatch = argKeyRegex.exec(toolContent)) !== null) {
      keys.push(keyMatch[1].trim());
    }

    let valueMatch;
    while ((valueMatch = argValueRegex.exec(toolContent)) !== null) {
      values.push(valueMatch[1].trim());
    }

    // Pair up keys and values
    for (let i = 0; i < Math.min(keys.length, values.length); i++) {
      args[keys[i]] = values[i];
    }

    toolCalls.push({
      id: `reasoning_call_${callId++}`,
      type: 'function',
      function: {
        name: funcName,
        arguments: JSON.stringify(args)
      }
    });

    console.log(`Parsed tool call from reasoning: ${funcName}`, args);
  }

  return toolCalls;
}

/**
 * Send message to GLM and get response (with tool calling loop)
 */
async function chat(messages) {
  const startTime = Date.now();

  // Load memory blocks and inject into user message section
  const memoryContext = loadMemoryBlocks();

  // Build message array: system prompt, then history with memory prefixed to first user message
  let allMessages = [{ role: "system", content: systemPrompt }];

  if (messages.length > 0 && memoryContext) {
    // Find first user message and prefix memory context to it
    let memoryInjected = false;
    for (const msg of messages) {
      if (!memoryInjected && msg.role === "user") {
        allMessages.push({
          role: "user",
          content: memoryContext + msg.content
        });
        memoryInjected = true;
      } else {
        allMessages.push(msg);
      }
    }
    // If no user message found, just add memory as a user message
    if (!memoryInjected) {
      allMessages.push({ role: "user", content: memoryContext });
    }
  } else {
    allMessages = [
      { role: "system", content: systemPrompt },
      ...messages
    ];
  }

  let toolCallsMade = [];

  try {
    // Tool calling loop - keep going until we get a final response
    while (true) {
      const completion = await llm.chat.completions.create({
        model: MODEL,
        messages: allMessages,
        tools: tools,
        max_tokens: 4000,
      });

      const msg = completion.choices[0].message;
      const finishReason = completion.choices[0].finish_reason;

      console.log(`Finish reason: ${finishReason}`);

      // Check if model wants to call tools
      // First check the standard tool_calls field (server parsed them)
      let effectiveToolCalls = msg.tool_calls || [];

      // If no tool_calls but reasoning contains <tool_call> tags, parse them
      // This handles GLM putting tool calls in the reasoning field
      if (effectiveToolCalls.length === 0 && msg.reasoning) {
        const parsedCalls = parseToolCallsFromReasoning(msg.reasoning);
        if (parsedCalls.length > 0) {
          console.log(`Found ${parsedCalls.length} tool call(s) in reasoning field`);
          effectiveToolCalls = parsedCalls;
        }
      }

      if (effectiveToolCalls.length > 0) {
        console.log(`Tool calls requested: ${effectiveToolCalls.length}`);

        // Add assistant message with tool calls
        // If we parsed from reasoning, reconstruct the message with tool_calls
        const assistantMsg = effectiveToolCalls === msg.tool_calls
          ? msg
          : { ...msg, tool_calls: effectiveToolCalls };
        allMessages.push(assistantMsg);

        // Execute each tool call
        for (const toolCall of effectiveToolCalls) {
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

  // Allow messages from Strix (BOT_USER_ID), ignore other bots
  if (message.author.bot && message.author.id !== BOT_USER_ID) return;

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
    // Reduced from 30 to 15 to prevent KV cache memory pressure on GLM
    const history = await loadDiscordHistory(message.channel, 15);

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

    // React with ❌ to signal error (don't post error text - it poisons context)
    try {
      await message.react('❌');
    } catch (reactError) {
      console.error("Failed to react:", reactError.message);
    }
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
