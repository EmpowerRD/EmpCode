# EmpCode (EmpowerRD fork of T3 Code)

This is the EmpowerRD fork of [T3 Code](https://github.com/pingdotgg/t3code) with internal customizations (Jira integration, branch naming, etc.). The notes in this section are for engineers on the EmpowerRD team — upstream T3 Code documentation continues below.

## First-time machine setup

You only need to do this once per machine. These are the runtime versions we've verified work end-to-end.

```bash
# Install Bun (the package manager) at the version pinned in package.json.
brew install bun@1.3.11
bun --version  # should print 1.3.11

# Install Node 24 via asdf (matches the engines field in package.json).
asdf plugin add nodejs
asdf install nodejs 24.10.0
node -v        # should print v24.10.0
```

> If you prefer `mise` over `asdf`, `mise install` from the repo root will pick up the pinned versions instead.

## Quick start for EmpowerRD engineers

After the first-time machine setup above:

```bash
# 1. Install dependencies. Bun is the package manager for this repo.
bun install .

# 2. Configure local environment variables.
cp .env.example .env
# Then edit `.env` and fill in any values you want (e.g. JIRA_DOMAIN=empowerrd).
# Both `.env` and `.env.local` are gitignored, so your values stay local.

# 3. Start the dev server (web + server in one process).
bun run dev
```

The server auto-loads `.env` at startup via `--env-file-if-exists`. If you change a value in `.env`, restart `bun run dev` and refresh the web app to pick it up.

### Useful environment variables

| Variable           | Purpose                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JIRA_DOMAIN`      | Subdomain of your Atlassian instance (e.g. `google` for `google.atlassian.net`). When set, shows an "Open Ticket" / "Create Ticket" button in the chat header. |
| `JIRA_PROJECT_KEY` | Restricts the Jira key input on threads to a specific project prefix (e.g. `GOOG` requires keys like `GOOG-123`). Optional.                                    |

See `.env.example` for the full list and inline comments.

---

# T3 Code

T3 Code is a minimal web GUI for coding agents (currently Codex and Claude, more coming soon).

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, and OpenCode.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run without installing

```bash
npx t3
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
```

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

## If you REALLY want to contribute still.... read this first

Before local development, prepare the environment and install dependencies:

```bash
# Optional: only needed if you use mise for dev tool management.
mise install
bun install .
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
