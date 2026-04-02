import Anthropic from "@anthropic-ai/sdk";

function buildSystemPrompt(hasTemplate: boolean): string {
  const base = `You are an expert at writing clear, informative GitHub pull request descriptions.
Output ONLY a JSON object with two fields: "title" and "body".
- title: a concise PR title (max 72 chars), following Conventional Commits when appropriate`;

  if (hasTemplate) {
    return (
      base +
      `\n- body: fill in the provided PR template with the relevant information. Preserve all section headings from the template.

Example output:
{"title":"feat: add user authentication","body":"## Summary\\n- Added JWT-based login and registration endpoints\\n\\n## Changes\\n- ..."}`
    );
  }

  return (
    base +
    `\n- body: a markdown PR description with a brief summary of what changed and why

Example output:
{"title":"feat: add user authentication","body":"## Summary\\n- Added JWT-based login and registration endpoints\\n- Passwords are hashed with bcrypt\\n\\n## Changes\\n- ..."}`
  );
}

export async function generatePRContent(
  apiKey: string,
  model: string,
  branch: string,
  baseBranch: string,
  commits: string,
  diff: string,
  template: string | null
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
    system: buildSystemPrompt(template !== null),
    messages: [
      {
        role: "user",
        content: `Generate a pull request title and description for merging \`${branch}\` into \`${baseBranch}\`.

Commits:
${commits}

Diff:
\`\`\`diff
${truncatedDiff}
\`\`\`${template ? `\n\nPR Template to fill in:\n${template}` : ""}`,
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
