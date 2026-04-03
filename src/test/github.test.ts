import { describe, it, expect } from "vitest";
import { parseRemoteUrl } from "../github";

describe("parseRemoteUrl", () => {
  describe("HTTPS URLs", () => {
    it("parses standard HTTPS URL", () => {
      expect(parseRemoteUrl("https://github.com/owner/repo")).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });

    it("parses HTTPS URL with .git suffix", () => {
      expect(parseRemoteUrl("https://github.com/owner/repo.git")).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });

});

  describe("SSH URLs", () => {
    it("parses standard SSH URL", () => {
      expect(parseRemoteUrl("git@github.com:owner/repo.git")).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });

    it("parses SSH URL without .git suffix", () => {
      expect(parseRemoteUrl("git@github.com:owner/repo")).toEqual({
        owner: "owner",
        repo: "repo",
      });
    });
  });

  describe("org and repo names", () => {
    it("handles hyphenated names", () => {
      expect(
        parseRemoteUrl("https://github.com/my-org/my-repo.git")
      ).toEqual({ owner: "my-org", repo: "my-repo" });
    });

    it("handles underscored names", () => {
      expect(
        parseRemoteUrl("git@github.com:my_org/my_repo.git")
      ).toEqual({ owner: "my_org", repo: "my_repo" });
    });
  });

  describe("invalid URLs", () => {
    it("throws on non-GitHub URL", () => {
      expect(() => parseRemoteUrl("https://gitlab.com/owner/repo.git")).toThrow(
        "Could not parse GitHub remote URL"
      );
    });

    it("throws on empty string", () => {
      expect(() => parseRemoteUrl("")).toThrow(
        "Could not parse GitHub remote URL"
      );
    });
  });
});
