// Minimal vscode mock for unit tests — only what the tested modules reference
export const authentication = {
  getSession: () => Promise.resolve({ accessToken: "mock-token" }),
};

export const workspace = {
  getConfiguration: () => ({ get: () => undefined }),
  workspaceFolders: [],
  openTextDocument: () => Promise.resolve({}),
};

export const window = {
  showInformationMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showWarningMessage: () => Promise.resolve(undefined),
  showInputBox: () => Promise.resolve(undefined),
  showTextDocument: () => Promise.resolve(undefined),
  createStatusBarItem: () => ({ show: () => {}, hide: () => {}, dispose: () => {} }),
};

export const commands = {
  executeCommand: () => Promise.resolve(),
  registerCommand: () => ({ dispose: () => {} }),
};

export const extensions = {
  getExtension: () => undefined,
};

export const Uri = {
  parse: (s: string) => ({ toString: () => s }),
};

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export enum ProgressLocation {
  Notification = 15,
}

export const env = {
  clipboard: { writeText: () => Promise.resolve() },
  openExternal: () => Promise.resolve(),
};
