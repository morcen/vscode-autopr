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
  readPRTemplate,
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
  readonly onDidOpenRepository: vscode.Event<GitRepository>;
  getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitRepositoryState {
  readonly HEAD: { readonly name?: string } | undefined;
  readonly onDidChange: vscode.Event<void>;
}

interface GitRepository {
  readonly state: GitRepositoryState;
}

function setBranchContext(
  branch: string | undefined,
  statusBarItem: vscode.StatusBarItem
) {
  const isMain = !branch || MAIN_BRANCHES.includes(branch);
  vscode.commands.executeCommand(
    "setContext",
    "autopr.isNotMainBranch",
    !isMain
  );
  if (isMain) {
    statusBarItem.hide();
  } else {
    statusBarItem.show();
  }
}

function watchBranch(
  context: vscode.ExtensionContext,
  statusBarItem: vscode.StatusBarItem
) {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git");
  if (!gitExtension?.isActive) {
    return;
  }

  const git = gitExtension.exports.getAPI(1);

  function attachToRepo(repo: GitRepository) {
    setBranchContext(repo.state.HEAD?.name, statusBarItem);
    const listener = repo.state.onDidChange(() => {
      setBranchContext(repo.state.HEAD?.name, statusBarItem);
    });
    context.subscriptions.push(listener);
  }

  for (const repo of git.repositories) {
    attachToRepo(repo);
  }

  const openListener = git.onDidOpenRepository((repo) => {
    attachToRepo(repo);
  });
  context.subscriptions.push(openListener);
}

export async function activate(context: vscode.ExtensionContext) {
  const prStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10
  );
  prStatusBarItem.command = "autopr.createPullRequest";
  prStatusBarItem.text = "$(git-pull-request) Create PR";
  prStatusBarItem.tooltip = "AutoPR: Create Pull Request";
  prStatusBarItem.hide();
  context.subscriptions.push(prStatusBarItem);

  // Start watching immediately; retry once the git extension activates if needed
  watchBranch(context, prStatusBarItem);
  const gitExt = vscode.extensions.getExtension("vscode.git");
  if (gitExt && !gitExt.isActive) {
    gitExt.activate().then(() => watchBranch(context, prStatusBarItem));
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

      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const workspaceRoot = activeUri
        ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
          ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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

            const confirmed = await vscode.window.showInputBox({
              value: message,
              prompt: "Edit commit message or press Enter to accept",
              ignoreFocusOut: true,
            });

            if (confirmed === undefined) {
              vscode.window.showInformationMessage("AutoPR: Cancelled.");
              return;
            }

            const set = setScmInputBoxValue(confirmed, activeUri);
            if (!set) {
              await vscode.env.clipboard.writeText(confirmed);
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
      // --- Phase 1: setup and user interaction ---
      const activeUri = vscode.window.activeTextEditor?.document.uri;
      const workspaceRoot = activeUri
        ? vscode.workspace.getWorkspaceFolder(activeUri)?.uri.fsPath
          ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

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

      let branch: string;
      let detectedBase: string;
      let remote: { owner: string; repo: string };
      let token: string;

      try {
        [branch, detectedBase, remote, token] = await Promise.all([
          getCurrentBranch(workspaceRoot),
          getBaseBranch(workspaceRoot),
          getRemoteInfo(workspaceRoot),
          getGitHubToken(),
        ]);
      } catch (err) {
        vscode.window.showErrorMessage(`AutoPR: ${err}`);
        return;
      }

      // Check for existing PR
      try {
        const existing = await getExistingPR(token, remote.owner, remote.repo, branch);
        if (existing) {
          const open = await vscode.window.showInformationMessage(
            "AutoPR: A PR already exists for this branch.",
            "Open PR"
          );
          if (open) {
            vscode.env.openExternal(vscode.Uri.parse(existing));
          }
          return;
        }
      } catch (err) {
        vscode.window.showErrorMessage(`AutoPR: ${err}`);
        return;
      }

      // Push if not already pushed
      try {
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
      } catch (err) {
        vscode.window.showErrorMessage(`AutoPR: ${err}`);
        return;
      }

      // Base branch confirmation
      const baseBranch = await vscode.window.showInputBox({
        value: detectedBase,
        prompt: "Merge into branch",
        ignoreFocusOut: true,
      });
      if (baseBranch === undefined) {
        vscode.window.showInformationMessage("AutoPR: Cancelled.");
        return;
      }

      // Draft PR option
      const prType = await vscode.window.showQuickPick(
        ["Ready for review", "Draft"],
        { placeHolder: "PR type", ignoreFocusOut: true }
      );
      if (prType === undefined) {
        vscode.window.showInformationMessage("AutoPR: Cancelled.");
        return;
      }
      const draft = prType === "Draft";

      // --- Phase 2: AI generation and PR creation ---
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

            const [{ commits, diff }, template] = await Promise.all([
              getBranchDiff(workspaceRoot!, baseBranch),
              readPRTemplate(workspaceRoot!),
            ]);

            if (!commits) {
              vscode.window.showWarningMessage(
                `AutoPR: No commits found between "${branch}" and "${baseBranch}".`
              );
              return;
            }

            const { title: generatedTitle, body: generatedBody } =
              await generatePRContent(
                apiKey!,
                model,
                branch,
                baseBranch,
                commits,
                diff,
                template
              );

            // Preview: title
            const finalTitle = await vscode.window.showInputBox({
              value: generatedTitle,
              prompt: "Edit PR title or press Enter to accept",
              ignoreFocusOut: true,
            });
            if (finalTitle === undefined) {
              vscode.window.showInformationMessage("AutoPR: Cancelled.");
              return;
            }

            // Preview: body
            const finalBody = await vscode.window.showInputBox({
              value: generatedBody,
              prompt: "Edit PR description or press Enter to accept",
              ignoreFocusOut: true,
            });
            if (finalBody === undefined) {
              vscode.window.showInformationMessage("AutoPR: Cancelled.");
              return;
            }

            const prUrl = await createPR(
              token,
              remote.owner,
              remote.repo,
              branch,
              baseBranch,
              finalTitle,
              finalBody,
              draft
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
