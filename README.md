[![CI](https://github.com/morcen/vscode-autopr/actions/workflows/ci.yml/badge.svg)](https://github.com/morcen/vscode-autopr/actions/workflows/ci.yml)

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
2. Click the **robot button** in the commit message input box, or open the Command Palette (`Cmd+Shift+P`) and run **AutoPR: Generate Commit Message**
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
code --install-extension vscode-autopr-x.x.x.vsix
```
(replace x.x.x with the correct version)

### Updating

Pull the latest changes, rebuild, and reinstall:

```bash
git pull
npm run build
npx vsce package
code --install-extension vscode-autopr-x.x.x.vsix
```
(replace x.x.x with the correct version)

VS Code will prompt you to reload — the new version takes over immediately.

## Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository and clone it locally
2. Install dependencies: `npm install`
3. Open the project in VS Code and press `F5` to launch the Extension Development Host
4. Make your changes, then run `npm test` to verify nothing is broken
5. Submit a pull request with a clear description of what you changed and why

Please follow the existing code style and keep pull requests focused on a single change.

## License

[MIT](LICENSE.md)
