# Crux — Product Requirements Document

> **An interactive agentic terminal shell for infrastructure operations, powered by [Cog](https://github.com/yndc/cog).**

Crux is to ops what opencode is to coding — a terminal-native AI agent that understands your infrastructure, executes operations with safety guardrails, and maintains persistent context across sessions.

---

## 1. Vision

An ops engineer opens Crux, types *"the staging API is returning 502s, investigate"*, and the agent:

1. Looks up the staging cluster from the infra database
2. Checks pod status via `kubectl`
3. SSHs into the relevant node to inspect nginx logs
4. Identifies a config mismatch
5. Proposes a fix, waits for confirmation
6. Applies it and verifies the 502s are gone

All within a single conversational session, streaming reasoning and output to a beautiful terminal UI.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         crux (CLI)                           │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │  TUI Layer │  │  Session   │  │   Config & Profiles    │ │
│  │  (ink)     │  │  Manager   │  │                        │ │
│  └─────┬──────┘  └─────┬──────┘  └───────────┬────────────┘ │
│        │               │                      │              │
│  ┌─────┴───────────────┴──────────────────────┴────────────┐ │
│  │                    Agent Controller                      │ │
│  │         (orchestrates cog + safety + infra)              │ │
│  ├──────────────────────────────────────────────────────────┤ │
│  │                                                          │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │  Safety  │  │  Infra   │  │  Tool    │              │ │
│  │  │  Layer   │  │  Layer   │  │  Registry│              │ │
│  │  └──────────┘  └──────────┘  └──────────┘              │ │
│  │                                                          │ │
│  └──────────────────────────────────────────────────────────┘ │
│                           │                                   │
│                    ┌──────┴──────┐                            │
│                    │  cog SDK    │                            │
│                    │  (engine)   │                            │
│                    └─────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+ / Bun |
| Language | TypeScript (strict) |
| Agent Engine | `cog` (npm dependency) |
| TUI | ink (React for CLIs) |
| SSH | ssh2 (persistent connections) |
| K8s | @kubernetes/client-node |
| Storage | SQLite (via better-sqlite3) for sessions, flat YAML for infra config |
| Config | YAML (parsed with yaml) |

---

## 3. Infrastructure Database

The core differentiator. A YAML-based inventory of infrastructure the agent knows about.

### Location

```
~/.crux/infra.yaml          # primary infra config
~/.crux/profiles/            # named connection profiles
~/.crux/config.yaml          # crux settings (model, theme, etc.)
```

### Schema

```yaml
# ~/.crux/infra.yaml

hosts:
  web-prod-01:
    host: 10.0.1.10
    port: 22                  # optional, default 22
    user: deploy
    key: ~/.ssh/id_ed25519    # optional, falls back to agent
    jump: bastion-prod        # optional, references another host
    tags: [production, web, nginx]
    notes: "Primary LB, handles ~2k rps. Nginx config at /etc/nginx/"

  bastion-prod:
    host: bastion.example.com
    user: ops
    tags: [production, bastion]

  db-staging:
    host: staging-db.internal
    user: postgres
    jump: bastion-staging
    tags: [staging, postgres, rds]
    notes: "PostgreSQL 15, 32GB RAM, daily backups at 03:00 UTC"

clusters:
  prod-us:
    context: gke_myproject_us-central1_prod
    tags: [production, gke, us-central1]
    namespaces: [api, workers, monitoring, ingress]
    notes: "Main production cluster, 12 nodes"

  staging:
    context: k3s-staging
    tags: [staging, k3s]
    namespaces: [default, api]

groups:
  web-servers:
    match:
      tags: [web]
    description: "All web/LB servers"

  production:
    match:
      tags: [production]
    description: "All production infrastructure"
```

### How the Agent Uses It

The infra database is injected into the system prompt as structured context. When the agent needs to act on infrastructure, it resolves targets by name, tag, or group — no need for the user to specify IPs or connection details.

The agent can also **query** the infra database via a dedicated tool:

```
User: "which servers are running nginx?"
Agent: [calls infra_query(tags: ["nginx"])] → web-prod-01, web-prod-02
```

---

## 4. Safety Tiers

Every tool call is classified into a safety tier before execution.

### Tier Definitions

| Tier | Label | Behavior | Examples |
|---|---|---|---|
| 🟢 | [read](file:///home/yonder/projects/cog/src/providers/openai.ts#72-138) | Auto-execute, show output | [ls](file:///home/yonder/projects/cog/src/providers/openai.ts#37-59), `cat`, `kubectl get`, `docker ps`, `uptime` |
| 🟡 | `modify` | Show command → require `y/n` | `systemctl restart`, `kubectl scale`, `sed -i`, `chmod` |
| 🔴 | `destroy` | Show command + warning banner → require explicit `yes` | `rm -rf`, `kubectl delete`, `DROP TABLE`, `reboot` |

### Classification Strategy

1. **Static patterns** — A built-in ruleset maps commands/tools to tiers (e.g., `rm` → 🔴, `cat` → 🟢)
2. **Context escalation** — Production-tagged hosts automatically escalate commands one tier (🟢→🟡, 🟡→🔴)
3. **User override** — Config allows per-tool tier overrides:

```yaml
# ~/.crux/config.yaml
safety:
  overrides:
    systemctl restart: read    # I trust restarts on staging
  production_escalation: true  # default: true
  auto_approve_read: true      # default: true
```

### Implementation in Cog

This requires `cog`'s [onBeforeToolCall](file:///home/yonder/projects/cog/.playground/weather.ts#215-218) to support **async** (currently sync). This is a prerequisite patch to `cog`:

```typescript
// cog patch: make onBeforeToolCall async
onBeforeToolCall?: (
  tool: Tool<any>,
  args: Record<string, unknown>,
) => Promise<boolean | void> | boolean | void
```

---

## 5. Tool System

### 5.1 Built-in Core Tools

| Tool | Tier | Description |
|---|---|---|
| `exec_command` | Dynamic | Run a shell command locally or on a remote host via SSH |
| `read_file` | 🟢 | Read file contents (local or remote) |
| `write_file` | 🟡 | Write/create a file (local or remote) |
| `edit_file` | 🟡 | Apply a targeted edit (search & replace) |
| `infra_query` | 🟢 | Query the infrastructure database |
| `ssh_connect` | 🟢 | Establish/reuse SSH connection to a host |
| `kubectl` | Dynamic | Run kubectl commands against a cluster |
| `docker` | Dynamic | Run docker commands on a host |

#### `exec_command` — The Core Tool

```typescript
{
  id: 'exec_command',
  description: 'Execute a shell command locally or on a remote host',
  schema: {
    command:  { type: 'string', description: 'The command to execute' },
    host:     { type: 'string', description: 'Host name from infra db (omit for local)', required: false },
    timeout:  { type: 'number', description: 'Timeout in seconds (default: 30)', required: false },
    cwd:      { type: 'string', description: 'Working directory', required: false },
  }
}
```

The safety tier for `exec_command` is **dynamically classified** based on the command string and target host.

### 5.2 Extension System

Users can register custom tools via a plugin directory:

```
~/.crux/tools/
  deploy-check.ts     # custom tool
  db-snapshot.ts       # custom tool
```

Each file exports a tool definition compatible with `cog`'s [createTool](file:///home/yonder/projects/cog/src/tool.ts#46-51):

```typescript
// ~/.crux/tools/deploy-check.ts
import type { ToolDefinition } from 'crux'

export default {
  id: 'deploy_check',
  description: 'Verify deployment health after a release',
  tier: 'read',
  schema: { /* ... */ },
  execute: async (args, ctx) => { /* ... */ },
}
```

---

## 6. SSH Connection Manager

Persistent, multiplexed SSH connections managed by a connection pool.

### Design

```typescript
class SSHPool {
  // Get or create a connection to a host (by infra db name)
  async connect(hostName: string): Promise<SSHConnection>

  // Execute a command on a host
  async exec(hostName: string, command: string, opts?: ExecOpts): Promise<ExecResult>

  // Upload/download files
  async upload(hostName: string, local: string, remote: string): Promise<void>
  async download(hostName: string, remote: string, local: string): Promise<void>

  // Cleanup
  async disconnectAll(): Promise<void>
}
```

### Features

- **Jump host support** — Automatic tunneling through bastion hosts defined in infra.yaml
- **Connection reuse** — Same host reused across multiple tool calls in a session
- **Keepalive** — Periodic keepalive packets to prevent timeout
- **Graceful cleanup** — All connections closed when session ends or on SIGINT
- **Streaming output** — stdout/stderr streamed back in real-time for long-running commands

---

## 7. TUI Design (ink)

### Layout

```
┌─ crux ─────────────────────────────────────────────────────────┐
│ ┌─ Context ──────────────────────────────────────────────────┐ │
│ │ 🏷️ staging / k3s-staging    📡 db-staging (connected)      │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ 💭 Checking pod status in staging namespace...                 │
│                                                                │
│ ┌─ Tool Call ────────────────────────────────────────────────┐ │
│ │ 🟢 kubectl --context k3s-staging get pods -n api           │ │
│ │ NAME              READY   STATUS    RESTARTS   AGE         │ │
│ │ api-7d4b8c-x2k9f  1/1     Running   0          2h         │ │
│ │ api-7d4b8c-m3n1p  0/1     CrashLoop 5          2h         │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ I found a pod in CrashLoopBackOff. Let me check its logs...    │
│                                                                │
│ ┌─ Tool Call ────────────────────────────────────────────────┐ │
│ │ 🟢 kubectl logs api-7d4b8c-m3n1p -n api --tail=50         │ │
│ │ ...                                                        │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌─ Tool Call (awaiting confirmation) ────────────────────────┐ │
│ │ 🟡 kubectl rollout restart deployment/api -n api           │ │
│ │                                                            │ │
│ │ This will restart all pods in the api deployment.           │ │
│ │ [Y]es  [N]o  [E]dit                                       │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ ❯ _                                                            │
└────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|---|---|
| `<ContextBar>` | Shows active infra targets, connections, session name |
| `<ThinkingIndicator>` | Streaming reasoning/thinking display (dimmed) |
| `<AgentOutput>` | Markdown-rendered agent responses |
| `<ToolCallCard>` | Displays tool invocations with tier badge, output, confirmation UI |
| `<PromptInput>` | User input with history (up/down), multiline support |
| `<StatusBar>` | Token count, cost, step count, model name |

### Key Interactions

- **Ctrl+C** — Abort current agent run (uses `AbortSignal`)
- **Up/Down** — Input history navigation
- **Tab** — Autocomplete host/cluster names from infra db
- **`/session`** — Session management commands
- **`/infra`** — Browse/query infra database
- **`/model`** — Switch model mid-session

---

## 8. Session Management

### Storage

Sessions stored in SQLite:

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  name        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  messages    TEXT,  -- JSON serialized cog context
  metadata    TEXT   -- JSON: model, cost, tokens, infra targets used
);
```

### Features

- **Auto-save** — Context serialized after each agent turn
- **Resume** — `crux --session <name>` or `/session resume <name>`
- **List** — `/session list` shows recent sessions with summaries
- **Export** — `/session export` dumps as markdown for sharing/review

---

## 9. Configuration

```yaml
# ~/.crux/config.yaml

# Model configuration
model:
  provider: openai           # openai | openrouter | ollama | custom
  base_url: https://api.openai.com
  model: gpt-4o
  api_key_env: OPENAI_API_KEY  # env var name
  temperature: 0.3

# Agent behavior
agent:
  max_steps: 50
  instruction: |
    You are Crux, an expert infrastructure operations agent.
    You have access to the user's infrastructure inventory.
    Always verify before making destructive changes.
    Prefer investigating before acting.

# Safety
safety:
  production_escalation: true
  auto_approve_read: true
  overrides: {}

# TUI
ui:
  theme: dark                # dark | light | auto
  show_reasoning: true       # show thinking/reasoning blocks
  show_tokens: true          # show token count in status bar
  show_cost: true            # show estimated cost

# Tools
tools:
  plugin_dir: ~/.crux/tools
  disabled: []               # tool IDs to disable
```

---

## 10. Cog Prerequisites

Before building Crux, these patches should be applied to `cog`:

| Change | Impact | Description |
|---|---|---|
| Async [onBeforeToolCall](file:///home/yonder/projects/cog/.playground/weather.ts#215-218) | **Breaking** | Change return type to `Promise<boolean \| void> \| boolean \| void` to support confirmation prompts |
| Token usage in [GenerateResult](file:///home/yonder/projects/cog/src/types.ts#42-47) | Non-breaking | Add optional `usage?: { promptTokens: number, completionTokens: number }` |
| Provider extracts usage from response | Non-breaking | OpenAI provider passes through usage stats |

These are small, surgical changes. Crux can work around them initially (e.g., wrapping tools with confirmation logic), but the cleanest path is patching `cog` first.

---

## 11. Delivery Phases

### Phase 1 — Foundation (MVP)
- [ ] Project scaffold (TypeScript, ink, cog dependency)
- [ ] Config loader (`~/.crux/config.yaml`)
- [ ] Infra database loader (`~/.crux/infra.yaml`)
- [ ] Basic TUI: prompt input → agent response → streaming output
- [ ] `exec_command` tool (local only)
- [ ] `read_file` tool
- [ ] Safety tier classification (static patterns)
- [ ] Session storage (SQLite)

### Phase 2 — SSH & Remote Ops
- [ ] SSH connection pool (`ssh2`)
- [ ] `exec_command` remote execution
- [ ] Jump host / bastion support
- [ ] Remote file read/write
- [ ] `infra_query` tool
- [ ] Context bar showing active connections

### Phase 3 — Kubernetes & Advanced
- [ ] `kubectl` tool integration
- [ ] `docker` tool integration
- [ ] Production escalation logic
- [ ] Tool confirmation UI (Y/N/Edit)
- [ ] Session resume / history browser

### Phase 4 — Polish & Extensibility
- [ ] Custom tool plugin loading
- [ ] Tab-completion for infra targets
- [ ] Slash commands (`/session`, `/infra`, `/model`)
- [ ] Token/cost tracking in status bar
- [ ] Markdown rendering in agent output
- [ ] Session export

---

## 12. Project Structure

```
crux/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── app.tsx               # ink root component
│   │
│   ├── agent/
│   │   ├── controller.ts     # orchestrates cog, safety, infra
│   │   ├── instruction.ts    # system prompt builder
│   │   └── session.ts        # session persistence
│   │
│   ├── infra/
│   │   ├── database.ts       # infra.yaml loader & query engine
│   │   ├── ssh-pool.ts       # persistent SSH connection manager
│   │   └── types.ts          # Host, Cluster, Group types
│   │
│   ├── safety/
│   │   ├── classifier.ts     # command → tier classification
│   │   ├── patterns.ts       # built-in pattern rules
│   │   └── types.ts          # SafetyTier enum
│   │
│   ├── tools/
│   │   ├── exec-command.ts   # shell execution (local + remote)
│   │   ├── read-file.ts      # file reading
│   │   ├── write-file.ts     # file writing
│   │   ├── edit-file.ts      # targeted file editing
│   │   ├── infra-query.ts    # query infra database
│   │   ├── kubectl.ts        # kubernetes operations
│   │   ├── docker.ts         # docker operations
│   │   └── registry.ts       # tool registration + plugin loading
│   │
│   ├── ui/
│   │   ├── components/
│   │   │   ├── ContextBar.tsx
│   │   │   ├── AgentOutput.tsx
│   │   │   ├── ToolCallCard.tsx
│   │   │   ├── ThinkingIndicator.tsx
│   │   │   ├── PromptInput.tsx
│   │   │   ├── ConfirmationPrompt.tsx
│   │   │   └── StatusBar.tsx
│   │   └── theme.ts          # color palette, styles
│   │
│   └── config/
│       ├── loader.ts         # config.yaml parser
│       ├── defaults.ts       # default config values
│       └── types.ts          # Config types
│
├── package.json
├── tsconfig.json
└── README.md
```