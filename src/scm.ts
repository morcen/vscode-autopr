import * as vscode from "vscode";

interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: vscode.Event<boolean>;
  getAPI(version: 1): GitAPI;
}

interface GitAPI {
  readonly repositories: GitRepository[];
  getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitRepository {
  readonly inputBox: InputBox;
}

interface InputBox {
  value: string;
}

export function setScmInputBoxValue(
  message: string,
  uri?: vscode.Uri
): boolean {
  const gitExtension =
    vscode.extensions.getExtension<GitExtension>("vscode.git");

  if (!gitExtension || !gitExtension.isActive) {
    return false;
  }

  const git = gitExtension.exports.getAPI(1);

  if (!git.repositories || git.repositories.length === 0) {
    return false;
  }

  const repo = uri
    ? git.getRepository(uri) ?? git.repositories[0]
    : git.repositories[0];

  if (!repo) {
    return false;
  }

  repo.inputBox.value = message;
  return true;
}
