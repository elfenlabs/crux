#!/bin/bash
set -e

# Crux Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/elfenlabs/crux/master/get-crux.sh | bash

REPO="https://github.com/elfenlabs/crux.git"
CRUX_HOME="$HOME/.crux"
REPO_DIR="$CRUX_HOME/repository"
BIN_DIR="/usr/local/bin"

info() { printf "\033[1;34m→\033[0m %s\n" "$1"; }
success() { printf "\033[1;32m✓\033[0m %s\n" "$1"; }
error() { printf "\033[1;31m✗\033[0m %s\n" "$1" >&2; exit 1; }

# ── Check git ──────────────────────────────────────────────
if ! command -v git &> /dev/null; then
  error "git is required but not installed. Please install git first."
fi

# ── Install bun if missing ─────────────────────────────────
if ! command -v bun &> /dev/null; then
  info "bun not found — installing..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun &> /dev/null; then
    error "Failed to install bun. Please install manually: https://bun.sh"
  fi
  success "bun installed"
else
  success "bun found at $(which bun)"
fi

# ── Clone or update repo ──────────────────────────────────
mkdir -p "$CRUX_HOME"

if [ -d "$REPO_DIR" ]; then
  info "Updating existing installation..."
  git -C "$REPO_DIR" pull --ff-only || error "Failed to update. Try removing $REPO_DIR and re-running."
else
  info "Cloning crux to $REPO_DIR..."
  git clone "$REPO" "$REPO_DIR" || error "Failed to clone repository."
fi

# ── Install dependencies ──────────────────────────────────
info "Installing dependencies..."
cd "$REPO_DIR"
bun install || error "Failed to install dependencies."

# ── Create global command ─────────────────────────────────
info "Installing crux command to $BIN_DIR..."

sudo tee "$BIN_DIR/crux" > /dev/null << EOF
#!/bin/bash
exec bun run "$REPO_DIR/src/index.ts" "\$@"
EOF

sudo chmod +x "$BIN_DIR/crux"

# ── Set up default config ─────────────────────────────────
CONFIG_FILE="$CRUX_HOME/config.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" << 'CONF'
model:
  provider: openai
  base_url: https://api.openai.com
  model: gpt-4o
  api_key_env: OPENAI_API_KEY
  temperature: 0.3

agent:
  max_steps: 50
CONF
  success "Config created at $CONFIG_FILE"
  info "Edit it to set your provider, model, and API key env var."
else
  success "Config already exists at $CONFIG_FILE"
fi

# ── Done ──────────────────────────────────────────────────
echo ""
success "crux installed successfully!"
echo ""
echo "  Run 'crux' from anywhere to get started."
echo ""
