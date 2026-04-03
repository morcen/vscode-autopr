import { describe, it, expect } from "vitest";
import { buildSystemPrompt, parsePRDocument } from "../pr";

describe("buildSystemPrompt", () => {
  it("does not mention template when hasTemplate is false", () => {
    const prompt = buildSystemPrompt(false);
    expect(prompt).not.toContain("template");
    expect(prompt).toContain("brief summary of what changed and why");
  });

  it("instructs to fill in template when hasTemplate is true", () => {
    const prompt = buildSystemPrompt(true);
    expect(prompt).toContain("fill in the provided PR template");
    expect(prompt).toContain("Preserve all section headings");
  });

  it("always requires JSON output with title and body", () => {
    expect(buildSystemPrompt(false)).toContain('"title"');
    expect(buildSystemPrompt(false)).toContain('"body"');
    expect(buildSystemPrompt(true)).toContain('"title"');
    expect(buildSystemPrompt(true)).toContain('"body"');
  });
});

describe("parsePRDocument", () => {
  it("parses title from first line and body from the rest", () => {
    const doc = "feat: add login\n\n## Summary\n- Added login endpoint";
    expect(parsePRDocument(doc)).toEqual({
      title: "feat: add login",
      body: "## Summary\n- Added login endpoint",
    });
  });

  it("trims whitespace from title", () => {
    const doc = "  feat: add login  \n\nsome body";
    expect(parsePRDocument(doc).title).toBe("feat: add login");
  });

  it("skips blank lines between title and body", () => {
    const doc = "title\n\n\n\nbody starts here";
    expect(parsePRDocument(doc).body).toBe("body starts here");
  });

  it("returns empty body when there is only a title", () => {
    expect(parsePRDocument("just a title")).toEqual({
      title: "just a title",
      body: "",
    });
  });

  it("preserves newlines within the body", () => {
    const doc = "title\n\nline one\nline two\nline three";
    expect(parsePRDocument(doc).body).toBe("line one\nline two\nline three");
  });

  it("handles markdown body correctly", () => {
    const doc =
      "fix: resolve null pointer\n\n## Summary\n- Fixed the issue\n\n## Testing\n- Added unit tests";
    const { title, body } = parsePRDocument(doc);
    expect(title).toBe("fix: resolve null pointer");
    expect(body).toContain("## Summary");
    expect(body).toContain("## Testing");
  });
});
