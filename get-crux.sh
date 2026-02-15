#!/bin/bash
set -e

# Crux Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/elfenlabs/crux/master/get-crux.sh | bash

REPO="https://github.com/elfenlabs/crux.git"
INSTALL_DIR="$HOME/.crux"
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
if [ -d "$INSTALL_DIR" ]; then
  info "Updating existing installation at $INSTALL_DIR..."
  git -C "$INSTALL_DIR" pull --ff-only || error "Failed to update. Try removing $INSTALL_DIR and re-running."
else
  info "Cloning crux to $INSTALL_DIR..."
  git clone "$REPO" "$INSTALL_DIR" || error "Failed to clone repository."
fi

# ── Install dependencies ──────────────────────────────────
info "Installing dependencies..."
cd "$INSTALL_DIR"
bun install || error "Failed to install dependencies."

# ── Create global command ─────────────────────────────────
info "Installing crux command to $BIN_DIR..."

sudo tee "$BIN_DIR/crux" > /dev/null << EOF
#!/bin/bash
exec bun run "$INSTALL_DIR/src/index.ts" "\$@"
EOF

sudo chmod +x "$BIN_DIR/crux"

# ── Done ──────────────────────────────────────────────────
echo ""
success "crux installed successfully!"
echo ""
echo "  Run 'crux' from anywhere to get started."
echo ""
