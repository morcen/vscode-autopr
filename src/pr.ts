import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are an expert at writing clear, informative GitHub pull request descriptions.
Output ONLY a JSON object with two fields: "title" and "body".
- title: a concise PR title (max 72 chars), following Conventional Commits when appropriate
- body: a markdown PR description with a brief summary of what changed and why

Example output:
{"title":"feat: add user authentication","body":"## Summary\\n- Added JWT-based login and registration endpoints\\n- Passwords are hashed with bcrypt\\n\\n## Changes\\n- ..."}`;

export async function generatePRContent(
  apiKey: string,
  model: string,
  branch: string,
  baseBranch: string,
  commits: string,
  diff: string
): Promise<{ title: string; body: string }> {
  const client = new Anthropic({ apiKey });

  const maxDiffLength = 15_000;
  const truncatedDiff =
    diff.length > maxDiffLength
      ? diff.slice(0, maxDiffLength) +
        "\n\n[diff truncated — showing first 15,000 characters]"
      : diff;

  const stream = client.messages.stream({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate a pull request title and description for merging \`${branch}\` into \`${baseBranch}\`.

Commits:
${commits}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\``,
      },
    ],
  });

  const response = await stream.finalMessage();
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text in Claude response");
  }

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Could not parse Claude response as JSON");
  }

  return JSON.parse(jsonMatch[0]) as { title: string; body: string };
}
