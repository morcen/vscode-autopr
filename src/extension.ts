import * as vscode from "vscode";
import { getStagedDiff } from "./git";
import { generateCommitMessage } from "./claude";
import { setScmInputBoxValue } from "./scm";
import {
  getGitHubToken,
  getRemoteInfo,
  getCurrentBranch,
  getBaseBranch,
  getBranchDiff,
  isBranchPushed,
  pushBranch,
  getExistingPR,
  createPR,
} from "./github";
import { generatePRContent } from "./pr";

const SECRET_KEY = "autopr.anthropicApiKey";
const MAIN_BRANCHES = ["main", "master"];

interface GitExtension {
  readonly enabled: boolean;
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  readonly repositories: GitRepository[];
}

interface GitRepository {
  readonly state: { readonly HEAD: { readonly name?: string } | undefined };
  readonly onDidChangeState: vscode.Event<unknown>;
}

function setBranchContext(branch: string | undefined) {
  const isMain = !branch || MAIN_BRANCHES.includes(branch);
  vscode.commands.executeCommand(
    "setContext",
    "autopr.isNotMainBranch",
    !isMain
  );
}

function watchBranch(context: vscode.ExtensionContext) {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!gitExtension?.isActive) {
    return;
  }

  const git = gitExtension.exports.getAPI(1);
  if (!git.repositories.length) {
    return;
  }

  const repo = git.repositories[0];
  setBranchContext(repo.state.HEAD?.name);

  const listener = repo.onDidChangeState(() => {
    setBranchContext(repo.state.HEAD?.name);
  });

  context.subscriptions.push(listener);
}

export async function activate(context: vscode.ExtensionContext) {
  // Start watching immediately; retry once the git extension activates if needed
  watchBranch(context);
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (gitExt && !gitExt.isActive) {
    gitExt.activate().then(() => watchBranch(context));
  }

  // --- Generate Commit Message ---
  const commitCommand = vscode.commands.registerCommand(
    "autopr.generateCommitMessage",
    async () => {
      let apiKey = await context.secrets.get(SECRET_KEY);
      if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
          prompt: "Enter your Anthropic API key",
          password: true,
          ignoreFocusOut: true,
          placeHolder: "sk-ant-...",
        });
        if (!apiKey) {
          return;
        }
        await context.secrets.store(SECRET_KEY, apiKey);
      }

      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("AutoPR: No workspace folder open.");
        return;
      }

      let diff: string;
      try {
        diff = await getStagedDiff(workspaceRoot);
      } catch (err) {
        vscode.window.showErrorMessage(
          `AutoPR: Failed to get git diff. ${err}`
        );
        return;
      }

      if (!diff.trim()) {
        vscode.window.showWarningMessage(
          "AutoPR: No staged changes found. Stage some files first."
        );
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AutoPR: Generating commit message...",
          cancellable: false,
        },
        async () => {
          try {
            const model =
              vscode.workspace
                .getConfiguration("autopr")
                .get<string>("model") ?? "claude-opus-4-6";

            const message = await generateCommitMessage(apiKey!, diff, model);

            const set = setScmInputBoxValue(message);
            if (!set) {
              await vscode.env.clipboard.writeText(message);
              vscode.window.showInformationMessage(
                "AutoPR: Commit message copied to clipboard (SCM input not found)."
              );
            } else {
              vscode.window.showInformationMessage(
                "AutoPR: Commit message generated."
              );
            }
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("401")) {
              await context.secrets.delete(SECRET_KEY);
              vscode.window.showErrorMessage(
                "AutoPR: Invalid API key. It has been cleared — run the command again to re-enter."
              );
            } else {
              vscode.window.showErrorMessage(`AutoPR: ${err}`);
            }
          }
        }
      );
    }
  );

  // --- Create Pull Request ---
  const prCommand = vscode.commands.registerCommand(
    "autopr.createPullRequest",
    async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage("AutoPR: No workspace folder open.");
        return;
      }

      let apiKey = await context.secrets.get(SECRET_KEY);
      if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
          prompt: "Enter your Anthropic API key",
          password: true,
          ignoreFocusOut: true,
          placeHolder: "sk-ant-...",
        });
        if (!apiKey) {
          return;
        }
        await context.secrets.store(SECRET_KEY, apiKey);
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AutoPR: Creating pull request...",
          cancellable: false,
        },
        async () => {
          try {
            const model =
              vscode.workspace
                .getConfiguration("autopr")
                .get<string>("model") ?? "claude-opus-4-6";

            const [branch, baseBranch, remote] = await Promise.all([
              getCurrentBranch(workspaceRoot),
              getBaseBranch(workspaceRoot),
              getRemoteInfo(workspaceRoot),
            ]);

            // Check for existing PR
            const token = await getGitHubToken();
            const existing = await getExistingPR(
              token,
              remote.owner,
              remote.repo,
              branch
            );
            if (existing) {
              const open = await vscode.window.showInformationMessage(
                `AutoPR: A PR already exists for this branch.`,
                "Open PR"
              );
              if (open) {
                vscode.env.openExternal(vscode.Uri.parse(existing));
              }
              return;
            }

            // Push branch if not already pushed
            const pushed = await isBranchPushed(workspaceRoot, branch);
            if (!pushed) {
              const confirm = await vscode.window.showInformationMessage(
                `AutoPR: Branch "${branch}" hasn't been pushed. Push it now?`,
                "Push",
                "Cancel"
              );
              if (confirm !== "Push") {
                return;
              }
              await pushBranch(workspaceRoot, branch);
            }

            const { commits, diff } = await getBranchDiff(
              workspaceRoot,
              baseBranch
            );

            if (!commits) {
              vscode.window.showWarningMessage(
                `AutoPR: No commits found between "${branch}" and "${baseBranch}".`
              );
              return;
            }

            const { title, body } = await generatePRContent(
              apiKey!,
              model,
              branch,
              baseBranch,
              commits,
              diff
            );

            const prUrl = await createPR(
              token,
              remote.owner,
              remote.repo,
              branch,
              baseBranch,
              title,
              body
            );

            const open = await vscode.window.showInformationMessage(
              "AutoPR: Pull request created!",
              "Open PR"
            );
            if (open) {
              vscode.env.openExternal(vscode.Uri.parse(prUrl));
            }
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("401")) {
              await context.secrets.delete(SECRET_KEY);
              vscode.window.showErrorMessage(
                "AutoPR: Invalid API key. It has been cleared — run the command again to re-enter."
              );
            } else {
              vscode.window.showErrorMessage(`AutoPR: ${err}`);
            }
          }
        }
      );
    }
  );

  context.subscriptions.push(commitCommand, prCommand);
}

export function deactivate() {}
