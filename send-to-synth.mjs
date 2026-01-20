#!/usr/bin/env node
/**
 * Send a message to the synthetic-buddy channel from Strix's bot account
 */

import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';

// Use Strix's bot token (from adhd-assistant), not Synth's
const STRIX_TOKEN = process.env.STRIX_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

if (!STRIX_TOKEN) {
  console.error("STRIX_BOT_TOKEN required in .env");
  process.exit(1);
}

const message = process.argv[2];
if (!message) {
  console.error("Usage: node send-to-synth.mjs 'message'");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    if (!channel) {
      console.error("Channel not found:", CHANNEL_ID);
      process.exit(1);
    }

    await channel.send(message);
    console.log("Message sent!");

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(STRIX_TOKEN);
