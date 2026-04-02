import * as vscode from "vscode";
import { getStagedDiff } from "./git";
import { generateCommitMessage } from "./claude";
import { setScmInputBoxValue } from "./scm";

const SECRET_KEY = "autopr.anthropicApiKey";

export async function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
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

  context.subscriptions.push(command);
}

export function deactivate() {}
