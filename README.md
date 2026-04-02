# AutoPR

A VS Code extension that uses Claude AI to automatically generate commit messages from your staged changes.

## Features

- Generates a commit message from your staged git diff using Claude AI
- Follows the [Conventional Commits](https://www.conventionalcommits.org/) specification
- One-click button in the Source Control input box
- API key stored securely in your OS keychain — never in plaintext

## Requirements

- An [Anthropic API key](https://console.anthropic.com) (free tier available)
- VS Code 1.94+
- A git repository

## Usage

1. Stage the files you want to commit (via `git add` or the VS Code Source Control panel)
2. Click the **sparkle button (✨)** in the commit message input box, or open the Command Palette (`Cmd+Shift+P`) and run **AutoPR: Generate Commit Message**
3. On first run, you will be prompted for your Anthropic API key — it is stored securely and never asked again
4. The commit message is written directly into the input box — review it and commit when ready

## Configuration

| Setting | Default | Description |
|---|---|---|
| `autopr.model` | `claude-opus-4-6` | Claude model used for generation. Switch to `claude-haiku-4-5-20251001` for faster, lower-cost generation. |

To change the model, open **Settings** (`Cmd+,`) and search for `autopr`.

## Installation

### From source

```bash
git clone https://github.com/morcen/vscode-autopr.git
cd vscode-autopr
npm install
npm run build
npx vsce package
code --install-extension vscode-autopr-0.1.0.vsix
```

### Updating

Pull the latest changes, rebuild, and reinstall:

```bash
git pull
npm run build
npx vsce package
code --install-extension vscode-autopr-0.1.0.vsix
```

VS Code will prompt you to reload — the new version takes over immediately.

## License

[MIT](LICENSE.md)
