import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are an expert at writing concise, informative git commit messages.
You follow the Conventional Commits specification when appropriate.
Output ONLY the commit message — no explanation, no markdown, no quotes.
The message should be a single subject line (max 72 chars), optionally followed by
a blank line and a short body if the changes are complex.`;

export async function generateCommitMessage(
  apiKey: string,
  diff: string,
  model: string
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const maxDiffLength = 15_000;
  const truncatedDiff =
    diff.length > maxDiffLength
      ? diff.slice(0, maxDiffLength) +
        "\n\n[diff truncated — showing first 15,000 characters]"
      : diff;

  const stream = client.messages.stream({
    model,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate a commit message for these staged changes:\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``,
      },
    ],
  });

  const response = await stream.finalMessage();

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }

  return textBlock.text.trim().replace(/^["']|["']$/g, "");
}
