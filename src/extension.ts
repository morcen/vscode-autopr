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
  getPushStatus,
  hasUncommittedChanges,
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

async function openEditableDocument(
  content: string,
  language: string,
  notification: string
): Promise<string | undefined> {
  const doc = await vscode.workspace.openTextDocument({ content, language });
  await vscode.window.showTextDocument(doc, { preview: false });

  const choice = await vscode.window.showInformationMessage(
    notification,
    "Use This",
    "Cancel"
  );

  return choice === "Use This" ? doc.getText() : undefined;
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

      // Generate commit message
      const generated = await vscode.window.withProgress<string | undefined>(
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
            return await generateCommitMessage(apiKey!, diff, model);
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("401")) {
              await context.secrets.delete(SECRET_KEY);
              vscode.window.showErrorMessage(
                "AutoPR: Invalid API key. It has been cleared — run the command again to re-enter."
              );
            } else {
              vscode.window.showErrorMessage(`AutoPR: ${err}`);
            }
            return undefined;
          }
        }
      );

      if (!generated) {
        return;
      }

      const set = setScmInputBoxValue(generated.trim(), activeUri);
      if (!set) {
        await vscode.env.clipboard.writeText(generated.trim());
        vscode.window.showInformationMessage(
          "AutoPR: Commit message copied to clipboard (SCM input not found)."
        );
      } else {
        vscode.window.showInformationMessage(
          "AutoPR: Commit message generated."
        );
      }
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

      // Check uncommitted changes and push status
      try {
        const [pushStatus, uncommitted] = await Promise.all([
          getPushStatus(workspaceRoot, branch),
          hasUncommittedChanges(workspaceRoot),
        ]);

        if (uncommitted) {
          vscode.window.showWarningMessage(
            "AutoPR: You have uncommitted changes. These won't be included in the PR."
          );
        }

        if (!pushStatus.onRemote) {
          const confirm = await vscode.window.showInformationMessage(
            `AutoPR: Branch "${branch}" hasn't been pushed to GitHub. Push now?`,
            "Push",
            "Cancel"
          );
          if (confirm !== "Push") {
            return;
          }
          await pushBranch(workspaceRoot, branch);
        } else if (pushStatus.unpushedCount > 0) {
          const count = pushStatus.unpushedCount;
          const confirm = await vscode.window.showInformationMessage(
            `AutoPR: You have ${count} unpushed commit${count > 1 ? "s" : ""} on "${branch}". Push now?`,
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

      // --- Phase 2: AI generation ---
      const generated = await vscode.window.withProgress<
        { title: string; body: string } | undefined
      >(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AutoPR: Generating pull request...",
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
              return undefined;
            }

            return await generatePRContent(
              apiKey!,
              model,
              branch,
              baseBranch,
              commits,
              diff,
              template
            );
          } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("401")) {
              await context.secrets.delete(SECRET_KEY);
              vscode.window.showErrorMessage(
                "AutoPR: Invalid API key. It has been cleared — run the command again to re-enter."
              );
            } else {
              vscode.window.showErrorMessage(`AutoPR: ${err}`);
            }
            return undefined;
          }
        }
      );

      if (!generated) {
        return;
      }

      // Open editor for review — title on first line, blank line, then body
      const prDoc = `${generated.title}\n\n${generated.body}`;
      const edited = await openEditableDocument(
        prDoc,
        "markdown",
        'First line is the PR title. Edit below, then click "Use This".'
      );

      if (edited === undefined) {
        vscode.window.showInformationMessage("AutoPR: Cancelled.");
        return;
      }

      // Parse title (first line) and body (everything after first blank line)
      const lines = edited.split("\n");
      const finalTitle = lines[0].trim();
      const bodyStartIndex = lines.findIndex((l, i) => i > 0 && l.trim() !== "");
      const finalBody =
        bodyStartIndex >= 0
          ? lines.slice(bodyStartIndex).join("\n").trim()
          : "";

      // --- Phase 3: create PR ---
      try {
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
        vscode.window.showErrorMessage(`AutoPR: ${err}`);
      }
    }
  );

  context.subscriptions.push(commitCommand, prCommand);
}

export function deactivate() {}
