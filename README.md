# Crux

> An interactive agentic terminal shell for infrastructure operations, powered by [Cog](https://github.com/yndc/cog).

Crux is a terminal-native AI agent that understands your infrastructure, executes operations with safety guardrails, and maintains persistent context across sessions.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+
- An OpenAI-compatible API endpoint (OpenAI, vLLM, OpenRouter, Ollama, etc.)

## Setup

### 1. Clone & install

```bash
git clone https://github.com/elfenlabs/crux.git
cd crux
bun install
```

### 2. Create config

Create `~/.config/crux/crux.yaml`:

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

### 3. Run

```bash
bun run dev
```

Debug mode with request/response logging to `~/.config/crux/logs/`:

```bash
bun run dev --debug
```

## Configuration

All config lives under `~/.config/crux/`:

| File | Purpose |
|---|---|
| `crux.yaml` | Model, agent, and UI settings |

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

## License

MIT
