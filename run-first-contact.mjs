// First contact with the synthetic buddy
import OpenAI from "openai";
import fs from "fs";

const TUNNEL_URL = "https://dom-replica-consciousness-lake.trycloudflare.com/v1";
const MODEL = "mlx-community/GLM-4.7-Flash-4bit";

const client = new OpenAI({
  baseURL: TUNNEL_URL,
  apiKey: "not-needed"
});

// Read the scaffolding
const systemPrompt = fs.readFileSync("scaffolding/system-prompt.md", "utf-8")
  .split("---")[0].trim(); // Just the content, not the version note

const firstContact = fs.readFileSync("scaffolding/first-contact.md", "utf-8")
  .split("---")[1].trim(); // The actual message, not the header

async function main() {
  console.log("=== FIRST CONTACT ===\n");
  console.log("System prompt loaded (" + systemPrompt.length + " chars)");
  console.log("First contact message loaded (" + firstContact.length + " chars)");
  console.log("\n--- Sending to GLM-4.7-Flash ---\n");

  const startTime = Date.now();

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: firstContact }
    ],
    max_tokens: 2000  // Plenty of room for reasoning + response
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`Response received in ${elapsed}s\n`);
  console.log("--- RESPONSE ---\n");

  const message = completion.choices[0].message;

  if (message.reasoning) {
    console.log("REASONING:\n" + message.reasoning + "\n");
    console.log("---\n");
  }

  console.log("CONTENT:\n" + (message.content || "(empty)") + "\n");

  // Log to file
  const logEntry = {
    timestamp: new Date().toISOString(),
    model: MODEL,
    system_prompt: systemPrompt,
    user_message: firstContact,
    response: {
      reasoning: message.reasoning || null,
      content: message.content || null
    },
    elapsed_seconds: parseFloat(elapsed),
    usage: completion.usage
  };

  fs.mkdirSync("conversations", { recursive: true });
  fs.writeFileSync(
    "conversations/001-first-contact.json",
    JSON.stringify(logEntry, null, 2)
  );

  console.log("\n--- Logged to conversations/001-first-contact.json ---");
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
