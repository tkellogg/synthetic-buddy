// Test connection to MLX endpoint via OpenCode SDK
import { createOpencode } from "@opencode-ai/sdk";

async function main() {
  console.log("Creating OpenCode client...");

  // Point SDK at local opencode binary
  const { client } = await createOpencode({
    bin: "./node_modules/.bin/opencode",
    cwd: process.cwd()
  });

  console.log("Creating session...");
  const session = await client.session.create({
    body: { title: "Connection test" }
  });

  console.log("Session created:", session.id);

  console.log("Sending test prompt...");
  const result = await client.session.prompt({
    path: { id: session.id },
    body: {
      model: {
        providerID: "mlx-local",
        modelID: "mlx-community/GLM-4.7-Flash-4bit"
      },
      parts: [{ type: "text", text: "Say hello in exactly 5 words." }]
    }
  });

  console.log("Response:", result);
}

main().catch(console.error);
