import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { join } from "path";

const execFileAsync = promisify(execFile);

export async function getGitHubToken(): Promise<string> {
  const session = await vscode.authentication.getSession("github", ["repo"], {
    createIfNone: true,
  });
  return session.accessToken;
}

export async function getRemoteInfo(
  cwd: string
): Promise<{ owner: string; repo: string }> {
  const { stdout } = await execFileAsync(
    "git",
    ["remote", "get-url", "origin"],
    { cwd }
  );
  const url = stdout.trim();

  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  throw new Error(`Could not parse GitHub remote URL: ${url}`);
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd }
  );
  return stdout.trim();
}

export async function getBaseBranch(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD"],
      { cwd }
    );
    // refs/remotes/origin/main → main
    return stdout.trim().replace("refs/remotes/origin/", "");
  } catch {
    return "main";
  }
}

export async function readPRTemplate(cwd: string): Promise<string | null> {
  const candidates = [
    join(cwd, ".github", "pull_request_template.md"),
    join(cwd, ".github", "PULL_REQUEST_TEMPLATE.md"),
  ];
  for (const filePath of candidates) {
    try {
      const content = await readFile(filePath, "utf8");
      return content.trim() || null;
    } catch {
      // not found — try next
    }
  }
  return null;
}

export async function getBranchDiff(
  cwd: string,
  baseBranch: string
): Promise<{ commits: string; diff: string }> {
  const [commitsResult, diffResult] = await Promise.all([
    execFileAsync(
      "git",
      ["log", `${baseBranch}..HEAD`, "--oneline", "--no-merges"],
      { cwd, maxBuffer: 1024 * 1024 }
    ),
    execFileAsync("git", ["diff", `${baseBranch}...HEAD`, "--unified=3"], {
      cwd,
      maxBuffer: 1024 * 1024 * 5,
    }),
  ]);

  return {
    commits: commitsResult.stdout.trim(),
    diff: diffResult.stdout,
  };
}

export async function isBranchPushed(
  cwd: string,
  branch: string
): Promise<boolean> {
  try {
    await execFileAsync(
      "git",
      ["rev-parse", "--verify", `origin/${branch}`],
      { cwd }
    );
    return true;
  } catch {
    return false;
  }
}

export async function pushBranch(cwd: string, branch: string): Promise<void> {
  await execFileAsync("git", ["push", "-u", "origin", branch], { cwd });
}

export async function getExistingPR(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${branch}&state=open`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );
  const prs = (await response.json()) as Array<{ html_url: string }>;
  return prs.length > 0 ? prs[0].html_url : null;
}

export async function createPR(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  baseBranch: string,
  title: string,
  body: string,
  draft: boolean
): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title, body, head: branch, base: baseBranch, draft }),
    }
  );

  if (!response.ok) {
    const error = (await response.json()) as { message?: string };
    throw new Error(error.message ?? `GitHub API error: ${response.status}`);
  }

  const pr = (await response.json()) as { html_url: string };
  return pr.html_url;
}
