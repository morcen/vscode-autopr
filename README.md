[![CI](https://github.com/morcen/vscode-autopr/actions/workflows/ci.yml/badge.svg)](https://github.com/morcen/vscode-autopr/actions/workflows/ci.yml)

# AutoPR

A VS Code extension that uses Claude AI to automatically generate commit messages and pull request descriptions from your changes.

## Features

- Generates a commit message from your staged git diff using Claude AI
- Generates a pull request title and description from your branch diff using Claude AI
- Follows the [Conventional Commits](https://www.conventionalcommits.org/) specification
- Respects your `.github/pull_request_template.md` when generating PR descriptions
- One-click button in the Source Control input box and status bar
- API key stored securely in your OS keychain — never in plaintext

## Requirements

- An [Anthropic API key](https://console.anthropic.com) (free tier available)
- VS Code 1.94+
- A git repository

## Usage

### Generate a commit message

1. Stage the files you want to commit (via `git add` or the VS Code Source Control panel)
2. Click the **robot button** in the commit message input box, or open the Command Palette (`Cmd+Shift+P`) and run **AutoPR: Generate Commit Message**
3. On first run, you will be prompted for your Anthropic API key — it is stored securely and never asked again
4. The commit message is written directly into the input box — review it and commit when ready

### Create a pull request

1. Check out the feature branch you want to open a PR for
2. Click the **Create PR** button in the status bar, or run **AutoPR: Create Pull Request** from the Command Palette
3. If the branch has unpushed commits, you will be asked to push first
4. Confirm the base branch and choose between a draft or ready-for-review PR
5. Claude generates a title and description from your branch diff — review and edit them in the preview, then click **Use This**
6. The PR is created on GitHub and you can open it directly from the notification

## Setup

### 1. Get an Anthropic API key

<!-- TODO: add screenshot of Anthropic Console API key page -->
![Anthropic Console — API key page](docs/images/setup-01-anthropic-console.png)

Go to [console.anthropic.com](https://console.anthropic.com), sign in, and create a new API key. Copy it — you will need it in the next step.

### 2. Install the extension

<!-- TODO: add screenshot of the VSIX install command or Extensions panel -->
![Installing the extension in VS Code](docs/images/setup-02-install-extension.png)

Follow the steps in the [Installation](#installation) section below to install the `.vsix` file.

### 3. Enter your API key

<!-- TODO: add screenshot of the API key prompt in VS Code -->
![API key prompt](docs/images/setup-03-api-key-prompt.png)

On first use of either command, VS Code will ask for your Anthropic API key. Paste it in and press Enter. It is stored in your OS keychain and never asked again.

### 4. Authenticate with GitHub

<!-- TODO: add screenshot of the GitHub OAuth prompt in VS Code -->
![GitHub authentication prompt](docs/images/setup-04-github-auth.png)

When you run **AutoPR: Create Pull Request** for the first time, VS Code will prompt you to sign in with GitHub. This grants the extension access to create pull requests on your behalf. If OAuth is unavailable, you will be asked for a Personal Access Token with the `repo` scope instead.

### 5. You're ready

<!-- TODO: add screenshot of the status bar button and the SCM robot button -->
![AutoPR buttons in VS Code](docs/images/setup-05-ready.png)

The **robot button** appears in the Source Control input box for generating commit messages. The **Create PR** button appears in the status bar whenever you are on a non-main branch.

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
