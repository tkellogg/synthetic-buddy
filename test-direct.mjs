// Test direct connection to MLX endpoint via OpenAI SDK
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://dom-replica-consciousness-lake.trycloudflare.com/v1",
  apiKey: "not-needed" // MLX doesn't require auth
});

async function main() {
  console.log("Testing direct OpenAI-compatible connection to MLX...");

  const completion = await client.chat.completions.create({
    model: "mlx-community/GLM-4.7-Flash-4bit",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Say hello in exactly 5 words." }
    ],
    max_tokens: 50
  });

  console.log("Response:", completion.choices[0].message.content);
}

main().catch(console.error);
