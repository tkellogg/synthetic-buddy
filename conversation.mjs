// Continue conversation with synthetic buddy
import OpenAI from "openai";
import fs from "fs";
import path from "path";

const TUNNEL_URL = "https://dom-replica-consciousness-lake.trycloudflare.com/v1";
const MODEL = "mlx-community/GLM-4.7-Flash-4bit";

const client = new OpenAI({
  baseURL: TUNNEL_URL,
  apiKey: "not-needed"
});

// Read the scaffolding
const systemPrompt = fs.readFileSync("scaffolding/system-prompt.md", "utf-8")
  .split("---")[0].trim();

// Get next conversation number
function getNextConvoNumber() {
  const files = fs.readdirSync("conversations").filter(f => f.endsWith(".json"));
  if (files.length === 0) return 1;
  const numbers = files.map(f => parseInt(f.split("-")[0]));
  return Math.max(...numbers) + 1;
}

// Load conversation history
function loadHistory() {
  const files = fs.readdirSync("conversations")
    .filter(f => f.endsWith(".json"))
    .sort();

  const messages = [];
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join("conversations", file), "utf-8"));
    messages.push({ role: "user", content: data.user_message });
    if (data.response.content) {
      messages.push({ role: "assistant", content: data.response.content });
    }
  }
  return messages;
}

async function send(userMessage) {
  const history = loadHistory();
  const messages = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage }
  ];

  console.log(`Sending message (${history.length} prior turns)...`);
  const startTime = Date.now();

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
    max_tokens: 2000
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const message = completion.choices[0].message;

  console.log(`Response received in ${elapsed}s\n`);

  if (message.reasoning) {
    console.log("REASONING:\n" + message.reasoning + "\n---\n");
  }
  console.log("CONTENT:\n" + (message.content || "(empty)") + "\n");

  // Log to file
  const num = getNextConvoNumber();
  const slug = userMessage.slice(0, 30).replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const filename = `${String(num).padStart(3, "0")}-${slug}.json`;

  const logEntry = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    user_message: userMessage,
    response: {
      reasoning: message.reasoning || null,
      content: message.content || null
    },
    elapsed_seconds: parseFloat(elapsed),
    usage: completion.usage,
    history_length: history.length
  };

  fs.writeFileSync(path.join("conversations", filename), JSON.stringify(logEntry, null, 2));
  console.log(`--- Logged to conversations/${filename} ---`);

  return message.content;
}

// Get message from command line
const userMessage = process.argv.slice(2).join(" ");
if (!userMessage) {
  console.error("Usage: node conversation.mjs <message>");
  process.exit(1);
}

send(userMessage).catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
