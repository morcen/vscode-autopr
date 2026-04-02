import * as vscode from "vscode";

interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: vscode.Event<boolean>;
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  readonly repositories: Repository[];
}

interface Repository {
  readonly inputBox: InputBox;
}

interface InputBox {
  value: string;
}

export function setScmInputBoxValue(message: string): boolean {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git");

  if (!gitExtension || !gitExtension.isActive) {
    return false;
  }

  const git = gitExtension.exports.getAPI(1);

  if (!git.repositories || git.repositories.length === 0) {
    return false;
  }

  git.repositories[0].inputBox.value = message;
  return true;
}
