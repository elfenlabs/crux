# Crux

> An interactive agentic terminal shell for infrastructure operations, powered by [Cog](https://github.com/yndc/cog).

Crux is a terminal-native AI agent that understands your infrastructure, executes operations with safety guardrails, and maintains persistent context across sessions.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- An OpenAI-compatible API endpoint (OpenAI, vLLM, OpenRouter, Ollama, etc.)

## Install

**Linux / macOS:**
```bash
curl -fsSL https://raw.githubusercontent.com/elfenlabs/crux/master/get-crux.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/elfenlabs/crux/master/get-crux.ps1 | iex
```

This installs Bun (if needed), clones the repo, and makes the `crux` command available globally. Re-run to update.

<details>
<summary>Manual install</summary>

```bash
git clone https://github.com/elfenlabs/crux.git
cd crux
bun install
./install.sh
```

</details>

### Configure

Create `~/.crux/config.yaml` (Windows: `%APPDATA%\crux\config.yaml`):

```yaml
model:
  provider: openai
  base_url: https://api.openai.com   # or your own endpoint
  model: gpt-4o                       # model identifier
  temperature: 0.3

agent:
  max_steps: 50
```

If using OpenAI directly, set your API key:

```bash
export OPENAI_API_KEY=sk-...
```

### Run

```bash
crux
```

Debug mode with request/response logging to `~/.crux/logs/`:

```bash
bun run dev --debug
```

## Configuration

All config lives under `~/.crux/` (Windows: `%APPDATA%\crux\`):

| File | Purpose |
|---|---|
| `config.yaml` | Model, agent, and UI settings |
| `sessions/` | Auto-saved conversation sessions (YAML) |

### Model Providers

Crux works with any OpenAI-compatible API. Set `base_url` accordingly:

| Provider | `base_url` |
|---|---|
| OpenAI | `https://api.openai.com` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Ollama | `http://localhost:11434/v1` |
| vLLM | `http://<host>:8000` |

## Built-in Tools

| Tool | Description |
|---|---|
| `exec_command` | Run a shell command on the local machine |
| `read_file` | Read file contents |
| `write_file` | Write/create a file |
| `web_search` | Search the web via DuckDuckGo |

## Usage

Just type what you want to do:

```
❯ check disk usage on this machine
❯ find the largest log files in /var/log
❯ what ports are currently listening?
```

Use **Ctrl+C** to abort a running agent response.

## Sessions

Crux automatically saves your conversation after each agent turn to `~/.crux/sessions/`.

```bash
crux --list                          # list all saved sessions
crux --resume                        # resume the most recent session
crux --resume 2026-02-17T10-51-20    # resume a specific session by ID
```

When resuming, Crux displays the last 10 messages for context so you can pick up where you left off.

## License

MIT
